import proxy from './api'
import { IGV_RATE } from '../utils/igv'

export interface SaleItem {
  key: number
  id: number
  internal_id: string
  description: string
  quantity: number
  unit_price: string
  total: string
  unit_type_id: string
}

export interface SaleRecord {
  id: number
  customer_id: number
  date_of_issue: string
  customer_name: string
  customer_number: string
  document_type_description: string
  document_type_id: string
  total: string
  /** IGV de facturas y boletas (viene en el reporte). Las notas de venta no lo usan: no se declaran. */
  total_igv?: string
  items: SaleItem[]
  payment_form: string
  user_name: string
  state_type_id: string
  source?: 'document' | 'sale_note'
}

export interface PagedResponse<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number; per_page: string }
}

type SalesResponse = PagedResponse<SaleRecord>

interface SaleNoteItemRaw {
  index: number
  description: string
  quantity: number
}

interface SaleNoteRaw {
  id: number
  customer_id: number
  date_of_issue: string
  customer_name: string
  customer_number: string
  total: string
  user_name: string
  state_type_id: string
  currency_type_id: string
  items_for_report: SaleNoteItemRaw[]
  payments_methods: string[]
  total_canceled: boolean
}

type SaleNotesResponse = PagedResponse<SaleNoteRaw>

export type Period = 'between_dates' | 'between_months' | 'month' | 'date'

export interface SalesFilter {
  period: Period
  dateStart: string
  dateEnd: string
  monthStart: string
  monthEnd: string
  personTypeIds: number[]
}

export interface PersonType {
  id: number
  description: string
}

export interface CustomerCacheEntry {
  person_type_id: number | null
  person_type: string
  telephone: string | null
  address: string | null
  birthday: string | null
  email: string | null
  state: string | null
  district: string | null
  province: string | null
  department: string | null
}

export interface LoadProgress {
  loaded: number
  total: number
  label: string
}

export async function fetchPersonTypes(): Promise<PersonType[]> {
  const res = await proxy.get<{ data: PersonType[] }>('/proxy/person-types/records')
  return res.data.data
}

interface CustomerRaw {
  id: number
  person_type_id: number | null
  person_type: string
  telephone: string | null
  address: string | null
  birthday: string | null
  email: string | null
  state: string | null
  district: { description: string } | null
  province: { description: string } | null
  department: { description: string } | null
}

function normalizeCustomer(c: CustomerRaw): CustomerCacheEntry {
  return {
    person_type_id: c.person_type_id,
    person_type: c.person_type || '',
    telephone: c.telephone || null,
    address: c.address || null,
    birthday: c.birthday || null,
    email: c.email || null,
    state: c.state || null,
    district: c.district?.description || null,
    province: c.province?.description || null,
    department: c.department?.description || null,
  }
}

export async function fetchAllCustomers(
  onProgress?: (loaded: number, total: number) => void,
): Promise<Record<string, CustomerCacheEntry>> {
  const first = await proxy.get<{ data: CustomerRaw[]; meta: { last_page: number } }>(
    '/proxy/persons/customers/records', { params: { page: 1 } },
  )
  const last_page: number = first.data.meta.last_page
  const allCustomers: CustomerRaw[] = [...first.data.data]
  let loaded = 1
  onProgress?.(loaded, last_page)

  for (let page = 2; page <= last_page; page += BATCH_SIZE) {
    const batch = Array.from(
      { length: Math.min(BATCH_SIZE, last_page - page + 1) },
      (_, i) => withRetry(() =>
        proxy.get<{ data: CustomerRaw[] }>('/proxy/persons/customers/records', { params: { page: page + i } })
          .then((r) => r.data.data),
      ),
    )
    const results = await Promise.all(batch)
    results.forEach((recs) => allCustomers.push(...recs))
    loaded += results.length
    onProgress?.(loaded, last_page)
  }

  const map: Record<string, CustomerCacheEntry> = {}
  for (const c of allCustomers) map[c.id] = normalizeCustomer(c)
  return map
}

// ── Utilidad: retry con backoff exponencial ───────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt === maxRetries) throw e
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)))
    }
  }
  throw new Error('unreachable')
}

// ── Utilidad: fetch paginado con concurrencia limitada ────────────────────────

const BATCH_SIZE = 5

