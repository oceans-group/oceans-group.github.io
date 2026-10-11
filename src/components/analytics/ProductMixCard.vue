<script setup lang="ts">
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { CHART_COLORS } from '../../utils/charts'
import { useAnalyticsData } from '../../composables/useAnalyticsData'

const { productStats } = useAnalyticsData()

const donutData = computed(() => {
  // Siempre por importe para que el % de ingreso sea correcto,
  // independiente del sort activo en la tabla (cantidad vs importe)
  const byTotal = [...productStats.value].sort((a, b) => b.total - a.total)
  const top10 = byTotal.slice(0, 10)
  const otherTotal = byTotal.slice(10).reduce((s, p) => s + p.total, 0)
  const labels = top10.map((p) => p.description)
  const data = top10.map((p) => p.total)
  if (otherTotal > 0) {
    labels.push('Otros')
    data.push(otherTotal)
  }
  return {
    labels,
    datasets: [{
      data,
      backgroundColor: [...CHART_COLORS, '#94a3b8'],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }
})

const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: { font: { size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 },
    },
    tooltip: {
      callbacks: {
        label: (ctx: { label: string; parsed: number | null }) => {
          const total = (donutData.value.datasets[0]?.data ?? []).reduce((a, b) => a + b, 0)
          const val = ctx.parsed ?? 0
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0'
          return ` S/. ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })} (${pct}%)`
        },
      },
    },
    datalabels: {
      color: '#fff',
      font: { size: 11, weight: 'bold' as const },
      textStrokeColor: 'rgba(0,0,0,0.35)',
      textStrokeWidth: 2,
      formatter: (value: number) => {
        const data = donutData.value.datasets[0]?.data ?? []
        const total = data.reduce((a, b) => a + b, 0)
        const pct = total > 0 ? (value / total) * 100 : 0
        if (pct < 3) return '' // evita amontonar etiquetas en porciones muy chicas
        return [`S/. ${value.toLocaleString('es-PE', { minimumFractionDigits: 0 })}`, `${pct.toFixed(1)}%`]
      },
    },
  },
}
</script>

<template>
  <div class="card">
    <h2 class="section-title">Mix de productos — % del ingreso</h2>
    <div class="donut-wrap">
      <Doughnut :data="donutData" :options="donutOptions" />
    </div>
  </div>
</template>
