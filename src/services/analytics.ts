import { fetchAllSalesRecords, type SalesFilter, type SaleRecord, type LoadProgress } from './proxy'
import {
  isSynced,
  getRecordsForMonths,
  saveRecordsForMonth,
  getSyncRegistry,
} from './cache'

// ── Helpers de fechas ─────────────────────────────────────────────────────────

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
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

export function isCacheable(monthKey: string): boolean {
  return monthKey < currentMonthKey()
}

// ── Status público ────────────────────────────────────────────────────────────

export interface MonthStatus {
  month: string
  cached: boolean
  live: boolean
}

export async function getMonthsStatus(startDate: string, endDate: string): Promise<MonthStatus[]> {
  const months = monthsBetween(startDate, endDate)
  const registry = await getSyncRegistry()
  return months.map((m) => ({
    month: m,
    cached: !!registry[m],
    live: !isCacheable(m),
  }))
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
  const months = monthsBetween(startDate, endDate)
  const allRecords: SaleRecord[] = []
  let monthsDone = 0
  const monthsTotal = months.length

  for (const month of months) {
    const live = !isCacheable(month)
    const cached = live ? false : await isSynced(month)

    if (cached) {
      // Carga desde IndexedDB — instantáneo
      const recs = await getRecordsForMonths([month])
      allRecords.push(...recs)
      monthsDone++
      onProgress?.({
        loaded: monthsDone, total: monthsTotal,
        label: `${month} (caché)`,
        phase: 'cache', monthsDone, monthsTotal,
      })
    } else {
      // Descarga del proxy
      const filter: SalesFilter = {
        ...baseFilter,
        period: 'between_dates',
        dateStart: firstDay(month),
        dateEnd: lastDay(month),
        monthStart: month,
        monthEnd: month,
      }

      const recs = await fetchAllSalesRecords(filter, (p) => {
        onProgress?.({
          ...p,
          label: `${month} · pág ${p.loaded}/${p.total}`,
          phase: 'proxy', monthsDone, monthsTotal,
        })
      })

      allRecords.push(...recs)

      // Guardar en IndexedDB solo si es mes pasado (inmutable)
      if (!live && recs.length > 0) {
        await saveRecordsForMonth(month, recs)
      }

      monthsDone++
      onProgress?.({
        loaded: monthsDone, total: monthsTotal,
        label: live ? `${month} (en vivo)` : `${month} guardado`,
        phase: 'proxy', monthsDone, monthsTotal,
      })
    }
  }

  return allRecords
}
