import axios from 'axios'

const proxy = axios.create({
  baseURL: import.meta.env.VITE_PROXY_URL,
})

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
  date_of_issue: string
  customer_name: string
  customer_number: string
  document_type_description: string
  document_type_id: string
  total: string
  items: SaleItem[]
  payment_form: string
  user_name: string
  state_type_id: string
  source?: 'document' | 'sale_note'
}

interface SalesResponse {
  data: SaleRecord[]
  meta: { current_page: number; last_page: number; total: number; per_page: string }
}

interface SaleNoteItemRaw {
  index: number
  description: string
  quantity: number
}

interface SaleNoteRaw {
  id: number
  date_of_issue: string
  customer_name: string
  customer_number: string
  total: string
  user_name: string
  state_type_id: string
  currency_type_id: string
  items_for_report: SaleNoteItemRaw[]
  payments_methods: string[]
}

interface SaleNotesResponse {
  data: SaleNoteRaw[]
  meta: { current_page: number; last_page: number; total: number; per_page: string }
}

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

export async function fetchPersonTypes(): Promise<PersonType[]> {
  const res = await proxy.get<{ data: PersonType[] }>('/proxy/person-types/records')
  return res.data.data
}

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

async function fetchSalesPage(filter: SalesFilter, page: number): Promise<SalesResponse> {
  const res = await proxy.get<SalesResponse>('/proxy/reports/sales/records', {
    params: buildParams(filter, page),
  })
  return res.data
}

async function fetchAllSalesPages(filter: SalesFilter): Promise<SaleRecord[]> {
  const first = await fetchSalesPage(filter, 1)
  const { last_page } = first.meta
  if (last_page === 1) return first.data
  const rest = await Promise.all(
    Array.from({ length: last_page - 1 }, (_, i) => fetchSalesPage(filter, i + 2)),
  )
  return [...first.data, ...rest.flatMap((r) => r.data)]
}

// ── Notas de venta ────────────────────────────────────────────────────────────

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
  return res.data
}

async function fetchAllSaleNotes(filter: SalesFilter): Promise<SaleRecord[]> {
  const first = await fetchSaleNotesPage(filter, 1)
  const { last_page } = first.meta
  if (last_page === 1) return first.data.map(normalizeSaleNote)
  const rest = await Promise.all(
    Array.from({ length: last_page - 1 }, (_, i) => fetchSaleNotesPage(filter, i + 2)),
  )
  return [...first.data, ...rest.flatMap((r) => r.data)].map(normalizeSaleNote)
}

// ── Fetch unificado ───────────────────────────────────────────────────────────

export async function fetchAllSalesRecords(filter: SalesFilter): Promise<SaleRecord[]> {
  const [documents, saleNotes] = await Promise.all([
    fetchAllSalesPages(filter),
    fetchAllSaleNotes(filter),
  ])
  return [
    ...documents.map((r) => ({ ...r, source: 'document' as const })),
    ...saleNotes,
  ]
}
