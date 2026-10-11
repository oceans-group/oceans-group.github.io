import {
  fetchAllSalesRecords, fetchAllExpenses, fetchAllPurchases,
  type SalesFilter, type SaleRecord, type ExpenseRecord, type PurchaseRecord, type LoadProgress,
} from './proxy'
import {
  isFullySynced, getPartialEnd, getRecordsForMonths, saveRecordsForMonth, getSyncRegistry,
  isExpenseFullySynced, getExpensePartialEnd, getExpensesForMonths, saveExpensesForMonth,
  isPurchaseFullySynced, getPurchasePartialEnd, getPurchasesForMonths, savePurchasesForMonth,
} from './cache'

// ── Helpers de fechas ─────────────────────────────────────────────────────────

const LIVE_DAYS = 8

function cutoffDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - LIVE_DAYS)
  return d.toISOString().slice(0, 10)
}

function subtractDay(date: string): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = []
  const parts1 = start.slice(0, 7).split('-')
  const parts2 = end.slice(0, 7).split('-')
  let y = parseInt(parts1[0]!), m = parseInt(parts1[1]!)
  const ey = parseInt(parts2[0]!), em = parseInt(parts2[1]!)
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

function firstDay(monthKey: string) { return `${monthKey}-01` }
function lastDay(monthKey: string) {
  const parts = monthKey.split('-')
  const y = parseInt(parts[0]!), m = parseInt(parts[1]!)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}

function minDate(a: string, b: string) { return a < b ? a : b }

/**
 * Un mes es COMPLETAMENTE cacheable si su último día está estrictamente antes del cutoff.
 * Un mes puede ser PARCIALMENTE cacheable si su primer día está antes del cutoff.
 */
export function isCacheable(monthKey: string): boolean {
  return lastDay(monthKey) < cutoffDate()
}

// ── Status público ────────────────────────────────────────────────────────────

export interface MonthStatus {
  month: string
  cached: boolean       // completamente en caché
  partialCached: boolean // parcialmente en caché (mes que cruza el cutoff)
  live: boolean         // hay parte en vivo
}

export async function getMonthsStatus(startDate: string, endDate: string): Promise<MonthStatus[]> {
  const months = monthsBetween(startDate, endDate)
  const registry = await getSyncRegistry()
  const cutoff = cutoffDate()
  const lastCacheable = subtractDay(cutoff)

  return months.map((m) => {
    const entry = registry[m]
    const fullyCacheable = lastDay(m) < cutoff

    return {
      month: m,
      cached: !!entry && !entry.partial_end,
      partialCached: !!entry?.partial_end && entry.partial_end === lastCacheable,
      live: !fullyCacheable,
    }
  })
}

// ── Carga inteligente ─────────────────────────────────────────────────────────

export interface AnalyticsProgress extends LoadProgress {
  phase: 'cache' | 'proxy'
  monthsDone: number
  monthsTotal: number
}

