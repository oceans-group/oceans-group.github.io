import { describe, it, expect } from 'vitest'
import { createAnalyticsData } from '../useAnalyticsData'
import type { SaleRecord, ExpenseRecord, PurchaseRecord, CatalogItem } from '../../services/proxy'

const item = (internal_id: string, quantity: number, total: number) =>
  ({ key: 0, id: 0, internal_id, description: `Producto ${internal_id}`, quantity, unit_price: '0', total: String(total), unit_type_id: 'NIU' })

const sale = (r: Partial<SaleRecord>): SaleRecord => ({
  id: 1, customer_id: 1, date_of_issue: '2026-09-15', customer_name: 'Cliente', customer_number: '1',
  document_type_description: 'Factura', document_type_id: '01', total: '0', items: [], payment_form: '',
  user_name: '', state_type_id: '05', source: 'document', ...r,
})

const catalogItem = (internal_id: string, cost: number): CatalogItem =>
  ({ id: 0, internal_id, description: `Producto ${internal_id}`, cost, stock: 0, stock_min: 0 })

function setup() {
  const d = createAnalyticsData()
  d.records.value = [
    // Factura: A x2 por 118 (100 + 18 de IGV) y C x1 por 11.80 (10 + 1.80)
    sale({ id: 1, total: '129.80', total_igv: '19.80', items: [item('A', 2, 118), item('C', 1, 11.8)], customer_number: '1' }),
    // Nota de venta: B x5 por 50, va completa
    sale({ id: 2, total: '50.00', source: 'sale_note', document_type_id: 'NV', items: [item('B', 5, 50)], customer_number: '2' }),
  ]
  // A: costo 30 (margen positivo) · B: sin costo · C: costo 25 > venta neta 10
  d.catalog.value = { A: catalogItem('A', 30), B: catalogItem('B', 0), C: catalogItem('C', 25) }
  d.expenses.value = [{ total: 20, date_of_issue: '2026-09-10' } as ExpenseRecord]
  return d
}

describe('utilidad', () => {
  it('ventas netas: facturas sin IGV, notas de venta completas', () => {
    expect(setup().netSales.value).toBeCloseTo(110 + 50)
  })

  it('costo de ventas solo de productos con costo; utilidad bruta y neta', () => {
    const d = setup()
    expect(d.costOfSales.value).toBeCloseTo(2 * 30 + 1 * 25)
    expect(d.grossProfit.value).toBeCloseTo(160 - 85)
    expect(d.netProfit.value).toBeCloseTo(160 - 85 - 20)
  })

  it('ventas sin costo se informan aparte', () => {
    expect(setup().uncostedSales.value).toBeCloseTo(50)
  })

  it('costos a revisar: sin costo y costo mayor que la venta', () => {
    const issues = setup().costIssues.value.map((i) => [i.internal_id, i.issue])
    expect(issues).toEqual(expect.arrayContaining([['B', 'sin-costo'], ['C', 'margen-negativo']]))
    expect(issues).toHaveLength(2)
  })

  it('sin catálogo no hay costos a revisar (la utilidad no se muestra)', () => {
    const d = setup()
    d.catalog.value = {}
    expect(d.costIssues.value).toEqual([])
  })
})

describe('compras', () => {
  it('el saldo inicial no cuenta como compra del periodo', () => {
    const d = createAnalyticsData()
    d.purchases.value = [
      { total: 100, is_opening_balance: false } as PurchaseRecord,
      { total: 5000, is_opening_balance: true } as PurchaseRecord,
    ]
    expect(d.totalPurchases.value).toBe(100)
    expect(d.openingBalanceTotal.value).toBe(5000)
  })
})

describe('clientes inactivos', () => {
  it('ordena por días sin comprar y, a igual días, por importe', () => {
    const d = createAnalyticsData()
    d.records.value = [
      sale({ customer_number: 'chico', customer_name: 'chico', total: '10', date_of_issue: '2026-09-01' }),
      sale({ customer_number: 'grande', customer_name: 'grande', total: '500', date_of_issue: '2026-09-01' }),
      sale({ customer_number: 'reciente', customer_name: 'reciente', total: '50', date_of_issue: '2026-09-20' }),
    ]
    expect(d.inactiveClients.value.map((c) => c.customer_number)).toEqual(['grande', 'chico', 'reciente'])
  })
})
