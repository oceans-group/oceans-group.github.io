import {
  fetchAllSalesRecords, fetchAllExpenses, fetchAllPurchases,
  type SalesFilter, type SaleRecord, type ExpenseRecord, type PurchaseRecord, type LoadProgress,
} from './proxy'
import { monthlyCache, getSyncRegistry, type MonthlyCache } from './cache'
import { fetchKardex, type KardexMove } from './inventory'
import type { CatalogItem } from './proxy'

// ── Helpers de fechas ─────────────────────────────────────────────────────────

/** Días recientes que siempre se piden en vivo (pueden registrarse o corregirse documentos) */
const LIVE_DAYS = 8

function cutoffDate(now: Date): string {
  const d = new Date(now)
  d.setDate(d.getDate() - LIVE_DAYS)
  return d.toISOString().slice(0, 10)
}

function subtractDay(date: string): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function monthsBetween(start: string, end: string): string[] {
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
  // En UTC: con hora local, zonas al este de UTC daban el día anterior
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

function minDate(a: string, b: string) { return a < b ? a : b }

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
  const cutoff = cutoffDate(new Date())
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

/** Descarga los registros de un tramo de fechas dentro de un mes */
export type RangeFetcher<T> = (
  dateStart: string,
  dateEnd: string,
  month: string,
  onPageProgress: (p: LoadProgress) => void,
) => Promise<T[]>

/**
 * Carga un rango mes a mes:
 * - Mes cerrado (último día antes del cutoff): desde la caché; si no está, se descarga completo y se guarda.
 * - Mes que cruza el cutoff: la parte cerrada desde caché parcial (se renueva cada día) + el resto en vivo.
 * - Mes completamente reciente: en vivo, sin guardar.
 * Los meses sin registros no se guardan, para que aparezca un documento registrado tarde.
 * El resultado se recorta al rango pedido (los meses cerrados se guardan completos).
 */
export async function loadRangeWithCache<T extends { date_of_issue: string }>(
  startDate: string,
  endDate: string,
  fetchRange: RangeFetcher<T>,
  cache: MonthlyCache<T>,
  labelPrefix: string,
  onProgress?: (p: AnalyticsProgress) => void,
  now = new Date(),
): Promise<T[]> {
  const cutoff = cutoffDate(now)
  const lastCacheable = subtractDay(cutoff)
  const months = monthsBetween(startDate, endDate)
  const all: T[] = []
  let monthsDone = 0
  const monthsTotal = months.length

  const report = (label: string, phase: 'cache' | 'proxy') => {
    monthsDone++
    onProgress?.({ loaded: monthsDone, total: monthsTotal, label: labelPrefix + label, phase, monthsDone, monthsTotal })
  }

  for (const month of months) {
    const fullyCacheable = lastDay(month) < cutoff
    const straddlesCutoff = !fullyCacheable && firstDay(month) < cutoff
    const fetchMonth = (dateStart: string, dateEnd: string) =>
      fetchRange(dateStart, dateEnd, month, (p) => {
        onProgress?.({ ...p, phase: 'proxy', monthsDone, monthsTotal })
      })

    if (fullyCacheable) {
      if (await cache.isFullySynced(month)) {
        all.push(...await cache.getForMonths([month]))
        report(`${month} (caché)`, 'cache')
      } else {
        const recs = await fetchMonth(firstDay(month), lastDay(month))
        all.push(...recs)
        if (recs.length > 0) await cache.saveForMonth(month, recs)
        report(`${month} guardado`, 'proxy')
      }
    } else if (straddlesCutoff) {
      const cacheEnd = minDate(lastCacheable, endDate)
      if (await cache.getPartialEnd(month) === cacheEnd) {
        // La caché parcial es válida para el cutoff de hoy
        all.push(...(await cache.getForMonths([month])).filter((r) => r.date_of_issue <= cacheEnd))
      } else {
        const pre = await fetchMonth(firstDay(month), cacheEnd)
        all.push(...pre)
        if (pre.length > 0) await cache.saveForMonth(month, pre, { partial_end: cacheEnd })
      }
      if (cutoff <= endDate) all.push(...await fetchMonth(cutoff, minDate(lastDay(month), endDate)))
      report(`${month} (parcial + vivo)`, 'proxy')
    } else {
      all.push(...await fetchMonth(firstDay(month), minDate(lastDay(month), endDate)))
      report(`${month} (en vivo)`, 'proxy')
    }
  }

  return all.filter((r) => r.date_of_issue >= startDate && r.date_of_issue <= endDate)
}

type BaseFilter = Omit<SalesFilter, 'period' | 'dateStart' | 'dateEnd' | 'monthStart' | 'monthEnd'>

function makeFilter(base: BaseFilter, dateStart: string, dateEnd: string, month: string): SalesFilter {
  return { ...base, period: 'between_dates', dateStart, dateEnd, monthStart: month, monthEnd: month }
}

export function loadRecordsForRange(
  startDate: string,
  endDate: string,
  baseFilter: BaseFilter,
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<SaleRecord[]> {
  const fetch: RangeFetcher<SaleRecord> = (dateStart, dateEnd, month, onPage) =>
    fetchAllSalesRecords(makeFilter(baseFilter, dateStart, dateEnd, month), (p) =>
      onPage({ ...p, label: `${month} · pág ${p.loaded}/${p.total}` }))
  return loadRangeWithCache(startDate, endDate, fetch, monthlyCache('sales'), '', onProgress)
}

export function loadExpensesForRange(
  startDate: string,
  endDate: string,
  baseFilter: BaseFilter,
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<ExpenseRecord[]> {
  const fetch: RangeFetcher<ExpenseRecord> = (dateStart, dateEnd, month, onPage) =>
    fetchAllExpenses(makeFilter(baseFilter, dateStart, dateEnd, month), (p) =>
      onPage({ ...p, label: `Gastos ${month} · pág ${p.loaded}/${p.total}` }))
  return loadRangeWithCache(startDate, endDate, fetch, monthlyCache('expenses'), 'Gastos ', onProgress)
}

export function loadPurchasesForRange(
  startDate: string,
  endDate: string,
  baseFilter: BaseFilter,
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<PurchaseRecord[]> {
  const fetch: RangeFetcher<PurchaseRecord> = (dateStart, dateEnd, month, onPage) =>
    fetchAllPurchases(makeFilter(baseFilter, dateStart, dateEnd, month), (p) =>
      onPage({ ...p, label: `${month} · ${p.label}` }))
  return loadRangeWithCache(startDate, endDate, fetch, monthlyCache('purchases'), 'Compras ', onProgress)
}

/**
 * Kardex de los productos en un rango, con la misma caché por mes. Se piden todos los productos activos
 * (no solo los que se muestran) para que cambiar la categoría de un producto no deje meses incompletos.
 */
export function loadKardexForRange(
  startDate: string,
  endDate: string,
  items: Pick<CatalogItem, 'id' | 'internal_id'>[],
  onProgress?: (p: AnalyticsProgress) => void,
): Promise<KardexMove[]> {
  const fetch: RangeFetcher<KardexMove> = (dateStart, dateEnd, _month, onPage) => fetchKardex(items, dateStart, dateEnd, onPage)
  return loadRangeWithCache(startDate, endDate, fetch, monthlyCache('kardex'), 'Kardex ', onProgress)
}