export async function loadRecordsForRange(
  startDate: string,
  endDate: string,
  baseFilter: Omit<SalesFilter, 'period' | 'dateStart' | 'dateEnd' | 'monthStart' | 'monthEnd'>,
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<SaleRecord[]> {
  const cutoff = cutoffDate()
  const lastCacheable = subtractDay(cutoff) // ej: "2026-05-11"

  const months = monthsBetween(startDate, endDate)
  const allRecords: SaleRecord[] = []
  let monthsDone = 0
  const monthsTotal = months.length

  const report = (label: string, phase: 'cache' | 'proxy') => {
    monthsDone++
    onProgress?.({ loaded: monthsDone, total: monthsTotal, label, phase, monthsDone, monthsTotal })
  }

  for (const month of months) {
    const fullyCacheable = lastDay(month) < cutoff
    const straddlesCutoff = !fullyCacheable && firstDay(month) < cutoff

    if (fullyCacheable) {
      // ── Mes completamente antes del cutoff → caché normal ──────────────────
      if (await isFullySynced(month)) {
        const recs = await getRecordsForMonths([month])
        allRecords.push(...recs)
        report(`${month} (caché)`, 'cache')
      } else {
        const filter = makeFilter(baseFilter, firstDay(month), lastDay(month), month)
        const recs = await fetchProxy(filter, month, monthsDone, monthsTotal, onProgress)
        allRecords.push(...recs)
        if (recs.length > 0) await saveRecordsForMonth(month, recs)
        report(`${month} guardado`, 'proxy')
      }
    } else if (straddlesCutoff) {
      // ── Mes que cruza el cutoff → parte en caché, parte en vivo ───────────

      // Parte cacheable: desde inicio del mes hasta lastCacheable
      const cacheEnd = minDate(lastCacheable, endDate)
      const cachedPartialEnd = await getPartialEnd(month)

      if (cachedPartialEnd === cacheEnd) {
        // La caché parcial es válida para el cutoff de hoy
        const recs = (await getRecordsForMonths([month]))
          .filter((r) => r.date_of_issue <= cacheEnd)
        allRecords.push(...recs)
      } else {
        // Caché parcial desactualizada o ausente → re-fetch
        const filterPre = makeFilter(baseFilter, firstDay(month), cacheEnd, month)
        const recsPre = await fetchProxy(filterPre, month, monthsDone, monthsTotal, onProgress)
        allRecords.push(...recsPre)
        if (recsPre.length > 0) {
          await saveRecordsForMonth(month, recsPre, { partial_end: cacheEnd })
        }
      }

      // Parte en vivo: desde cutoff hasta fin del mes (o endDate)
      if (cutoff <= endDate) {
        const liveEnd = minDate(lastDay(month), endDate)
        const filterLive = makeFilter(baseFilter, cutoff, liveEnd, month)
        const recsLive = await fetchProxy(filterLive, month, monthsDone, monthsTotal, onProgress)
        allRecords.push(...recsLive)
      }

      report(`${month} (parcial + vivo)`, 'proxy')
    } else {
      // ── Mes completamente en vivo ──────────────────────────────────────────
      const liveEnd = minDate(lastDay(month), endDate)
      const filter = makeFilter(baseFilter, firstDay(month), liveEnd, month)
      const recs = await fetchProxy(filter, month, monthsDone, monthsTotal, onProgress)
      allRecords.push(...recs)
      report(`${month} (en vivo)`, 'proxy')
    }
  }

  return allRecords
}

// ── Utilidades internas ───────────────────────────────────────────────────────

function makeFilter(
  base: Omit<SalesFilter, 'period' | 'dateStart' | 'dateEnd' | 'monthStart' | 'monthEnd'>,
  dateStart: string,
  dateEnd: string,
  month: string,
): SalesFilter {
  return { ...base, period: 'between_dates', dateStart, dateEnd, monthStart: month, monthEnd: month }
}

async function fetchProxy(
  filter: SalesFilter,
  month: string,
  monthsDone: number,
  monthsTotal: number,
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<SaleRecord[]> {
  return fetchAllSalesRecords(filter, (p) => {
    onProgress?.({ ...p, label: `${month} · pág ${p.loaded}/${p.total}`, phase: 'proxy', monthsDone, monthsTotal })
  })
}

// ── Gastos: carga inteligente con caché ───────────────────────────────────────

export async function loadExpensesForRange(
  startDate: string,
  endDate: string,
  baseFilter: Omit<SalesFilter, 'period' | 'dateStart' | 'dateEnd' | 'monthStart' | 'monthEnd'>,
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<ExpenseRecord[]> {
  const cutoff = cutoffDate()
  const lastCacheable = subtractDay(cutoff)
  const months = monthsBetween(startDate, endDate)
  const allExpenses: ExpenseRecord[] = []
  let monthsDone = 0
  const monthsTotal = months.length

  const report = (label: string, phase: 'cache' | 'proxy') => {
    monthsDone++
    onProgress?.({ loaded: monthsDone, total: monthsTotal, label, phase, monthsDone, monthsTotal })
  }

  for (const month of months) {
    const fullyCacheable = lastDay(month) < cutoff
    const straddlesCutoff = !fullyCacheable && firstDay(month) < cutoff

    const fetchExpenseMonth = async (dateStart: string, dateEnd: string) => {
      const filter = makeFilter(baseFilter, dateStart, dateEnd, month)
      return fetchAllExpenses(filter, (p) => {
        onProgress?.({ ...p, label: `Gastos ${month} · pág ${p.loaded}/${p.total}`, phase: 'proxy', monthsDone, monthsTotal })
      })
    }

    if (fullyCacheable) {
      if (await isExpenseFullySynced(month)) {
        allExpenses.push(...await getExpensesForMonths([month]))
        report(`Gastos ${month} (caché)`, 'cache')
      } else {
        const recs = await fetchExpenseMonth(firstDay(month), lastDay(month))
        allExpenses.push(...recs)
        if (recs.length > 0) await saveExpensesForMonth(month, recs)
        report(`Gastos ${month} guardado`, 'proxy')
      }
    } else if (straddlesCutoff) {
      const cacheEnd = minDate(lastCacheable, endDate)
      const cachedEnd = await getExpensePartialEnd(month)
      if (cachedEnd === cacheEnd) {
        const cached = (await getExpensesForMonths([month])).filter(r => r.date_of_issue <= cacheEnd)
        allExpenses.push(...cached)
      } else {
        const pre = await fetchExpenseMonth(firstDay(month), cacheEnd)
        allExpenses.push(...pre)
        if (pre.length > 0) await saveExpensesForMonth(month, pre, { partial_end: cacheEnd })
      }
      if (cutoff <= endDate) {
        const live = await fetchExpenseMonth(cutoff, minDate(lastDay(month), endDate))
        allExpenses.push(...live)
      }
      report(`Gastos ${month} (parcial + vivo)`, 'proxy')
    } else {
      const recs = await fetchExpenseMonth(firstDay(month), minDate(lastDay(month), endDate))
      allExpenses.push(...recs)
      report(`Gastos ${month} (en vivo)`, 'proxy')
    }
  }

  return allExpenses
}

// ── Compras: carga inteligente con caché ──────────────────────────────────────

export async function loadPurchasesForRange(
  startDate: string,
  endDate: string,
  baseFilter: Omit<SalesFilter, 'period' | 'dateStart' | 'dateEnd' | 'monthStart' | 'monthEnd'>,
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<PurchaseRecord[]> {
  const cutoff = cutoffDate()
  const lastCacheable = subtractDay(cutoff)
  const months = monthsBetween(startDate, endDate)
  const allPurchases: PurchaseRecord[] = []
  let monthsDone = 0
  const monthsTotal = months.length

  const report = (label: string, phase: 'cache' | 'proxy') => {
    monthsDone++
    onProgress?.({ loaded: monthsDone, total: monthsTotal, label, phase, monthsDone, monthsTotal })
  }

  for (const month of months) {
    const fullyCacheable = lastDay(month) < cutoff
    const straddlesCutoff = !fullyCacheable && firstDay(month) < cutoff

    const fetchPurchaseMonth = async (dateStart: string, dateEnd: string) => {
      const filter = makeFilter(baseFilter, dateStart, dateEnd, month)
      return fetchAllPurchases(filter, (p) => {
        onProgress?.({ ...p, label: `${month} · ${p.label}`, phase: 'proxy', monthsDone, monthsTotal })
      })
    }

    if (fullyCacheable) {
      if (await isPurchaseFullySynced(month)) {
        allPurchases.push(...await getPurchasesForMonths([month]))
        report(`Compras ${month} (caché)`, 'cache')
      } else {
        const recs = await fetchPurchaseMonth(firstDay(month), lastDay(month))
        allPurchases.push(...recs)
        // Un mes vacío no se guarda (cuesta una sola consulta): así aparece una compra
        // registrada tarde con fecha de ese mes, como el saldo inicial.
        if (recs.length > 0) await savePurchasesForMonth(month, recs)
        report(`Compras ${month} guardado`, 'proxy')
      }
    } else if (straddlesCutoff) {
      const cacheEnd = minDate(lastCacheable, endDate)
      const cachedEnd = await getPurchasePartialEnd(month)
      if (cachedEnd === cacheEnd) {
        const cached = (await getPurchasesForMonths([month])).filter(r => r.date_of_issue <= cacheEnd)
        allPurchases.push(...cached)
      } else {
        const pre = await fetchPurchaseMonth(firstDay(month), cacheEnd)
        allPurchases.push(...pre)
        if (pre.length > 0) await savePurchasesForMonth(month, pre, { partial_end: cacheEnd })
      }
      if (cutoff <= endDate) {
        const live = await fetchPurchaseMonth(cutoff, minDate(lastDay(month), endDate))
        allPurchases.push(...live)
      }
      report(`Compras ${month} (parcial + vivo)`, 'proxy')
    } else {
      const recs = await fetchPurchaseMonth(firstDay(month), minDate(lastDay(month), endDate))
      allPurchases.push(...recs)
      report(`Compras ${month} (en vivo)`, 'proxy')
    }
  }

  return allPurchases
}
