<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import type { Document } from '../services/documents'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = defineProps<{ documents: Document[] }>()

const chartData = computed(() => {
  const byDay = new Map<string, { total: number; count: number }>()

  for (const d of props.documents) {
    const date = d.date_of_issue
    const entry = byDay.get(date) ?? { total: 0, count: 0 }
    entry.total += Number(d.total)
    entry.count += 1
    byDay.set(date, entry)
  }

  const labels = [...byDay.keys()].sort()
  const totals = labels.map((l) => byDay.get(l)!.total)
  const counts = labels.map((l) => byDay.get(l)!.count)

  return {
    labels,
    datasets: [
      {
        label: 'Importe (S/.)',
        data: totals,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        pointBackgroundColor: '#2563eb',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Nº documentos',
        data: counts,
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.08)',
        pointBackgroundColor: '#7c3aed',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
        yAxisID: 'y2',
      },
    ],
  }
})

const options = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { font: { size: 12 }, usePointStyle: true, boxWidth: 8 },
    },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
          const val = ctx.parsed.y ?? 0
          if (ctx.dataset.label?.startsWith('Importe')) {
            return ` S/. ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
          }
          return ` ${val} docs`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { color: '#f1f5f9' },
      ticks: { font: { size: 11 }, color: '#64748b' },
    },
    y: {
      position: 'left' as const,
      grid: { color: '#f1f5f9' },
      ticks: {
        font: { size: 11 },
        color: '#2563eb',
        callback: (v: number | string) =>
          'S/. ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 }),
      },
    },
    y2: {
      position: 'right' as const,
      grid: { drawOnChartArea: false },
      ticks: { font: { size: 11 }, color: '#7c3aed' },
    },
  },
}
</script>

<template>
  <div class="chart-card">
    <h2 class="chart-title">Ventas en el tiempo</h2>
    <div class="chart-wrap">
      <Line :data="chartData" :options="options" />
    </div>
  </div>
</template>

<style scoped>
.chart-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 1.25rem 1.5rem;
  margin: 1.25rem 1.5rem 0;
}

.chart-title {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chart-wrap {
  height: 280px;
  position: relative;
}
</style>
