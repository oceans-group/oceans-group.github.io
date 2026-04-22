<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchDocuments, type Document } from '../services/documents'
import SalesOverTime from '../components/SalesOverTime.vue'
import SalesByUser from '../components/SalesByUser.vue'

const today = new Date().toISOString().slice(0, 10)
const firstOfMonth = today.slice(0, 8) + '01'

const startDate = ref(firstOfMonth)
const endDate = ref(today)
const documents = ref<Document[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const sortKey = ref<keyof Document>('date_of_issue')
const sortAsc = ref(false)
const search = ref('')

const stateColors: Record<string, string> = {
  '01': '#6b7280',
  '03': '#2563eb',
  '05': '#16a34a',
  '07': '#dc2626',
  '09': '#9ca3af',
  '11': '#d97706',
  '13': '#7c3aed',
}

const documentTypeLabels: Record<string, string> = {
  '01': 'Factura',
  '03': 'Boleta',
  '07': 'N. Crédito',
  '08': 'N. Débito',
  NE: 'N. Venta',
  '09': 'Guía',
}

async function load() {
  if (!startDate.value || !endDate.value) return
  loading.value = true
  error.value = null
  try {
    const response = await fetchDocuments(startDate.value, endDate.value)
    documents.value = response.data
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Error al cargar los documentos'
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return documents.value.filter(
    (d) =>
      !q ||
      d.number.toLowerCase().includes(q) ||
      d.customer_name.toLowerCase().includes(q) ||
      d.customer_number.includes(q) ||
      d.user_name.toLowerCase().includes(q),
  )
})

const sorted = computed(() => {
  return [...filtered.value].sort((a, b) => {
    const va = a[sortKey.value]
    const vb = b[sortKey.value]
    const cmp = String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0
    return sortAsc.value ? cmp : -cmp
  })
})

function toggleSort(key: keyof Document) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

function sortIcon(key: keyof Document) {
  if (sortKey.value !== key) return '↕'
  return sortAsc.value ? '↑' : '↓'
}

const totalAmount = computed(() =>
  documents.value.reduce((s, d) => s + Number(d.total), 0).toFixed(2),
)

const acceptedCount = computed(
  () => documents.value.filter((d) => d.state_type_id === '05').length,
)

const byType = computed(() => {
  const counts: Record<string, number> = {}
  for (const d of documents.value) {
    const label = documentTypeLabels[d.document_type_id] ?? d.document_type_description
    counts[label] = (counts[label] ?? 0) + 1
  }
  return counts
})

function fmt(n: number | string) {
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2 })
}

type CustomerSortKey = 'count' | 'total'
const customerSortKey = ref<CustomerSortKey>('total')

interface CustomerRow {
  customer_number: string
  customer_name: string
  count: number
  total: number
}

const topCustomers = computed<CustomerRow[]>(() => {
  const map = new Map<string, CustomerRow>()
  for (const d of documents.value) {
    const key = d.customer_number
    const row = map.get(key) ?? {
      customer_number: d.customer_number,
      customer_name: d.customer_name,
      count: 0,
      total: 0,
    }
    row.count += 1
    row.total += Number(d.total)
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b[customerSortKey.value] - a[customerSortKey.value])
})

const maxCustomerTotal = computed(() => topCustomers.value[0]?.total ?? 1)
const maxCustomerCount = computed(() => topCustomers.value[0]?.count ?? 1)

onMounted(load)
</script>

