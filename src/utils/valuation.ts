import type { KardexMove } from '../services/inventory'

/** Grupo de un movimiento del kardex, según su tipo en facturaofitec */
export type MoveGroup = 'inicial' | 'compras' | 'ventas' | 'produccion' | 'mermas' | 'ajustes' | 'otros'

export const MOVE_GROUPS: MoveGroup[] = ['inicial', 'compras', 'ventas', 'produccion', 'mermas', 'ajustes', 'otros']

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/**
 * Clasifica el tipo de movimiento (incluye sus anulaciones: "Anulación Compra" es compra, con signo contrario).
 * Los motivos de Movimientos llegan con su nombre: "Inventario inicial", "Salida a producción", "Mermas"…
 */
export function classifyMove(type: string): MoveGroup {
  const t = norm(type)
  if (/INVENTARIO INICIAL|STOCK INICIAL/.test(t)) return 'inicial'
  if (/PRODUCCION|INSUMO|MOLINO|TRANSFORMACION/.test(t)) return 'produccion'
  if (/COMPRA|IMPORTACION/.test(t)) return 'compras'
  if (/\bVENTA\b/.test(t)) return 'ventas' // palabra completa: "inVENTArio" no es venta
  if (/MERMA|DESMEDRO|DESTRUCCION/.test(t)) return 'mermas'
  if (/STOCK REAL|AJUSTE|DIFERENCIA DE INVENTARIO/.test(t)) return 'ajustes'
  return 'otros'
}

export interface Snapshot { qty: number; value: number }

export interface ItemValuation {
  opening: Snapshot
  closing: Snapshot
  /** Costo promedio vigente al cierre (sin IGV) */
  avgCost: number
  inputs: Record<MoveGroup, number>
  outputs: Record<MoveGroup, number>
  /** Cierre de cada mes del rango (para la evolución) */
  monthly: { month: string; qty: number; value: number }[]
}

export interface ValuationParams {
  /** Movimientos del producto desde la fecha de corte HASTA HOY (cualquier orden), aunque el rango termine antes */
  moves: KardexMove[]
  /** Stock actual según facturaofitec: ancla del saldo, que se reconstruye hacia atrás con los movimientos */
  currentQty: number
  /** Costo del catálogo sin IGV: valoriza el stock inicial y lo que entra sin costo propio */
  catalogCost: number
  /** Costo unitario sin IGV de una compra (por número de documento); undefined si no se conoce */
  purchaseCost: (number: string) => number | undefined
  startDate: string
  endDate: string
}

const emptyGroups = () => Object.fromEntries(MOVE_GROUPS.map((g) => [g, 0])) as Record<MoveGroup, number>

function monthEnds(start: string, end: string): { month: string; last: string }[] {
  const out: { month: string; last: string }[] = []
  let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7))
  const ey = Number(end.slice(0, 4)), em = Number(end.slice(5, 7))
  while (y < ey || (y === ey && m <= em)) {
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    out.push({ month: `${y}-${String(m).padStart(2, '0')}`, last: last < end ? last : end })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/**
 * Valoriza un producto con costo promedio móvil:
 * - La cantidad se reconstruye hacia atrás desde el stock actual de facturaofitec restando las entradas y salidas.
 *   No se usa la columna "saldo" del kardex: filtrado por fechas, el reporte arranca su saldo desde un valor que
 *   no coincide con el stock real (p. ej. Stock Real de −18 513 a 0 mostrado con saldo 401).
 * - Cada compra recalcula el promedio: (stock previo × promedio + cantidad × costo de la compra) / stock nuevo.
 *   Con stock previo ≤ 0 el promedio pasa a ser el costo de la compra.
 * - El resto de entradas y todas las salidas van al promedio vigente (al inicio, el costo del catálogo).
 */
export function valueItem(p: ValuationParams): ItemValuation {
  const moves = [...p.moves].sort((a, b) => a.date_time.localeCompare(b.date_time) || a.id - b.id)
  // Saldo después de cada movimiento, hacia atrás desde el stock actual
  const after: number[] = Array.from({ length: moves.length }, () => 0)
  let qty = p.currentQty
  for (let i = moves.length - 1; i >= 0; i--) {
    after[i] = qty
    qty -= moves[i]!.input - moves[i]!.output
  }
  let avg = p.catalogCost
  let opening: Snapshot | null = null
  const inputs = emptyGroups(), outputs = emptyGroups()
  const ends = monthEnds(p.startDate, p.endDate)
  const monthly: ItemValuation['monthly'] = []
  let nextEnd = 0

  const snap = (): Snapshot => ({ qty, value: qty * avg })
  // Cierra los meses que terminan antes de la fecha del próximo movimiento
  const closeMonthsBefore = (date: string) => {
    while (nextEnd < ends.length && ends[nextEnd]!.last < date) monthly.push({ month: ends[nextEnd++]!.month, ...snap() })
  }

  for (const [i, mv] of moves.entries()) {
    const balance = after[i]!
    const date = mv.date_of_issue
    if (date > p.endDate) break
    if (!opening && date >= p.startDate) opening = snap()
    if (date >= p.startDate) closeMonthsBefore(date)

    const group = classifyMove(mv.type)
    if (group === 'compras' && mv.input > 0) {
      const cost = p.purchaseCost(mv.number) ?? avg
      const prev = balance - mv.input
      avg = prev <= 0 ? cost : (prev * avg + mv.input * cost) / (prev + mv.input)
    } else if (group === 'compras' && mv.output > 0 && /ANULACION/.test(norm(mv.type))) {
      // Anulación de compra (también cada edición de una compra): se revierte su efecto en el promedio
      const cost = p.purchaseCost(mv.number) ?? avg
      if (balance > 0) avg = ((balance + mv.output) * avg - mv.output * cost) / balance
    }
    qty = balance
    if (date >= p.startDate) {
      inputs[group] += mv.input
      outputs[group] += mv.output
    }
  }

  opening ??= snap()
  closeMonthsBefore('9999-12-31')
  return { opening, closing: snap(), avgCost: avg, inputs, outputs, monthly }
}
