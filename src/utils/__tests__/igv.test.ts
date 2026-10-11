import { describe, it, expect } from 'vitest'
import { netFactor } from '../igv'
import type { SaleRecord } from '../../services/proxy'

const sale = (r: Partial<SaleRecord>) => ({ total: '0', items: [], ...r }) as SaleRecord

describe('netFactor', () => {
  it('factura/boleta: descuenta el IGV del documento', () => {
    expect(netFactor(sale({ total: '118.00', total_igv: '18.00', source: 'document' }))).toBeCloseTo(100 / 118)
  })

  it('nota de venta: va completa (no se declara, no paga IGV)', () => {
    expect(netFactor(sale({ total: '50.00', total_igv: '7.63', source: 'sale_note' }))).toBe(1)
  })

  it('documento sin total_igv: asume gravado al 18 %', () => {
    expect(netFactor(sale({ total: '118.00', source: 'document' }))).toBeCloseTo(1 / 1.18)
  })

  it('documento exonerado (IGV 0): va completo', () => {
    expect(netFactor(sale({ total: '80.00', total_igv: '0.00', source: 'document' }))).toBe(1)
  })
})
