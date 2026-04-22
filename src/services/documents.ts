import api from './api'

export interface Document {
  id: number
  number: string
  date_of_issue: string
  date_of_due: string
  customer_name: string
  customer_number: string
  document_type_description: string
  document_type_id: string
  currency_type_id: string
  total: number
  total_taxed: string
  total_igv: string
  state_type_id: string
  state_type_description: string
  user_name: string
  user_email: string
  soap_type_description: string
  external_id: string
  download_pdf: string
  download_xml: string
  created_at: string
}

export interface DocumentsResponse {
  data: Document[]
}

export function fetchDocuments(startDate: string, endDate: string): Promise<DocumentsResponse> {
  return api.get<DocumentsResponse>(`/documents/lists/${startDate}/${endDate}`).then((r) => r.data)
}
