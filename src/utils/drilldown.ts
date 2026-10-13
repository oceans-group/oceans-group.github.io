import type { SaleRecord, ExpenseRecord, PurchaseRecord } from '../services/proxy'
import type { DrilldownDoc } from '../components/DrilldownModal.vue'
import { isOpeningBalance } from '../services/inventory'

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

export function purchaseToDoc(p: PurchaseRecord): DrilldownDoc {
  return {
    key: `purchase-${p.id}`,
    date: p.date_of_issue,
    typeLabel: isOpeningBalance(p) ? 'Saldo inicial' : 'Compra',
    party: p.supplier_name || '—',
    partyNumber: p.supplier_number || '—',
    total: p.total,
    kind: 'purchase',
    raw: p,
  }
}