<template>
  <div class="dashboard">
    <!-- <header class="header">
      <div class="header-title">
        <span class="header-logo">🌊</span>
        <h1>Oceans — Documentos</h1>
      </div>
    </header> -->

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
      <div class="filter-row">
        <input class="search" type="text" v-model="search" placeholder="Buscar por número, cliente, usuario…" />
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="!loading && documents.length" class="stats">
      <div class="stat-card">
        <span class="stat-label">Total documentos</span>
        <span class="stat-value">{{ documents.length }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Aceptados</span>
        <span class="stat-value green">{{ acceptedCount }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Total (S/.)</span>
        <span class="stat-value">{{ fmt(totalAmount) }}</span>
      </div>
      <div class="stat-card types">
        <span class="stat-label">Por tipo</span>
        <span v-for="(count, label) in byType" :key="label" class="type-badge">
          {{ label }}: {{ count }}
        </span>
      </div>
    </div>

    <SalesOverTime v-if="!loading && documents.length" :documents="documents" />
    <SalesByUser v-if="!loading && documents.length" :documents="documents" />

    <div v-if="!loading && topCustomers.length" class="card top-customers">
      <div class="top-customers-header">
        <h2>Top Clientes</h2>
        <div class="sort-toggle">
          <button :class="{ active: customerSortKey === 'total' }" @click="customerSortKey = 'total'">
            Por importe
          </button>
          <button :class="{ active: customerSortKey === 'count' }" @click="customerSortKey = 'count'">
            Por cantidad
          </button>
        </div>
      </div>

      <div class="tc-table-wrap">
        <table class="tc-table">
          <thead>
            <tr>
              <th class="tc-rank">#</th>
              <th>Cliente</th>
              <th>DNI/RUC</th>
              <th class="tc-num">Docs</th>
              <th class="tc-bar-col">Cantidad</th>
              <th class="tc-num">Importe (S/.)</th>
              <th class="tc-bar-col">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in topCustomers" :key="row.customer_number">
              <td class="tc-rank">{{ i + 1 }}</td>
              <td class="tc-name">{{ row.customer_name }}</td>
              <td class="mono">{{ row.customer_number }}</td>
              <td class="tc-num mono">{{ row.count }}</td>
              <td class="tc-bar-col">
                <div class="bar-track">
                  <div
                    class="bar-fill count"
                    :style="{ width: (row.count / maxCustomerCount * 100).toFixed(1) + '%' }"
                  />
                </div>
              </td>
              <td class="tc-num mono">{{ fmt(row.total) }}</td>
              <td class="tc-bar-col">
                <div class="bar-track">
                  <div
                    class="bar-fill amount"
                    :style="{ width: (row.total / maxCustomerTotal * 100).toFixed(1) + '%' }"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card table-wrap">
      <div v-if="loading" class="loading-state">
        <div class="spinner" />
        <p>Cargando documentos…</p>
      </div>

      <table v-else-if="sorted.length">
        <thead>
          <tr>
            <th @click="toggleSort('number')">Número {{ sortIcon('number') }}</th>
            <th @click="toggleSort('date_of_issue')">Fecha {{ sortIcon('date_of_issue') }}</th>
            <th @click="toggleSort('customer_name')">Cliente {{ sortIcon('customer_name') }}</th>
            <th>DNI/RUC</th>
            <th @click="toggleSort('document_type_description')">Tipo {{ sortIcon('document_type_description') }}</th>
            <th>Moneda</th>
            <th @click="toggleSort('total')">Total {{ sortIcon('total') }}</th>
            <th @click="toggleSort('state_type_description')">Estado {{ sortIcon('state_type_description') }}</th>
            <th @click="toggleSort('user_name')">Usuario {{ sortIcon('user_name') }}</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in sorted" :key="doc.id">
            <td class="mono">{{ doc.number }}</td>
            <td class="nowrap">{{ doc.date_of_issue }}</td>
            <td>{{ doc.customer_name }}</td>
            <td class="mono">{{ doc.customer_number }}</td>
            <td>{{ documentTypeLabels[doc.document_type_id] ?? doc.document_type_description }}</td>
            <td class="mono">{{ doc.currency_type_id }}</td>
            <td class="mono right">{{ fmt(doc.total) }}</td>
            <td>
              <span
                class="badge"
                :style="{ background: stateColors[doc.state_type_id] ?? '#6b7280' }"
              >{{ doc.state_type_description }}</span>
            </td>
            <td>{{ doc.user_name }}</td>
            <td>
              <a v-if="doc.download_pdf" :href="doc.download_pdf" target="_blank" class="pdf-link">
                PDF
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!loading" class="empty">No hay documentos para el rango seleccionado.</div>
    </div>
  </div>
</template>

<style scoped>
*,
*::before,
*::after {
  box-sizing: border-box;
}

.dashboard {
  min-height: 100vh;
  background: #f1f5f9;
  font-family: 'Inter', system-ui, sans-serif;
  color: #1e293b;
  padding-bottom: 2rem;
}

.header {
  background: #0f172a;
  color: #f8fafc;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.header-logo {
  font-size: 1.4rem;
}

.header h1 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 1.25rem 1.5rem;
  margin: 1.25rem 1.5rem 0;
}

.filters .filter-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.filters .filter-row:last-child {
  margin-bottom: 0;
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

input[type='date'],
.search {
  padding: 0.45rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #1e293b;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.15s;
}

input[type='date']:focus,
.search:focus {
  border-color: #3b82f6;
  background: #fff;
}

.search {
  width: 360px;
  max-width: 100%;
  font-weight: 400;
}

.btn-primary {
  padding: 0.5rem 1.25rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  height: 36px;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  margin: 1rem 1.5rem 0;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #dc2626;
  font-size: 0.9rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin: 1.25rem 1.5rem 0;
}

.stat-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #0f172a;
}

.stat-value.green {
  color: #16a34a;
}

.types {
  gap: 0.5rem;
}

.type-badge {
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
  background: #e2e8f0;
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  display: inline-block;
  margin-right: 0.25rem;
}

.table-wrap {
  overflow-x: auto;
  padding: 0;
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
  width: 36px;
  height: 36px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty {
  padding: 3rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.95rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

thead tr {
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
}

th {
  padding: 0.7rem 0.9rem;
  text-align: left;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

th:hover {
  color: #2563eb;
}

tbody tr {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
}

tbody tr:hover {
  background: #f8fafc;
}

td {
  padding: 0.6rem 0.9rem;
  color: #334155;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.82rem;
}

.nowrap {
  white-space: nowrap;
}

.right {
  text-align: right;
}

.badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}

.pdf-link {
  color: #2563eb;
  font-weight: 600;
  text-decoration: none;
  font-size: 0.8rem;
}

.pdf-link:hover {
  text-decoration: underline;
}

.top-customers {
  padding: 1.25rem 1.5rem;
}

.top-customers-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.top-customers-header h2 {
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

.tc-table-wrap {
  overflow-x: auto;
}

.tc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

.tc-table thead tr {
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
}

.tc-table th {
  padding: 0.6rem 0.8rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  text-align: left;
  white-space: nowrap;
}

.tc-table tbody tr {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
}

.tc-table tbody tr:hover {
  background: #f8fafc;
}

.tc-table td {
  padding: 0.55rem 0.8rem;
  color: #334155;
}

.tc-rank {
  width: 2rem;
  text-align: center;
  font-weight: 700;
  color: #94a3b8;
  font-size: 0.8rem;
}

.tc-name {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-num {
  text-align: right;
  white-space: nowrap;
}

.tc-bar-col {
  width: 120px;
  padding-left: 0.5rem;
}

.bar-track {
  background: #f1f5f9;
  border-radius: 999px;
  height: 8px;
  width: 100%;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.bar-fill.count {
  background: #6366f1;
}

.bar-fill.amount {
  background: #2563eb;
}
</style>
