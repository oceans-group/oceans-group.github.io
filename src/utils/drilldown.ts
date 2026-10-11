import type { SaleRecord, ExpenseRecord } from '../services/proxy'
import type { DrilldownDoc } from '../components/DrilldownModal.vue'

export function saleToDoc(r: SaleRecord): DrilldownDoc {
  return {
    key: `sale-${r.source ?? 'document'}-${r.id}`,
    date: r.date_of_issue,
    typeLabel: r.document_type_description,
    party: r.customer_name,
    partyNumber: r.customer_number,
    total: Number(r.total),
    kind: 'sale',
    raw: r,
  }
}

export function expenseToDoc(e: ExpenseRecord): DrilldownDoc {
  return {
    key: `expense-${e.id}`,
    date: e.date_of_issue,
    typeLabel: 'Gasto',
    party: e.supplier_name || '—',
    partyNumber: e.supplier_number || '—',
    total: Number(e.total),
    kind: 'expense',
    raw: e,
  }
}
