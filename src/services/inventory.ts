import proxy from './api'
import { fetchAllPages, type PagedResponse, type CatalogItem, type LoadProgress } from './proxy'

/**
 * Fecha de corte del inventario: el 11/10/2026 el cliente dejó todo el stock en 0 ("Stock Real") para cargar
 * el conteo inicial. Antes de esa fecha los saldos eran negativos y no sirven: el inventario empieza aquí.
 * Si el conteo se vuelve a hacer, actualizar esta fecha.
 */
export const INVENTORY_START = '2026-10-11'

// ── Kardex (Inventario → Reporte kardex de facturaofitec) ─────────────────────

/** Un movimiento del kardex de un producto (todos los almacenes) */
export interface KardexMove {
  id: number
  item_id: number
  internal_id: string
  /**
   * Fecha del movimiento = fecha de REGISTRO (no la del documento): el saldo del kardex sigue ese orden.
   * Se llama date_of_issue para usar la misma carga por rango y caché que ventas, gastos y compras.
   */
  date_of_issue: string
  /** Fecha y hora de registro: ordena los movimientos */
  date_time: string
  /** Fecha del documento ('' en ajustes sin documento) */
  doc_date: string
  /** Tipo según facturaofitec: Compra, Nota de venta, Stock Real, Salida a producción… */
  type: string
  /** Documento asociado (p. ej. NV03-35799, 1-1) o '-' */
  number: string
  input: number
  output: number
  /** Saldo según el reporte. NO usar para cantidades: filtrado por fechas no coincide con el stock real */
  balance: number
  /** Precio unitario del documento según el kardex (con IGV si el documento lo tiene) */
  unit_price: number
}

interface KardexRaw {
  id: number
  item_id: number
  date_time: string
  date_of_issue: string
  number: string
  type_transaction: string
  input: string | number
  output: string | number
  balance: number
  unit_price: string
}

// El kardex usa '-' para "sin cantidad" y las salidas vienen negativas ("-12.00")
const qty = (v: string | number) => (v === '-' || v === '' || v == null ? 0 : Math.abs(Number(v)) || 0)

function normalizeKardex(r: KardexRaw, internalId: string): KardexMove {
  return {
    id: r.id,
    item_id: r.item_id,
    internal_id: internalId,
    date_of_issue: r.date_time.slice(0, 10),
    date_time: r.date_time,
    doc_date: r.date_of_issue || '',
    type: r.type_transaction,
    number: r.number,
    input: qty(r.input),
    output: qty(r.output),
    balance: Number(r.balance) || 0,
    unit_price: Number(r.unit_price) || 0,
  }
}

async function fetchItemKardex(item: Pick<CatalogItem, 'id' | 'internal_id'>, dateStart: string, dateEnd: string): Promise<KardexMove[]> {
  const fetchPage = async (page: number) =>
    (await proxy.get<PagedResponse<KardexRaw>>('/proxy/reports/kardex/records', {
      params: { item_id: item.id, warehouse_id: 'all', date_start: dateStart, date_end: dateEnd, code: '', series: '', page },
    })).data
  return (await fetchAllPages(fetchPage)).map((r) => normalizeKardex(r, item.internal_id))
}

const ITEMS_IN_PARALLEL = 5

/** Kardex de varios productos en un tramo de fechas, de a 5 productos en paralelo */
export async function fetchKardex(
  items: Pick<CatalogItem, 'id' | 'internal_id'>[],
  dateStart: string,
  dateEnd: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<KardexMove[]> {
  const result: KardexMove[] = []
  for (let i = 0; i < items.length; i += ITEMS_IN_PARALLEL) {
    const batch = await Promise.all(items.slice(i, i + ITEMS_IN_PARALLEL).map((it) => fetchItemKardex(it, dateStart, dateEnd)))
    batch.forEach((moves) => result.push(...moves))
    const done = Math.min(i + ITEMS_IN_PARALLEL, items.length)
    onProgress?.({ loaded: done, total: items.length, label: `Kardex ${dateStart.slice(0, 7)} · producto ${done}/${items.length}` })
  }
  return result
}

// ── Stock actual (Inventario → Movimientos / Listado de inventario) ───────────

interface InventoryRowRaw {
  item_id: number
  item_internal_id: string
  warehouse_description: string
  stock: number | string
}

/** Stock actual por producto (suma de almacenes), según facturaofitec */
export async function fetchCurrentStock(): Promise<Record<string, number>> {
  const fetchPage = async (page: number) =>
    (await proxy.get<PagedResponse<InventoryRowRaw>>('/proxy/inventory/records', {
      params: { column: 'item_id', order: 'asc', value: '', page },
    })).data
  const stock: Record<string, number> = {}
  for (const r of await fetchAllPages(fetchPage)) stock[r.item_internal_id] = (stock[r.item_internal_id] ?? 0) + (Number(r.stock) || 0)
  return stock
}
