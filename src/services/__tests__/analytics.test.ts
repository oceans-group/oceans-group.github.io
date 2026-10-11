import { describe, it, expect, vi } from 'vitest'
import { loadRangeWithCache, monthsBetween, type RangeFetcher } from '../analytics'
import type { MonthlyCache, SaveOptions } from '../cache'

interface Row { id: number; date_of_issue: string }

/** Caché en memoria con el mismo contrato que la de IndexedDB */
function memoryCache() {
  const months = new Map<string, { rows: Row[]; partial_end?: string }>()
  const cache: MonthlyCache<Row> = {
    async isFullySynced(m) { const e = months.get(m); return !!e && !e.partial_end },
    async getPartialEnd(m) { return months.get(m)?.partial_end ?? null },
    async getForMonths(ms) { return ms.flatMap((m) => months.get(m)?.rows ?? []) },
    async saveForMonth(m, rows, opts: SaveOptions = {}) { months.set(m, { rows, partial_end: opts.partial_end }) },
    async clearMonth(m) { months.delete(m) },
  }
  return { cache, months }
}

/** Fuente falsa: un registro por día del tramo pedido */
function dailyFetcher() {
  const fetch = vi.fn<RangeFetcher<Row>>(async (start, end) => {
    const rows: Row[] = []
    for (let d = new Date(start + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1))
      rows.push({ id: rows.length, date_of_issue: d.toISOString().slice(0, 10) })
    return rows
  })
  return fetch
}

// Hoy: 11/10/2026 → cutoff (8 días) = 03/10; la caché parcial de octubre llega hasta el 02/10
const NOW = new Date('2026-10-11T15:00:00Z')
const tramos = (fetch: ReturnType<typeof dailyFetcher>) => fetch.mock.calls.map(([s, e]) => `${s}..${e}`)

describe('monthsBetween', () => {
  it('incluye ambos extremos y cruza el año', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('loadRangeWithCache', () => {
  it('mes cerrado sin caché: descarga el mes completo, lo guarda y recorta al rango', async () => {
    const { cache, months } = memoryCache()
    const fetch = dailyFetcher()
    const rows = await loadRangeWithCache('2026-09-10', '2026-09-20', fetch, cache, '', undefined, NOW)
    expect(tramos(fetch)).toEqual(['2026-09-01..2026-09-30'])
    expect(months.get('2026-09')?.rows).toHaveLength(30)
    expect(rows.map((r) => r.date_of_issue)).toEqual(expect.arrayContaining(['2026-09-10', '2026-09-20']))
    expect(rows).toHaveLength(11)
  })

  it('mes cerrado en caché: no descarga y también recorta al rango', async () => {
    const { cache } = memoryCache()
    const fetch = dailyFetcher()
    await loadRangeWithCache('2026-09-01', '2026-09-30', fetch, cache, '', undefined, NOW)
    fetch.mockClear()
    const rows = await loadRangeWithCache('2026-09-25', '2026-09-30', fetch, cache, '', undefined, NOW)
    expect(fetch).not.toHaveBeenCalled()
    expect(rows).toHaveLength(6)
  })

  it('mes cerrado sin registros: no se guarda (un documento registrado tarde debe aparecer)', async () => {
    const { cache, months } = memoryCache()
    const fetch = vi.fn<RangeFetcher<Row>>(async () => [])
    await loadRangeWithCache('2026-08-01', '2026-08-31', fetch, cache, '', undefined, NOW)
    expect(months.has('2026-08')).toBe(false)
    await loadRangeWithCache('2026-08-01', '2026-08-31', fetch, cache, '', undefined, NOW)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('mes que cruza el cutoff: caché parcial hasta el día anterior + resto en vivo', async () => {
    const { cache, months } = memoryCache()
    const fetch = dailyFetcher()
    const rows = await loadRangeWithCache('2026-10-01', '2026-10-11', fetch, cache, '', undefined, NOW)
    expect(tramos(fetch)).toEqual(['2026-10-01..2026-10-02', '2026-10-03..2026-10-11'])
    expect(months.get('2026-10')).toMatchObject({ partial_end: '2026-10-02' })
    expect(rows).toHaveLength(11)

    // Mismo día: la parte cerrada sale de la caché, solo se pide lo reciente
    fetch.mockClear()
    await loadRangeWithCache('2026-10-01', '2026-10-11', fetch, cache, '', undefined, NOW)
    expect(tramos(fetch)).toEqual(['2026-10-03..2026-10-11'])
  })

  it('caché parcial de otro día: se vuelve a descargar la parte cerrada', async () => {
    const { cache } = memoryCache()
    await cache.saveForMonth('2026-10', [{ id: 1, date_of_issue: '2026-10-01' }], { partial_end: '2026-10-01' })
    const fetch = dailyFetcher()
    await loadRangeWithCache('2026-10-01', '2026-10-11', fetch, cache, '', undefined, NOW)
    expect(tramos(fetch)).toEqual(['2026-10-01..2026-10-02', '2026-10-03..2026-10-11'])
  })

  it('mes completamente reciente: en vivo y sin guardar', async () => {
    const { cache, months } = memoryCache()
    const fetch = dailyFetcher()
    // Hoy 05/10 → cutoff 27/09: todo octubre es reciente
    await loadRangeWithCache('2026-10-01', '2026-10-05', fetch, cache, '', undefined, new Date('2026-10-05T15:00:00Z'))
    expect(tramos(fetch)).toEqual(['2026-10-01..2026-10-05'])
    expect(months.size).toBe(0)
  })

  it('informa el avance con el prefijo del tipo de dato', async () => {
    const { cache } = memoryCache()
    const labels: string[] = []
    await loadRangeWithCache('2026-09-01', '2026-09-30', dailyFetcher(), cache, 'Gastos ', (p) => labels.push(p.label), NOW)
    expect(labels).toContain('Gastos 2026-09 guardado')
  })
})
