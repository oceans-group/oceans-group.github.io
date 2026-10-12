<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Bar } from 'vue-chartjs'
import '../../utils/charts'
import { useAnalyticsData, type InventoryRow } from '../../composables/useAnalyticsData'
import { INVENTORY_START } from '../../services/inventory'
import { fmt } from '../../utils/format'

const {
  loadedRange, catalogReady, inventoryLoading, inventoryProgress, inventoryError, inventoryRange, inventoryRows, loadInventory,
} = useAnalyticsData()

onMounted(loadInventory)
watch(loadedRange, loadInventory)

const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

// ── Columnas netas por tipo de movimiento ───────────────────────────────────

const net = (r: InventoryRow, ...groups: (keyof InventoryRow['valuation']['inputs'])[]) =>
  groups.reduce((s, g) => s + r.valuation.inputs[g] - r.valuation.outputs[g], 0)

type Filter = 'all' | 'stock' | 'alerts'
const filter = ref<Filter>('stock')

function alerts(r: InventoryRow): string[] {
  const out: string[] = []
  if (r.valuation.closing.qty < 0) out.push('Stock negativo')
  else if (r.stockMin > 0 && r.valuation.closing.qty < r.stockMin) out.push('Bajo mínimo')
  return out
}

const hasMoves = (r: InventoryRow) =>
  Object.values(r.valuation.inputs).some((v) => v) || Object.values(r.valuation.outputs).some((v) => v)

const rows = computed(() =>
  inventoryRows.value
    .filter((r) => filter.value === 'all'
      || (filter.value === 'stock' && (r.valuation.closing.qty !== 0 || r.valuation.opening.qty !== 0 || hasMoves(r)))
      || (filter.value === 'alerts' && alerts(r).length > 0))
    .sort((a, b) => b.valuation.closing.value - a.valuation.closing.value),
)

// ── Totales ─────────────────────────────────────────────────────────────────

const totals = computed(() => {
  const t = { opening: 0, closing: 0, negatives: 0, belowMin: 0, byCategory: new Map<string, number>() }
  for (const r of inventoryRows.value) {
    t.opening += r.valuation.opening.value
    t.closing += r.valuation.closing.value
    if (r.valuation.closing.qty < 0) t.negatives++
    else if (r.stockMin > 0 && r.valuation.closing.qty < r.stockMin) t.belowMin++
    const cat = r.category || 'Sin categoría'
    t.byCategory.set(cat, (t.byCategory.get(cat) ?? 0) + r.valuation.closing.value)
  }
  return t
})

const hasCategories = computed(() => inventoryRows.value.some((r) => r.category))

// ── Evolución mensual del valor ─────────────────────────────────────────────

const monthlyData = computed(() => {
  const byMonth = new Map<string, number>()
  for (const r of inventoryRows.value) for (const m of r.valuation.monthly) byMonth.set(m.month, (byMonth.get(m.month) ?? 0) + m.value)
  const months = [...byMonth.keys()].sort()
  return {
    labels: months,
    datasets: [{ label: 'Valor del inventario al cierre (S/.)', data: months.map((m) => byMonth.get(m) ?? 0), backgroundColor: '#0891b2', borderRadius: 4 }],
  }
})

const monthlyOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      anchor: 'end' as const, align: 'end' as const, color: '#0891b2', font: { size: 10, weight: 'bold' as const },
      formatter: (v: number) => 'S/. ' + v.toLocaleString('es-PE', { maximumFractionDigits: 0 }),
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: { grid: { color: '#f1f5f9' }, ticks: { callback: (v: number | string) => 'S/. ' + Number(v).toLocaleString('es-PE', { maximumFractionDigits: 0 }) } },
  },
}
</script>

