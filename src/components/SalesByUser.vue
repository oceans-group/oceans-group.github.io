<script setup lang="ts">
import { computed, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { Document } from '../services/documents'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps<{ documents: Document[] }>()

type UserSortKey = 'total' | 'count'
const sortKey = ref<UserSortKey>('total')

interface UserRow {
  user_name: string
  count: number
  total: number
  avg: number
}

const rows = computed<UserRow[]>(() => {
  const map = new Map<string, UserRow>()
  for (const d of props.documents) {
    const key = d.user_name
    const row = map.get(key) ?? { user_name: key, count: 0, total: 0, avg: 0 }
    row.count += 1
    row.total += Number(d.total)
    map.set(key, row)
  }
  return [...map.values()]
    .map((r) => ({ ...r, avg: r.total / r.count }))
    .sort((a, b) => b[sortKey.value] - a[sortKey.value])
})

const maxTotal = computed(() => rows.value[0]?.total ?? 1)
const maxCount = computed(() => rows.value[0]?.count ?? 1)

const chartData = computed(() => ({
  labels: rows.value.map((r) => r.user_name),
  datasets: [
    {
      label: 'Importe (S/.)',
      data: rows.value.map((r) => r.total),
      backgroundColor: rows.value.map((_, i) => `hsl(${220 + i * 30}, 70%, ${55 + i * 3}%)`),
      borderRadius: 6,
      borderSkipped: false,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { y: number | null } }) =>
          ` S/. ${(ctx.parsed.y ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: '#64748b' },
    },
    y: {
      grid: { color: '#f1f5f9' },
      ticks: {
        font: { size: 11 },
        color: '#64748b',
        callback: (v: number | string) =>
          'S/. ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 }),
      },
    },
  },
}

function fmt(n: number) {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2 })
}
</script>

<template>
  <div class="card-wrap">
    <div class="section-header">
      <h2 class="chart-title">Por vendedor / usuario</h2>
      <div class="sort-toggle">
        <button :class="{ active: sortKey === 'total' }" @click="sortKey = 'total'">Por importe</button>
        <button :class="{ active: sortKey === 'count' }" @click="sortKey = 'count'">Por cantidad</button>
      </div>
    </div>

    <div class="content-grid">
      <div class="chart-wrap">
        <Bar :data="chartData" :options="chartOptions" />
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Usuario</th>
              <th class="right">Docs</th>
              <th class="bar-col">Cant.</th>
              <th class="right">Importe (S/.)</th>
              <th class="bar-col">Import.</th>
              <th class="right">Ticket prom.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="row.user_name">
              <td class="rank">{{ i + 1 }}</td>
              <td class="name">{{ row.user_name }}</td>
              <td class="right mono">{{ row.count }}</td>
              <td class="bar-col">
                <div class="bar-track">
                  <div class="bar-fill purple" :style="{ width: (row.count / maxCount * 100).toFixed(1) + '%' }" />
                </div>
              </td>
              <td class="right mono">{{ fmt(row.total) }}</td>
              <td class="bar-col">
                <div class="bar-track">
                  <div class="bar-fill blue" :style="{ width: (row.total / maxTotal * 100).toFixed(1) + '%' }" />
                </div>
              </td>
              <td class="right mono">{{ fmt(row.avg) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-wrap {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 1.25rem 1.5rem;
  margin: 1.25rem 1.5rem 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.chart-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sort-toggle {
  display: flex;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}

.sort-toggle button {
  padding: 0.3rem 0.85rem;
  background: #fff;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sort-toggle button + button {
  border-left: 1px solid #e2e8f0;
}

.sort-toggle button.active {
  background: #2563eb;
  color: #fff;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

.chart-wrap {
  height: 260px;
  position: relative;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

thead tr {
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
}

th {
  padding: 0.55rem 0.7rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  text-align: left;
  white-space: nowrap;
}

tbody tr {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
}

tbody tr:hover {
  background: #f8fafc;
}

td {
  padding: 0.5rem 0.7rem;
  color: #334155;
}

.rank {
  width: 2rem;
  text-align: center;
  font-weight: 700;
  color: #94a3b8;
  font-size: 0.78rem;
}

.name {
  font-weight: 600;
  white-space: nowrap;
}

.right {
  text-align: right;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
}

.bar-col {
  width: 90px;
  padding-left: 0.5rem;
}

.bar-track {
  background: #f1f5f9;
  border-radius: 999px;
  height: 7px;
  width: 100%;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.bar-fill.purple { background: #7c3aed; }
.bar-fill.blue   { background: #2563eb; }
</style>
