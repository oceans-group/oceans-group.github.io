import type { SaleRecord } from '../services/proxy'

/**
 * Decisión: la utilidad se calcula sin IGV a pagar; el resumen sigue mostrando las ventas totales.
 * - Facturas y boletas: se resta su IGV.
 * - Notas de venta: no se declaran, no pagan IGV → cuentan por su total.
 * - Costos del catálogo: sin IGV (crédito fiscal). Gastos diversos: tal como se registran.
 */
export const IGV_RATE = 0.18

/** Parte de la venta que queda para la empresa (0–1), descontado el IGV a pagar. */
export function netFactor(r: SaleRecord): number {
  if (r.source === 'sale_note') return 1
  const total = Number(r.total)
  if (!total) return 1
  // El reporte de ventas trae total_igv; si faltara, se asume gravado al 18 %
  const igv = r.total_igv != null ? Number(r.total_igv) : total - total / (1 + IGV_RATE)
  return (total - igv) / total
}
