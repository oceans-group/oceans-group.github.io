import { describe, it, expect } from 'vitest'
import { classifyMove, valueItem, type ValuationParams } from '../valuation'
import type { KardexMove } from '../../services/inventory'

let seq = 0
/** Movimiento con saldo; la fecha/hora define el orden */
const mv = (date_time: string, type: string, input: number, output: number, balance: number, number = '-'): KardexMove => ({
  id: ++seq, item_id: 1, internal_id: 'P', date_of_issue: date_time.slice(0, 10), date_time, doc_date: '',
  type, number, input, output, balance, unit_price: 0,
})

const params = (moves: KardexMove[], over: Partial<ValuationParams> = {}): ValuationParams => ({
  moves, currentQty: 0, catalogCost: 5, purchaseCost: () => undefined,
  startDate: '2026-10-01', endDate: '2026-10-31', ...over,
})

describe('classifyMove', () => {
  it.each([
    ['Inventario inicial', 'inicial'], ['Stock inicial', 'inicial'],
    ['Compra', 'compras'], ['Anulación Compra', 'compras'], ['Entrada de importación', 'compras'],
    ['Nota de venta', 'ventas'], ['Anulación Nota de venta', 'ventas'], ['Venta', 'ventas'],
    ['Salida a producción', 'produccion'], ['Ingreso de producción', 'produccion'],
    ['Mermas', 'mermas'], ['Stock Real', 'ajustes'], ['Ajuste por diferencia de inventario', 'ajustes'],
    ['Donación', 'otros'],
  ])('%s → %s', (type, group) => expect(classifyMove(type)).toBe(group))
})

describe('valueItem', () => {
  it('inventario inicial al costo del catálogo, compra que mueve el promedio y venta al promedio', () => {
    const r = valueItem(params([
      mv('2026-10-11 10:00:00', 'Inventario inicial', 100, 0, 100),
      mv('2026-10-20 10:00:00', 'Compra', 50, 0, 150, 'C-1'),
      mv('2026-10-25 10:00:00', 'Nota de venta', 0, 30, 120),
    ], { currentQty: 120, purchaseCost: (n) => (n === 'C-1' ? 6 : undefined) }))
    expect(r.avgCost).toBeCloseTo((100 * 5 + 50 * 6) / 150)
    expect(r.closing.qty).toBe(120)
    expect(r.closing.value).toBeCloseTo(120 * (800 / 150))
    expect(r.inputs.inicial).toBe(100)
    expect(r.inputs.compras).toBe(50)
    expect(r.outputs.ventas).toBe(30)
  })

  it('compra con stock previo en cero o negativo: el promedio pasa a ser el costo de la compra', () => {
    const r = valueItem(params([
      mv('2026-10-12 09:00:00', 'Nota de venta', 0, 10, -10),
      mv('2026-10-12 10:00:00', 'Compra', 40, 0, 30, 'C-2'),
    ], { currentQty: 30, purchaseCost: () => 7 }))
    expect(r.avgCost).toBe(7)
  })

  it('editar una compra (anulación + compra) no desvía el promedio', () => {
    const base = [mv('2026-10-11 10:00:00', 'Stock Real', 12, 0, 12), mv('2026-10-11 11:00:00', 'Compra', 12, 0, 24, '1-1')]
    const once = valueItem(params(base, { currentQty: 24, purchaseCost: () => 8 }))
    const edited = valueItem(params([
      ...base,
      mv('2026-10-11 11:05:00', 'Anulación Compra', 0, 12, 12, '1-1'),
      mv('2026-10-11 11:05:00', 'Compra', 12, 0, 24, '1-1'),
      mv('2026-10-11 11:10:00', 'Anulación Compra', 0, 12, 12, '1-1'),
      mv('2026-10-11 11:10:00', 'Compra', 12, 0, 24, '1-1'),
    ], { currentQty: 24, purchaseCost: () => 8 }))
    expect(edited.avgCost).toBeCloseTo(once.avgCost)
    expect(edited.closing.qty).toBe(24)
  })

  it('stock inicial del rango y movimientos solo dentro del rango', () => {
    const r = valueItem(params([
      mv('2026-10-11 10:00:00', 'Inventario inicial', 100, 0, 100),
      mv('2026-10-15 10:00:00', 'Nota de venta', 0, 20, 80),
      mv('2026-10-21 10:00:00', 'Salida a producción', 0, 30, 50),
    ], { currentQty: 50, startDate: '2026-10-20' }))
    expect(r.opening).toEqual({ qty: 80, value: 400 })
    expect(r.outputs.ventas).toBe(0)
    expect(r.outputs.produccion).toBe(30)
    expect(r.closing.qty).toBe(50)
  })

  it('cierre por mes para la evolución', () => {
    const r = valueItem(params([
      mv('2026-10-11 10:00:00', 'Inventario inicial', 100, 0, 100),
      mv('2026-11-05 10:00:00', 'Mermas', 0, 10, 90),
    ], { currentQty: 90, startDate: '2026-10-01', endDate: '2026-12-15' }))
    expect(r.monthly).toEqual([
      { month: '2026-10', qty: 100, value: 500 },
      { month: '2026-11', qty: 90, value: 450 },
      { month: '2026-12', qty: 90, value: 450 },
    ])
  })

  it('el saldo se reconstruye desde el stock actual, sin usar la columna saldo del reporte', () => {
    // Saldos del reporte inventados (401): no deben influir
    const r = valueItem(params([
      mv('2026-10-11 22:06:00', 'Stock Real', 18513, 0, 401),
      mv('2026-10-15 10:00:00', 'Nota de venta', 0, 40, 361),
    ], { currentQty: -40 }))
    expect(r.closing.qty).toBe(-40)
    expect(r.opening.qty).toBe(-18513) // antes del ajuste a 0
  })

  it('movimientos posteriores al rango: cuentan para el saldo pero no en el periodo', () => {
    const r = valueItem(params([
      mv('2026-10-11 10:00:00', 'Inventario inicial', 100, 0, 100),
      mv('2026-11-03 10:00:00', 'Nota de venta', 0, 25, 75),
    ], { currentQty: 75, endDate: '2026-10-31' }))
    expect(r.closing.qty).toBe(100)
    expect(r.outputs.ventas).toBe(0)
  })

  it('sin movimientos: usa el stock actual al costo del catálogo', () => {
    const r = valueItem(params([], { currentQty: 7 }))
    expect(r.closing).toEqual({ qty: 7, value: 35 })
    expect(r.opening).toEqual({ qty: 7, value: 35 })
  })
})
