<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import '../../utils/charts'
import { useAnalyticsData } from '../../composables/useAnalyticsData'

const { activeRecords, expenses } = useAnalyticsData()

const monthlyBarData = computed(() => {
  const salesMap = new Map<string, number>()
  const expMap = new Map<string, number>()
  for (const r of activeRecords.value) {
    const m = r.date_of_issue.slice(0, 7)
    salesMap.set(m, (salesMap.get(m) ?? 0) + Number(r.total))
  }
  for (const e of expenses.value) {
    const m = e.date_of_issue.slice(0, 7)
    expMap.set(m, (expMap.get(m) ?? 0) + Number(e.total))
  }
  const labels = [...new Set([...salesMap.keys(), ...expMap.keys()])].sort()
  return {
    labels,
    datasets: [
      {
        label: 'Ventas (S/.)',
        data: labels.map((l) => salesMap.get(l) ?? 0),
        backgroundColor: '#2563eb',
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: 'Gastos diversos (S/.)',
        data: labels.map((l) => expMap.get(l) ?? 0),
        backgroundColor: '#dc2626',
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }
})

const monthlyBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'top' as const, labels: { font: { size: 12 }, usePointStyle: true, boxWidth: 8 } },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          ` S/. ${(ctx.parsed.y ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`,
      },
    },
    datalabels: {
      anchor: 'end' as const,
      align: 'end' as const,
      color: (ctx: { datasetIndex: number }) => ['#2563eb', '#dc2626'][ctx.datasetIndex] ?? '#64748b',
      font: { size: 9, weight: 'bold' as const },
      formatter: (value: number) => {
        if (!value) return '' // evita etiquetas en meses sin datos de esa serie
        return 'S/. ' + value.toLocaleString('es-PE', { minimumFractionDigits: 0 })
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
    y: {
      grid: { color: '#f1f5f9' },
      ticks: {
        font: { size: 11 }, color: '#64748b',
        callback: (v: number | string) => 'S/. ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 }),
      },
    },
  },
}
</script>

<template>
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Balance mensual</h2>
      <span class="section-hint">Usa "Rango de meses" para mejor visualización</span>
    </div>
    <div class="bar-chart-wrap">
      <Bar :data="monthlyBarData" :options="monthlyBarOptions" />
    </div>
  </div>
</template>