export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PagedResponse<T>>,
  onProgress?: (p: LoadProgress, label: string) => void,
  label = '',
): Promise<T[]> {
  const first = await fetchPage(1)
  const { last_page } = first.meta

  if (onProgress) onProgress({ loaded: 1, total: last_page, label }, label)
  if (last_page === 1) return first.data

  const result = [...first.data]
  let loaded = 1

  for (let page = 2; page <= last_page; page += BATCH_SIZE) {
    const batch = Array.from(
      { length: Math.min(BATCH_SIZE, last_page - page + 1) },
      (_, i) => withRetry(() => fetchPage(page + i)),
    )
    const responses = await Promise.all(batch)
    loaded += responses.length
    result.push(...responses.flatMap((r) => r.data))
    if (onProgress) onProgress({ loaded, total: last_page, label }, label)
  }

  return result
}

// ── Params ────────────────────────────────────────────────────────────────────

function buildParams(filter: SalesFilter, page: number, products = true) {
  return {
    period: filter.period,
    date_start: filter.dateStart,
    date_end: filter.dateEnd,
    month_start: filter.monthStart,
    month_end: filter.monthEnd,
    products,
    include_categories: false,
    apply_conversion_to_pen: false,
    page,
  }
}

// ── Facturas / Boletas ────────────────────────────────────────────────────────

// Estados que no representan una venta real: '09' Rechazado (por SUNAT), '11' Anulado
const EXCLUDED_DOCUMENT_STATES = ['09', '11']

async function fetchSalesPage(filter: SalesFilter, page: number): Promise<SalesResponse> {
  const res = await proxy.get<SalesResponse>('/proxy/reports/sales/records', {
    params: buildParams(filter, page),
  })
  return {
    ...res.data,
    data: res.data.data.filter((d) => !EXCLUDED_DOCUMENT_STATES.includes(d.state_type_id)),
  }
}

// ── Notas de venta ────────────────────────────────────────────────────────────

// '11' Anulado; total_canceled === false significa que aún no se completó el pago
// (proforma/reserva registrada como Nota de Venta pero sin confirmar)
const VOIDED_NOTE_STATE = '11'

function normalizeSaleNote(note: SaleNoteRaw): SaleRecord {
  const docTotal = Number(note.total)
  const items = (note.items_for_report ?? []).map((raw, idx) => {
    const dashIdx = raw.description.indexOf(' - ')
    const internal_id = dashIdx > -1 ? raw.description.slice(0, dashIdx).trim() : `NV-${idx}`
    const description = dashIdx > -1 ? raw.description.slice(dashIdx + 3).trim() : raw.description
    const qty = Number(raw.quantity) || 1
    const itemTotal =
      note.items_for_report.length === 1
        ? docTotal
        : docTotal / note.items_for_report.length
    return {
      key: raw.index,
      id: 0,
      internal_id,
      description,
      quantity: qty,
      unit_price: (itemTotal / qty).toFixed(4),
      total: itemTotal.toFixed(2),
      unit_type_id: 'NIU',
    }
  })
  return {
    id: note.id,
    customer_id: note.customer_id,
    date_of_issue: note.date_of_issue,
    customer_name: note.customer_name,
    customer_number: note.customer_number,
    document_type_description: 'Nota de Venta',
    document_type_id: 'NV',
    total: note.total,
    items,
    payment_form: (note.payments_methods ?? []).join(', '),
    user_name: note.user_name,
    state_type_id: note.state_type_id,
    source: 'sale_note',
  }
}

async function fetchSaleNotesPage(filter: SalesFilter, page: number): Promise<SaleNotesResponse> {
  const res = await proxy.get<SaleNotesResponse>('/proxy/reports/sale-notes/records', {
    params: buildParams(filter, page, false),
  })
  return {
    ...res.data,
    data: res.data.data.filter((n) => n.state_type_id !== VOIDED_NOTE_STATE && n.total_canceled),
  }
}

// ── Gastos ────────────────────────────────────────────────────────────────────

export interface ExpenseRecord {
  id: number
  date_of_issue: string
  number: string
  supplier_name: string
  supplier_number: string
  currency_type_id: string
  total: number
  expense_type_description: string
  expense_reason_description: string
  state_type_id: string
  state_type_description: string
  external_id: string
}

type ExpensesResponse = PagedResponse<ExpenseRecord>

function buildExpenseParams(filter: SalesFilter, page: number) {
  return {
    period: filter.period,
    date_start: filter.dateStart,
    date_end: filter.dateEnd,
    month_start: filter.monthStart,
    month_end: filter.monthEnd,
    document_type_id: '',
    establishment_id: '',
    person_id: '',
    include_categories: false,
    page,
  }
}