<template>
  <div v-if="!catalogReady" class="card empty">Se necesita el catálogo de productos para valorizar el inventario.</div>

  <div v-else-if="loadedRange && loadedRange.end < INVENTORY_START" class="card empty">
    El inventario empieza el {{ fmtDate(INVENTORY_START) }} (conteo inicial). Elige un rango que llegue a esa fecha.
  </div>

  <div v-else-if="inventoryLoading" class="card empty">
    Cargando kardex… <span v-if="inventoryProgress">{{ inventoryProgress.label }}</span>
  </div>

  <div v-else-if="inventoryError" class="error">{{ inventoryError }}</div>

  <template v-else-if="inventoryRange">
    <div class="card">
      <div class="section-header">
        <div class="title-group">
          <h2 class="section-title">Inventario valorizado</h2>
          <span class="section-hint">
            Del {{ fmtDate(inventoryRange.start) }} al {{ fmtDate(inventoryRange.end) }} · desde el conteo inicial
            ({{ fmtDate(INVENTORY_START) }}) · stock según facturaofitec · costo promedio: compras a su costo, el resto al costo del catálogo · sin IGV
          </span>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi">
          <span class="kpi-label">Valor al cierre</span>
          <span class="kpi-value">S/. {{ fmt(totals.closing) }}</span>
          <!-- Si el rango empieza el día del corte, el "inicio" es antes del ajuste a 0 (saldos negativos viejos) -->
          <span v-if="inventoryRange.start > INVENTORY_START" class="kpi-sub">al inicio S/. {{ fmt(totals.opening) }}</span>
          <span v-else class="kpi-sub">desde el conteo inicial</span>
        </div>
        <template v-if="hasCategories">
          <div v-for="[cat, value] in totals.byCategory" :key="cat" class="kpi">
            <span class="kpi-label">{{ cat }}</span>
            <span class="kpi-value small">S/. {{ fmt(value) }}</span>
          </div>
        </template>
        <div class="kpi" :class="{ warn: totals.negatives }">
          <span class="kpi-label">Stock negativo</span>
          <span class="kpi-value">{{ totals.negatives }}</span>
        </div>
        <div class="kpi" :class="{ warn: totals.belowMin }">
          <span class="kpi-label">Bajo mínimo</span>
          <span class="kpi-value">{{ totals.belowMin }}</span>
        </div>
      </div>
      <p v-if="!hasCategories" class="note">
        Ningún producto tiene categoría todavía: las recargas y la maquila aparecen como inventario. Con la categoría
        <strong>Servicio</strong> en facturaofitec se excluyen solas; con Materia prima / Producto terminado / Reventa el valor se separa.
      </p>
    </div>

    <div class="card">
      <div class="section-header">
        <h2 class="section-title">Movimientos por producto</h2>
        <div class="sort-toggle">
          <button :class="{ active: filter === 'stock' }" @click="filter = 'stock'">Con stock o movimientos</button>
          <button :class="{ active: filter === 'alerts' }" @click="filter = 'alerts'">Con alertas</button>
          <button :class="{ active: filter === 'all' }" @click="filter = 'all'">Todos</button>
        </div>
      </div>
      <div v-if="!rows.length" class="empty-hint">No hay productos para este filtro.</div>
      <div v-else class="table-scroll tall">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th v-if="hasCategories">Categoría</th>
              <th class="right">Stock inicial</th>
              <th class="right" title="Inventario inicial y Stock Real (neto)">Inv. inicial / ajustes</th>
              <th class="right">Compras</th>
              <th class="right" title="Ingreso de producción − salida a producción">Producción</th>
              <th class="right">Ventas</th>
              <th class="right">Mermas</th>
              <th class="right" title="Otros motivos (neto)">Otros</th>
              <th class="right">Stock final</th>
              <th class="right">Costo prom.</th>
              <th class="right">Valor (S/.)</th>
              <th>Alertas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.internal_id">
              <td class="mono code">{{ r.internal_id }}</td>
              <td class="desc">{{ r.description }}</td>
              <td v-if="hasCategories" class="type-cell">{{ r.category || '—' }}</td>
              <td class="right mono">{{ qtyFmt(r.valuation.opening.qty) }}</td>
              <td class="right mono">{{ qtyFmt(net(r, 'inicial', 'ajustes')) }}</td>
              <td class="right mono">{{ qtyFmt(net(r, 'compras')) }}</td>
              <td class="right mono">{{ qtyFmt(net(r, 'produccion')) }}</td>
              <td class="right mono">{{ qtyFmt(-net(r, 'ventas')) }}</td>
              <td class="right mono">{{ qtyFmt(-net(r, 'mermas')) }}</td>
              <td class="right mono">{{ qtyFmt(net(r, 'otros')) }}</td>
              <td class="right mono strong" :class="{ negative: r.valuation.closing.qty < 0 }">{{ qtyFmt(r.valuation.closing.qty) }}</td>
              <td class="right mono">{{ fmt(r.valuation.avgCost) }}</td>
              <td class="right mono strong">{{ fmt(r.valuation.closing.value) }}</td>
              <td>
                <span v-for="a in alerts(r)" :key="a" class="badge">{{ a }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="monthlyData.labels.length > 1" class="card">
      <h2 class="section-title">Evolución del valor del inventario</h2>
      <div class="bar-chart-wrap">
        <Bar :data="monthlyData" :options="monthlyOptions" />
      </div>
    </div>
  </template>
</template>

<style scoped>
.title-group { display: flex; flex-direction: column; gap: 0.2rem; }

.kpis { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.kpi {
  display: flex; flex-direction: column; gap: 0.15rem;
  min-width: 150px; padding: 0.65rem 0.9rem;
  border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;
}
.kpi.warn { border-color: #fcd34d; background: #fffbeb; }
.kpi-label { font-size: 0.68rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-size: 1.1rem; font-weight: 800; color: #0f172a; }
.kpi-value.small { font-size: 0.95rem; }
.kpi-sub { font-size: 0.72rem; color: #64748b; }

.note { margin: 0.9rem 0 0; font-size: 0.8rem; color: #92400e; background: #fffbeb; border-radius: 6px; padding: 0.6rem 0.8rem; }

.table-scroll.tall { max-height: 520px; }
.strong { font-weight: 700; }
.negative { color: #dc2626; }
.badge {
  display: inline-block; margin: 0.1rem 0.25rem 0.1rem 0; padding: 0.1rem 0.45rem;
  border-radius: 999px; font-size: 0.68rem; font-weight: 700; white-space: nowrap;
  background: #fef3c7; color: #b45309;
}
</style>
