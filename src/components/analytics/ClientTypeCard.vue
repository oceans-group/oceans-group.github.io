<script setup lang="ts">
import { ref, computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { CHART_COLORS } from '../../utils/charts'
import { useAnalyticsData } from '../../composables/useAnalyticsData'

const { clientStats, customerMap } = useAnalyticsData()

type ClientTypeSortMode = 'total' | 'count'
const clientTypeSortMode = ref<ClientTypeSortMode>('total')

const clientTypeDonutData = computed(() => {
  const map = new Map<string, { total: number; count: number }>()
  for (const r of clientStats.value) {
    // Consulta directa al customerMap para evitar datos cacheados obsoletos
    const cm = customerMap.value[r.customer_id]
    const rawType = cm?.person_type ?? ''
    const key = rawType.trim() !== '' && rawType !== '—' ? rawType : 'Sin clasificar'
    const entry = map.get(key) ?? { total: 0, count: 0 }
    entry.total += r.total
    entry.count += r.count
    map.set(key, entry)
  }
  const entries = [...map.entries()].sort((a, b) =>
    clientTypeSortMode.value === 'total' ? b[1].total - a[1].total : b[1].count - a[1].count,
  )
  return {
    labels: entries.map(([k]) => k),
    datasets: [{
      data: entries.map(([, v]) => clientTypeSortMode.value === 'total' ? v.total : v.count),
      backgroundColor: CHART_COLORS,
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }
})

const clientTypeDonutOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' as const, labels: { font: { size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 } },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: number | null }) => {
          const vals = clientTypeDonutData.value.datasets[0]?.data ?? []
          const total = vals.reduce((a, b) => a + b, 0)
          const val = ctx.parsed ?? 0
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0'
          if (clientTypeSortMode.value === 'total')
            return ` S/. ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })} (${pct}%)`
          return ` ${val} docs (${pct}%)`
        },
      },
    },
    datalabels: {
      color: '#fff',
      font: { size: 11, weight: 'bold' as const },
      textStrokeColor: 'rgba(0,0,0,0.35)',
      textStrokeWidth: 2,
      formatter: (value: number) => {
        const vals = clientTypeDonutData.value.datasets[0]?.data ?? []
        const total = vals.reduce((a, b) => a + b, 0)
        const pct = total > 0 ? (value / total) * 100 : 0
        if (pct < 3) return '' // evita amontonar etiquetas en porciones muy chicas
        if (clientTypeSortMode.value === 'total')
          return [`S/. ${value.toLocaleString('es-PE', { minimumFractionDigits: 0 })}`, `${pct.toFixed(1)}%`]
        return [`${value} docs`, `${pct.toFixed(1)}%`]
      },
    },
  },
}))
</script>

<template>
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Participación por tipo de cliente</h2>
      <div class="sort-toggle">
        <button :class="{ active: clientTypeSortMode === 'total' }" @click="clientTypeSortMode = 'total'">Por importe</button>
        <button :class="{ active: clientTypeSortMode === 'count' }" @click="clientTypeSortMode = 'count'">Por cantidad</button>
      </div>
    </div>
    <div class="donut-wrap">
      <Doughnut :data="clientTypeDonutData" :options="clientTypeDonutOptions" />
    </div>
  </div>
</template>
