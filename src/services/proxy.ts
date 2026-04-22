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
}

interface SalesResponse {
  data: SaleRecord[]
  meta: {
    current_page: number
    last_page: number
    total: number
    per_page: string
  }
}

export type Period = 'between_dates' | 'between_months' | 'month' | 'date'

export interface SalesFilter {
  period: Period
  dateStart: string
  dateEnd: string
  monthStart: string
  monthEnd: string
}

function buildParams(filter: SalesFilter, page: number) {
  return {
    period: filter.period,
    date_start: filter.dateStart,
    date_end: filter.dateEnd,
    month_start: filter.monthStart,
    month_end: filter.monthEnd,
    products: true,
    include_categories: false,
    apply_conversion_to_pen: false,
    page,
  }
}

async function fetchPage(filter: SalesFilter, page: number): Promise<SalesResponse> {
  const res = await proxy.get<SalesResponse>('/proxy/reports/sales/records', {
    params: buildParams(filter, page),
  })
  return res.data
}

export async function fetchAllSalesRecords(filter: SalesFilter): Promise<SaleRecord[]> {
  const first = await fetchPage(filter, 1)
  const { last_page } = first.meta

  if (last_page === 1) return first.data

  const rest = await Promise.all(
    Array.from({ length: last_page - 1 }, (_, i) => fetchPage(filter, i + 2)),
  )

  return [...first.data, ...rest.flatMap((r) => r.data)]
}