async function fetchExpensesPage(filter: SalesFilter, page: number): Promise<ExpensesResponse> {
  const res = await proxy.get<ExpensesResponse>('/proxy/expenses/records', {
    params: buildExpenseParams(filter, page),
  })
  return {
    ...res.data,
    data: res.data.data.filter((e) => !EXCLUDED_DOCUMENT_STATES.includes(e.state_type_id)),
  }
}

export async function fetchAllExpenses(
  filter: SalesFilter,
  onProgress?: (p: LoadProgress) => void,
): Promise<ExpenseRecord[]> {
  return fetchAllPages(
    (p) => fetchExpensesPage(filter, p),
    onProgress ? (prog) => onProgress({ ...prog, label: `Gastos pág ${prog.loaded}/${prog.total}` }) : undefined,
  )
}

// ── Compras de mercadería ─────────────────────────────────────────────────────

export interface PurchaseItem {
  item_id: number
  internal_id: string
  description: string
  quantity: number
  unit_value: number // costo unitario sin IGV, en soles
  total: number // con IGV, en soles
  warehouse_id: number | null
}

export interface PurchaseRecord {
  id: number
  date_of_issue: string
  number: string
  document_type_id: string
  document_type_description: string
  supplier_name: string
  supplier_number: string
  currency_type_id: string
  exchange_rate: number
  // Montos en soles; negativos en notas de crédito
  total: number
  total_taxed: number
  total_igv: number
  state_type_id: string
  state_type_description: string
  payment_state: string
  /** Compra usada para cargar el inventario inicial: no es una compra real del periodo */
  is_opening_balance: boolean
  items: PurchaseItem[]
}

interface PurchaseListRaw {
  id: number
  date_of_issue: string
  number: string
  document_type_description: string
  supplier_name: string
  supplier_number: string
  currency_type_id: string
  total: string
  total_taxed: string
  total_igv: string
  state_type_id: string
  state_type_description: string
  state_type_payment_description: string
}

interface PurchaseDetailRaw {
  data: {
    purchase: {
      document_type_id: string
      exchange_rate_sale: string
      items: {
        item_id: number
        quantity: string
        unit_value: string
        total: string
        warehouse_id: number | null
        item: { internal_id: string | null; description: string }
      }[]
    }
  }
}

const OPENING_BALANCE_SUPPLIER = /SALDO\s+INICIAL/i
const CREDIT_NOTE = '07'

function buildPurchaseParams(filter: SalesFilter, page: number) {
  return {
    period: filter.period,
    date_start: filter.dateStart,
    date_end: filter.dateEnd,
    month_start: filter.monthStart,
    month_end: filter.monthEnd,
    page,
  }
}

async function fetchPurchasesPage(filter: SalesFilter, page: number): Promise<PagedResponse<PurchaseListRaw>> {
  const res = await proxy.get<PagedResponse<PurchaseListRaw>>('/proxy/reports/purchases/records', {
    params: buildPurchaseParams(filter, page),
  })
  return {
    ...res.data,
    data: res.data.data.filter((p) => !EXCLUDED_DOCUMENT_STATES.includes(p.state_type_id)),
  }
}

/** La lista no trae el código de cada producto: se completa con el detalle de la compra. */
async function fetchPurchase(row: PurchaseListRaw): Promise<PurchaseRecord> {
  const res = await proxy.get<PurchaseDetailRaw>(`/proxy/purchases/record/${row.id}`)
  const detail = res.data.data.purchase
  const exchangeRate = Number(detail.exchange_rate_sale) || 1
  const toPen = row.currency_type_id === 'USD' ? exchangeRate : 1
  const sign = detail.document_type_id === CREDIT_NOTE ? -1 : 1
  const amount = (v: string | number) => sign * Number(v) * toPen

  return {
    id: row.id,
    date_of_issue: row.date_of_issue,
    number: row.number,
    document_type_id: detail.document_type_id,
    document_type_description: row.document_type_description,
    supplier_name: row.supplier_name,
    supplier_number: row.supplier_number,
    currency_type_id: row.currency_type_id,
    exchange_rate: exchangeRate,
    total: amount(row.total),
    total_taxed: amount(row.total_taxed),
    total_igv: amount(row.total_igv),
    state_type_id: row.state_type_id,
    state_type_description: row.state_type_description,
    payment_state: row.state_type_payment_description,
    is_opening_balance: OPENING_BALANCE_SUPPLIER.test(row.supplier_name),
    items: detail.items.map((it) => ({
      item_id: it.item_id,
      internal_id: it.item.internal_id ?? String(it.item_id),
      description: it.item.description,
      quantity: sign * Number(it.quantity),
      unit_value: Number(it.unit_value) * toPen,
      total: amount(it.total),
      warehouse_id: it.warehouse_id,
    })),
  }
}

