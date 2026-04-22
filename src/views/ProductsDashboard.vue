<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { fetchAllSalesRecords, type SaleRecord } from '../services/proxy'

ChartJS.register(ArcElement, Tooltip, Legend)

const today = new Date().toISOString().slice(0, 10)
const firstOfMonth = today.slice(0, 8) + '01'

const startDate = ref(firstOfMonth)
const endDate = ref(today)
const records = ref<SaleRecord[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

type SortKey = 'quantity' | 'total'
const sortKey = ref<SortKey>('total')

interface ProductRow {
  internal_id: string
  description: string
  quantity: number
  total: number
}

const topProducts = computed<ProductRow[]>(() => {
  const map = new Map<string, ProductRow>()
  for (const record of records.value) {
    for (const item of record.items ?? []) {
      const key = item.internal_id
      const row = map.get(key) ?? { internal_id: item.internal_id, description: item.description, quantity: 0, total: 0 }
      row.quantity += Number(item.quantity)
      row.total += Number(item.total)
      map.set(key, row)
    }
  }
  return [...map.values()].sort((a, b) => b[sortKey.value] - a[sortKey.value])
})

const maxQuantity = computed(() => topProducts.value[0]?.quantity ?? 1)
const maxTotal = computed(() => topProducts.value[0]?.total ?? 1)

const CHART_COLORS = [
  '#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626',
  '#0891b2', '#9333ea', '#65a30d', '#ea580c', '#be185d',
]

const donutData = computed(() => {
  const top10 = topProducts.value.slice(0, 10)
  const otherTotal = topProducts.value.slice(10).reduce((s, p) => s + p.total, 0)
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
  },
}

function fmt(n: number) {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2 })
}

// ── Clientes por producto ────────────────────────────────────────────────────

type CxpSort = 'quantity' | 'total'
const selectedProduct = ref('')
const cxpSort = ref<CxpSort>('quantity')

const productOptions = computed(() =>
  [...topProducts.value].sort((a, b) => a.description.localeCompare(b.description)),
)

interface CustomerProductRow {
  customer_number: string
  customer_name: string
  quantity: number
  total: number
}

const customersByProduct = computed<CustomerProductRow[]>(() => {
  if (!selectedProduct.value) return []
  const map = new Map<string, CustomerProductRow>()
  for (const record of records.value) {
    for (const item of record.items ?? []) {
      if (item.internal_id !== selectedProduct.value) continue
      const key = record.customer_number
      const row = map.get(key) ?? {
        customer_number: record.customer_number,
        customer_name: record.customer_name,
        quantity: 0,
        total: 0,
      }
      row.quantity += Number(item.quantity)
      row.total += Number(item.total)
      map.set(key, row)
    }
  }
  return [...map.values()].sort((a, b) => b[cxpSort.value] - a[cxpSort.value])
})

const maxCxpQuantity = computed(() => customersByProduct.value[0]?.quantity ?? 1)
const maxCxpTotal = computed(() => customersByProduct.value[0]?.total ?? 1)

