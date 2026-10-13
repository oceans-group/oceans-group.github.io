<script setup lang="ts">
import { ref, computed } from 'vue'
import { Bar } from 'vue-chartjs'
import type { ChartData } from 'chart.js'
import '../../utils/charts'
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { netFactor } from '../../utils/igv'
import { isMerchandiseExpense } from '../../services/inventory'

const { activeRecords, expenses, periodPurchases, catalogReady, recordCost } = useAnalyticsData()

type Mode = 'profit' | 'cash'
const selectedMode = ref<Mode>('profit')
// Sin catálogo no hay costo de ventas: solo se puede mostrar el flujo de caja
const mode = computed<Mode>(() => (catalogReady.value ? selectedMode.value : 'cash'))

interface MonthTotals { sales: number; netSales: number; cost: number; purchases: number; expenses: number }

const byMonth = computed(() => {
  const map = new Map<string, MonthTotals>()
  const get = (m: string) => {
    let t = map.get(m)
    if (!t) map.set(m, (t = { sales: 0, netSales: 0, cost: 0, purchases: 0, expenses: 0 }))
    return t
  }
  for (const r of activeRecords.value) {
    const t = get(r.date_of_issue.slice(0, 7))
    t.sales += Number(r.total)
    t.netSales += Number(r.total) * netFactor(r)
    t.cost += recordCost(r)
  }
  for (const e of expenses.value) {
    // Compras de mercadería registradas como gasto (hasta el 12/10): son compras, no gastos
    const t = get(e.date_of_issue.slice(0, 7))
    if (isMerchandiseExpense(e)) t.purchases += Number(e.total)
    else t.expenses += Number(e.total)
  }
  for (const p of periodPurchases.value) get(p.date_of_issue.slice(0, 7)).purchases += p.total
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
})

const BLUE = '#2563eb', PURPLE = '#7c3aed', AMBER = '#d97706', RED = '#dc2626', GREEN = '#16a34a'

function bar(label: string, data: number[], color: string) {
  return { type: 'bar' as const, label, data, backgroundColor: color, borderRadius: 4, borderSkipped: false, order: 2 }
}

function line(label: string, data: number[]) {
  return {
    type: 'line' as const, label, data, borderColor: GREEN, backgroundColor: GREEN,
    borderWidth: 2, pointRadius: 4, tension: 0.25, order: 1,
    datalabels: { align: 'top' as const, color: (ctx: { dataset: { data: unknown[] }; dataIndex: number }) => (Number(ctx.dataset.data[ctx.dataIndex]) >= 0 ? GREEN : RED) },
  }
}

const chartData = computed(() => {
  const months = byMonth.value
  const col = (f: (t: MonthTotals) => number) => months.map(([, t]) => f(t))
  const datasets = mode.value === 'profit'
    ? [
        bar('Ventas netas (S/.)', col((t) => t.netSales), BLUE),
        bar('Costo de ventas (S/.)', col((t) => t.cost), PURPLE),
        bar('Gastos diversos (S/.)', col((t) => t.expenses), RED),
        line('Utilidad neta (S/.)', col((t) => t.netSales - t.cost - t.expenses)),
      ]
    : [
        bar('Ventas (S/.)', col((t) => t.sales), BLUE),
        bar('Compras mercadería (S/.)', col((t) => t.purchases), AMBER),
        bar('Gastos diversos (S/.)', col((t) => t.expenses), RED),
        line('Flujo de caja (S/.)', col((t) => t.sales - t.purchases - t.expenses)),
      ]
  // Mezcla barras y línea: el tipo de vue-chartjs <Bar> solo admite datasets de barras
  return { labels: months.map(([m]) => m), datasets } as unknown as ChartData<'bar'>
})

const fmtSoles = (v: number) => 'S/. ' + v.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'top' as const, labels: { font: { size: 12 }, usePointStyle: true, boxWidth: 8 } },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          ` ${ctx.dataset.label ?? ''}: S/. ${(ctx.parsed.y ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`,
      },
    },
    datalabels: {
      anchor: 'end' as const,
      align: 'end' as const,
      color: (ctx: { dataset: { backgroundColor?: unknown } }) => String(ctx.dataset.backgroundColor ?? '#64748b'),
      font: { size: 9, weight: 'bold' as const },
      formatter: (value: number) => (value ? fmtSoles(value) : ''), // evita etiquetas en meses sin datos de esa serie
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
    y: {
      grid: { color: '#f1f5f9' },
      ticks: { font: { size: 11 }, color: '#64748b', callback: (v: number | string) => fmtSoles(Number(v)) },
    },
  },
}
</script>

<template>
  <div class="card">
    <div class="section-header">
      <div class="title-group">
        <h2 class="section-title">Estado de resultados mensual</h2>
        <span class="section-hint">
          <template v-if="mode === 'profit'">Ventas netas: facturas y boletas sin IGV, notas de venta completas · costo sin IGV · gastos tal como se registran</template>
          <template v-else>Entradas y salidas de dinero (con IGV)</template>
          · usa "Rango de meses" para comparar meses
        </span>
      </div>
      <div class="sort-toggle">
        <button
          :class="{ active: mode === 'profit' }"
          :disabled="!catalogReady"
          :title="catalogReady ? '' : 'Requiere el catálogo de productos'"
          @click="selectedMode = 'profit'"
        >
          Utilidad
        </button>
        <button :class="{ active: mode === 'cash' }" @click="selectedMode = 'cash'">Flujo de caja</button>
      </div>
    </div>
    <div class="bar-chart-wrap">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped>
.title-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.sort-toggle button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