export async function fetchAllPurchases(
  filter: SalesFilter,
  onProgress?: (p: LoadProgress) => void,
): Promise<PurchaseRecord[]> {
  const rows = await fetchAllPages(
    (p) => fetchPurchasesPage(filter, p),
    onProgress ? (prog) => onProgress({ ...prog, label: `Compras pág ${prog.loaded}/${prog.total}` }) : undefined,
  )
  const result: PurchaseRecord[] = []
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => withRetry(() => fetchPurchase(row)))
    result.push(...await Promise.all(batch))
    onProgress?.({ loaded: result.length, total: rows.length, label: `Compras detalle ${result.length}/${rows.length}` })
  }
  return result
}

// ── Catálogo de productos (costos y stock) ────────────────────────────────────

export interface CatalogItem {
  id: number
  internal_id: string
  description: string
  /** Costo de compra unitario sin IGV, en soles (0 = sin costo cargado) */
  cost: number
  stock: number
  stock_min: number
  /** Categoría en facturaofitec: Materia prima, Producto terminado, Reventa, Servicio… ('' si no tiene) */
  category: string
}

interface CatalogItemRaw {
  id: number
  internal_id: string | null
  description: string
  purchase_unit_price: string // "S/ 21.00"
  purchase_has_igv_description: string // "Si" | "No"
  purchase_affectation_igv_type_id: string // "10" = gravado
  stock: string
  stock_min: string
  category_description?: string
  active?: boolean
}

const parseAmount = (s: string | number) => Number(String(s).replace(/[^0-9.-]/g, '')) || 0

export async function fetchProductCatalog(): Promise<CatalogItem[]> {
  const fetchPage = async (page: number) =>
    (await proxy.get<PagedResponse<CatalogItemRaw>>('/proxy/items/records', { params: { column: 'description', value: '', page } })).data
  // La API ya excluye los productos inhabilitados; se filtra igual por si cambia ese comportamiento.
  // Sus ventas antiguas se emparejan por nombre con el producto vigente (ver unitCost en useAnalyticsData).
  const raw = (await fetchAllPages(fetchPage)).filter((it) => it.active !== false)
  return raw.map((it) => {
    const price = parseAmount(it.purchase_unit_price)
    const priceIncludesIgv = it.purchase_has_igv_description === 'Si' && it.purchase_affectation_igv_type_id === '10'
    return {
      id: it.id,
      internal_id: it.internal_id ?? String(it.id),
      description: it.description,
      cost: priceIncludesIgv ? price / (1 + IGV_RATE) : price,
      stock: parseAmount(it.stock),
      stock_min: parseAmount(it.stock_min),
      category: (it.category_description ?? '').trim(),
    }
  })
}

// ── Fetch unificado con progreso ──────────────────────────────────────────────

export async function fetchAllSalesRecords(
  filter: SalesFilter,
  onProgress?: (p: LoadProgress) => void,
): Promise<SaleRecord[]> {
  const progress = { docs: { loaded: 0, total: 0 }, notes: { loaded: 0, total: 0 } }

  function report() {
    if (!onProgress) return
    const loaded = progress.docs.loaded + progress.notes.loaded
    const total = progress.docs.total + progress.notes.total
    onProgress({ loaded, total, label: `Página ${loaded} de ${total || '?'}` })
  }

  const [documents, saleNotes] = await Promise.all([
    fetchAllPages(
      (p) => fetchSalesPage(filter, p),
      ({ loaded, total }) => { progress.docs = { loaded, total }; report() },
      'docs',
    ),
    fetchAllPages(
      (p) => fetchSaleNotesPage(filter, p).then((r) => ({ ...r, data: r.data.map(normalizeSaleNote) })) as Promise<PagedResponse<SaleRecord>>,
      ({ loaded, total }) => { progress.notes = { loaded, total }; report() },
      'notes',
    ),
  ])

  return [
    ...documents.map((r) => ({ ...r, source: 'document' as const })),
    ...saleNotes,
  ]
}