async function load() {
  if (!startDate.value || !endDate.value) return
  loading.value = true
  error.value = null
  try {
    records.value = await fetchAllSalesRecords(startDate.value, endDate.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar los datos'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="dashboard">
    <div class="filters card">
      <div class="filter-row">
        <label>
          Desde
          <input type="date" v-model="startDate" />
        </label>
        <label>
          Hasta
          <input type="date" v-model="endDate" />
        </label>
        <button class="btn-primary" @click="load" :disabled="loading">
          {{ loading ? 'Cargando…' : 'Buscar' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="card loading-state">
      <div class="spinner" />
      <p>Cargando productos desde el proxy…</p>
    </div>

    <template v-if="!loading && topProducts.length">
      <div class="card top-products">
        <div class="section-header">
          <h2 class="section-title">Top Productos</h2>
          <div class="sort-toggle">
            <button :class="{ active: sortKey === 'total' }" @click="sortKey = 'total'">Por importe</button>
            <button :class="{ active: sortKey === 'quantity' }" @click="sortKey = 'quantity'">Por cantidad</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Código</th>
                <th>Producto</th>
                <th class="right">Unidades</th>
                <th class="bar-col">Cant.</th>
                <th class="right">Importe (S/.)</th>
                <th class="bar-col">Import.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in topProducts" :key="p.internal_id">
                <td class="rank">{{ i + 1 }}</td>
                <td class="mono code">{{ p.internal_id }}</td>
                <td class="desc">{{ p.description }}</td>
                <td class="right mono">{{ p.quantity }}</td>
                <td class="bar-col">
                  <div class="bar-track">
                    <div class="bar-fill purple" :style="{ width: (p.quantity / maxQuantity * 100).toFixed(1) + '%' }" />
                  </div>
                </td>
                <td class="right mono">{{ fmt(p.total) }}</td>
                <td class="bar-col">
                  <div class="bar-track">
                    <div class="bar-fill blue" :style="{ width: (p.total / maxTotal * 100).toFixed(1) + '%' }" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card mix-card">
        <h2 class="section-title">Mix de productos — % del ingreso</h2>
        <div class="donut-wrap">
          <Doughnut :data="donutData" :options="donutOptions" />
        </div>
      </div>

      <div class="card">
        <div class="section-header">
          <h2 class="section-title">Clientes por producto</h2>
          <div class="cxp-controls">
            <select v-model="selectedProduct" class="product-select">
              <option value="">— Selecciona un producto —</option>
              <option v-for="p in productOptions" :key="p.internal_id" :value="p.internal_id">
                {{ p.description }}
              </option>
            </select>
            <div class="sort-toggle">
              <button :class="{ active: cxpSort === 'quantity' }" @click="cxpSort = 'quantity'">Por cantidad</button>
              <button :class="{ active: cxpSort === 'total' }" @click="cxpSort = 'total'">Por importe</button>
            </div>
          </div>
        </div>

        <div v-if="!selectedProduct" class="empty-hint">
          Selecciona un producto para ver qué clientes lo compran más.
        </div>

        <div v-else-if="customersByProduct.length === 0" class="empty-hint">
          Ningún cliente compró este producto en el rango seleccionado.
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>DNI/RUC</th>
                <th class="right">Unidades</th>
                <th class="bar-col">Cant.</th>
                <th class="right">Importe (S/.)</th>
                <th class="bar-col">Import.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in customersByProduct" :key="row.customer_number">
                <td class="rank">{{ i + 1 }}</td>
                <td>{{ row.customer_name }}</td>
                <td class="mono">{{ row.customer_number }}</td>
                <td class="right mono">{{ row.quantity }}</td>
                <td class="bar-col">
                  <div class="bar-track">
                    <div class="bar-fill purple" :style="{ width: (row.quantity / maxCxpQuantity * 100).toFixed(1) + '%' }" />
                  </div>
                </td>
                <td class="right mono">{{ fmt(row.total) }}</td>
                <td class="bar-col">
                  <div class="bar-track">
                    <div class="bar-fill blue" :style="{ width: (row.total / maxCxpTotal * 100).toFixed(1) + '%' }" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else-if="!loading" class="card empty">
      No hay datos para el rango seleccionado.
    </div>
  </div>
</template>

<style scoped>
*,*::before,*::after { box-sizing: border-box; }

.dashboard {
  padding-bottom: 2rem;
}

.card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  padding: 1.25rem 1.5rem;
  margin: 1.25rem 1.5rem 0;
}

.filters .filter-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

input[type='date'] {
  padding: 0.45rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #1e293b;
  background: #f8fafc;
  outline: none;
}

input[type='date']:focus { border-color: #3b82f6; background: #fff; }

.btn-primary {
  padding: 0.5rem 1.25rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  height: 36px;
}
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.error {
  margin: 1rem 1.5rem 0;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #dc2626;
  font-size: 0.9rem;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: #64748b;
  gap: 0.75rem;
}

.spinner {
  width: 36px; height: 36px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty {
  padding: 3rem;
  text-align: center;
  color: #94a3b8;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.section-title {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-header .section-title { margin-bottom: 0; }

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
.sort-toggle button + button { border-left: 1px solid #e2e8f0; }
.sort-toggle button.active { background: #2563eb; color: #fff; }

.table-wrap { overflow-x: auto; }

table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }

thead tr { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }

th {
  padding: 0.6rem 0.8rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  text-align: left;
  white-space: nowrap;
}

tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.1s; }
tbody tr:hover { background: #f8fafc; }

td { padding: 0.55rem 0.8rem; color: #334155; }

.rank { width: 2rem; text-align: center; font-weight: 700; color: #94a3b8; font-size: 0.8rem; }
.code { font-family: monospace; font-size: 0.8rem; color: #64748b; }
.desc { max-width: 280px; }
.right { text-align: right; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; }

.bar-col { width: 100px; padding-left: 0.5rem; }
.bar-track { background: #f1f5f9; border-radius: 999px; height: 8px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.bar-fill.purple { background: #7c3aed; }
.bar-fill.blue   { background: #2563eb; }

.cxp-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.product-select {
  padding: 0.35rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #1e293b;
  background: #f8fafc;
  outline: none;
  min-width: 260px;
  cursor: pointer;
}

.product-select:focus { border-color: #3b82f6; background: #fff; }

.empty-hint {
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9rem;
}

.donut-wrap {
  height: 320px;
  max-width: 700px;
  margin: 0 auto;
}
</style>
