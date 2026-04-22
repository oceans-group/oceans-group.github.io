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

function buildParams(startDate: string, endDate: string, page: number) {
  return {
    period: 'month',
    date_start: startDate,
    date_end: endDate,
    month_start: startDate.slice(0, 7),
    month_end: endDate.slice(0, 7),
    products: true,
    include_categories: false,
    apply_conversion_to_pen: false,
    page,
  }
}

async function fetchPage(startDate: string, endDate: string, page: number): Promise<SalesResponse> {
  const res = await proxy.get<SalesResponse>('/proxy/reports/sales/records', {
    params: buildParams(startDate, endDate, page),
  })
  return res.data
}

export async function fetchAllSalesRecords(startDate: string, endDate: string): Promise<SaleRecord[]> {
  const first = await fetchPage(startDate, endDate, 1)
  const { last_page } = first.meta

  if (last_page === 1) return first.data

  const rest = await Promise.all(
    Array.from({ length: last_page - 1 }, (_, i) => fetchPage(startDate, endDate, i + 2)),
  )

  return [...first.data, ...rest.flatMap((r) => r.data)]
}
