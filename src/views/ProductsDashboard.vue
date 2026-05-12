<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Doughnut, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  BarElement, CategoryScale, LinearScale,
} from 'chart.js'
import {
  fetchAllSalesRecords, fetchCustomerCache, refreshCustomerCache,
  fetchPersonTypes,
  type SaleRecord, type Period, type PersonType, type CustomerCacheEntry, type LoadProgress,
} from '../services/proxy'

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const today = new Date().toISOString().slice(0, 10)
const thisMonth = today.slice(0, 7)
const firstOfYear = today.slice(0, 4) + '-01-01'

const period = ref<Period>('between_dates')
const dateStart = ref(firstOfYear)
const dateEnd = ref(today)
const monthStart = ref(thisMonth)
const monthEnd = ref(thisMonth)

const periodLabels: Record<Period, string> = {
  between_dates: 'Rango de fechas',
  between_months: 'Rango de meses',
  month: 'Mes',
  date: 'Fecha',
}

const records = ref<SaleRecord[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const loadProgress = ref<LoadProgress | null>(null)


// ── Catálogo de clientes ──────────────────────────────────────────────────────

const customerMap = ref<Record<string, CustomerCacheEntry>>({})
const cacheLastUpdated = ref<string | null>(null)
const cacheRefreshing = ref(false)
const personTypes = ref<PersonType[]>([])
const selectedPersonTypeIds = ref<number[]>([])
const dropdownOpen = ref(false)

async function loadCustomerCache() {
  try {
    const cache = await fetchCustomerCache()
    customerMap.value = cache.data
    cacheLastUpdated.value = cache.last_updated
  } catch {
    customerMap.value = {}
  }
}

async function handleRefreshCache() {
  cacheRefreshing.value = true
  try {
    const cache = await refreshCustomerCache()
    customerMap.value = cache.data
    cacheLastUpdated.value = cache.last_updated
  } finally {
    cacheRefreshing.value = false
  }
}

function togglePersonType(id: number) {
  const idx = selectedPersonTypeIds.value.indexOf(id)
  if (idx === -1) selectedPersonTypeIds.value.push(id)
  else selectedPersonTypeIds.value.splice(idx, 1)
}

// ── Filtros adicionales ───────────────────────────────────────────────────────

const documentTypeFilter = ref('')
const documentTypeOptions = [
  { id: '', label: 'Todos los tipos' },
  { id: '01', label: 'Factura' },
  { id: '03', label: 'Boleta' },
  { id: 'NV', label: 'Nota de Venta' },
]

const selectedProductCodes = ref<string[]>([])
const productDropdownOpen = ref(false)

const allProductOptions = computed(() => {
  const map = new Map<string, string>()
  for (const r of records.value) {
    for (const item of r.items ?? []) {
      if (item.internal_id && !map.has(item.internal_id))
        map.set(item.internal_id, item.description)
    }
  }
  return [...map.entries()]
    .map(([id, description]) => ({ id, description }))
    .sort((a, b) => a.description.localeCompare(b.description))
})

function toggleProductCode(id: string) {
  const idx = selectedProductCodes.value.indexOf(id)
  if (idx === -1) selectedProductCodes.value.push(id)
  else selectedProductCodes.value.splice(idx, 1)
}

// ── Records filtrados ─────────────────────────────────────────────────────────

const activeRecords = computed(() => {
  let result = records.value

  if (documentTypeFilter.value)
    result = result.filter((r) => r.document_type_id === documentTypeFilter.value)

  if (selectedPersonTypeIds.value.length > 0)
    result = result.filter((r) => {
      const entry = customerMap.value[r.customer_id]
      return entry && selectedPersonTypeIds.value.includes(entry.person_type_id ?? -1)
    })

  if (selectedProductCodes.value.length > 0)
    result = result.filter((r) =>
      r.items?.some((item) => selectedProductCodes.value.includes(item.internal_id)),
    )

  return result
})

type SortKey = 'quantity' | 'total'
const sortKey = ref<SortKey>('total')

interface ProductRow {
  internal_id: string
  description: string
  quantity: number
  total: number
}

const totalAmount = computed(() =>
  activeRecords.value.reduce((s, r) => s + Number(r.total), 0)
)
const totalDocs = computed(() => activeRecords.value.length)
const totalClients = computed(() => new Set(activeRecords.value.map((r) => r.customer_number)).size)

const topProducts = computed<ProductRow[]>(() => {
  const map = new Map<string, ProductRow>()
  for (const record of activeRecords.value) {
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

// ── Ventas mensuales ─────────────────────────────────────────────────────────

const monthlyBarData = computed(() => {
  const map = new Map<string, { total: number; count: number }>()
  for (const r of activeRecords.value) {
    const month = r.date_of_issue.slice(0, 7)
    const entry = map.get(month) ?? { total: 0, count: 0 }
    entry.total += Number(r.total)
    entry.count += 1
    map.set(month, entry)
  }
  const labels = [...map.keys()].sort()
  return {
    labels,
    datasets: [
      {
        label: 'Importe (S/.)',
        data: labels.map((l) => map.get(l)!.total),
        backgroundColor: '#2563eb',
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y',
      },
      {
        label: 'Nº documentos',
        data: labels.map((l) => map.get(l)!.count),
        backgroundColor: '#7c3aed',
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y2',
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
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
          const val = ctx.parsed.y ?? 0
          if (ctx.dataset.label?.startsWith('Importe'))
            return ` S/. ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
          return ` ${val} docs`
        },
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
    y: {
      position: 'left' as const,
      grid: { color: '#f1f5f9' },
      ticks: {
        font: { size: 11 }, color: '#2563eb',
        callback: (v: number | string) => 'S/. ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 }),
      },
    },
    y2: {
      position: 'right' as const,
      grid: { drawOnChartArea: false },
      ticks: { font: { size: 11 }, color: '#7c3aed' },
    },
  },
}

// ── Top clientes general ─────────────────────────────────────────────────────

type TopClientSort = 'total' | 'count'
const topClientSort = ref<TopClientSort>('total')

interface TopClientRow {
  customer_id: number
  customer_number: string
  customer_name: string
  count: number
  total: number
  last_purchase: string
}

const todayStr = new Date().toISOString().slice(0, 10)

const topClientsGeneral = computed<TopClientRow[]>(() => {
  const map = new Map<string, TopClientRow>()
  for (const r of activeRecords.value) {
    const existing = map.get(r.customer_number)
    const row: TopClientRow = existing ?? {
      customer_id: r.customer_id,
      customer_number: r.customer_number,
      customer_name: r.customer_name,
      count: 0,
      total: 0,
      last_purchase: r.date_of_issue,
    }
    if (r.date_of_issue > row.last_purchase) row.last_purchase = r.date_of_issue
    row.count += 1
    row.total += Number(r.total)
    map.set(r.customer_number, row)
  }
  return [...map.values()].sort((a, b) => b[topClientSort.value] - a[topClientSort.value])
})

const maxTopClientTotal = computed(() => topClientsGeneral.value[0]?.total ?? 1)

// ── Clientes sin compras recientes ───────────────────────────────────────────

const inactiveClients = computed(() => {
  const msPerDay = 86_400_000
  return [...topClientsGeneral.value]
    .map((r) => ({
      ...r,
      days_inactive: Math.floor((Date.parse(todayStr) - Date.parse(r.last_purchase)) / msPerDay),
    }))
    .sort((a, b) => b.days_inactive - a.days_inactive)
})

// ── Clientes valiosos perdidos ────────────────────────────────────────────────

const minDaysInactive = ref(30)
const daysOptions = [15, 30, 60, 90]

const churnedHighValue = computed(() =>
  inactiveClients.value
    .filter((r) => r.days_inactive >= minDaysInactive.value)
    .sort((a, b) => b.total - a.total),
)

function buildFilter() {
  return {
    period: period.value,
    dateStart: dateStart.value,
    dateEnd: dateEnd.value,
    monthStart: monthStart.value,
    monthEnd: monthEnd.value,
    personTypeIds: [],
  }
}

async function load() {
  loading.value = true
  loadProgress.value = null
  error.value = null
  try {
    records.value = await fetchAllSalesRecords(buildFilter(), (p) => {
      loadProgress.value = p
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar los datos'
  } finally {
    loading.value = false
    loadProgress.value = null
  }
}

onMounted(async () => {
  await Promise.all([
    load(),
    loadCustomerCache(),
    fetchPersonTypes().then((r) => { personTypes.value = r }).catch(() => {}),
  ])
})
</script>

<template>
  <div class="dashboard">
    <div class="filters card">
      <div class="filter-row">
        <label>
          Periodo
          <select v-model="period" class="period-select">
            <option v-for="(label, key) in periodLabels" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>

        <template v-if="period === 'date'">
          <label>Fecha <input type="date" v-model="dateStart" /></label>
        </template>

        <template v-else-if="period === 'month'">
          <label>Mes <input type="month" v-model="monthStart" /></label>
        </template>

        <template v-else-if="period === 'between_dates'">
          <label>Desde <input type="date" v-model="dateStart" /></label>
          <label>Hasta <input type="date" v-model="dateEnd" /></label>
        </template>

        <template v-else-if="period === 'between_months'">
          <label>Desde <input type="month" v-model="monthStart" /></label>
          <label>Hasta <input type="month" v-model="monthEnd" /></label>
        </template>

        <button class="btn-primary" @click="load" :disabled="loading">
          {{ loading ? 'Cargando…' : 'Buscar' }}
        </button>

        <div v-if="personTypes.length" class="multiselect-wrap">
          <span class="multiselect-label">Tipo de cliente</span>
          <div class="multiselect-row">
          <div v-if="dropdownOpen" class="multiselect-backdrop" @click="dropdownOpen = false" />
          <div class="multiselect" :class="{ open: dropdownOpen }">
            <button class="multiselect-trigger" @click="dropdownOpen = !dropdownOpen">
              <span>{{ selectedPersonTypeIds.length === 0 ? 'Todos los tipos' : selectedPersonTypeIds.length === 1 ? personTypes.find(p => p.id === selectedPersonTypeIds[0])?.description : `${selectedPersonTypeIds.length} tipos seleccionados` }}</span>
              <span class="multiselect-arrow">{{ dropdownOpen ? '▲' : '▼' }}</span>
            </button>
            <div v-if="dropdownOpen" class="multiselect-dropdown">
              <div class="multiselect-options">
                <label v-for="pt in personTypes" :key="pt.id" class="multiselect-option">
                  <input type="checkbox" :checked="selectedPersonTypeIds.includes(pt.id)" @change="togglePersonType(pt.id)" />
                  {{ pt.description }}
                </label>
              </div>
              <div class="multiselect-footer">
                <button v-if="selectedPersonTypeIds.length" @click="selectedPersonTypeIds = []" class="multiselect-clear">Limpiar</button>
              </div>
            </div>
          </div>
          <button
            class="btn-refresh"
            @click="handleRefreshCache"
            :disabled="cacheRefreshing"
            :title="cacheLastUpdated ? `Actualizado: ${new Date(cacheLastUpdated).toLocaleString('es-PE')}` : 'Sin datos'"
          >
            {{ cacheRefreshing ? 'Actualizando…' : '↻ Clientes' }}
          </button>
          </div>
        </div>

      <div class="filter-row" v-if="!loading && records.length">
        <!-- Tipo de documento -->
        <div class="filter-select-wrap">
          <span class="multiselect-label">Tipo de documento</span>
          <select v-model="documentTypeFilter" class="period-select">
            <option v-for="opt in documentTypeOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          </select>
        </div>

        <!-- Tipo de producto -->
        <div class="multiselect-wrap" v-if="allProductOptions.length">
          <span class="multiselect-label">Producto</span>
          <div class="multiselect-row">
            <div v-if="productDropdownOpen" class="multiselect-backdrop" @click="productDropdownOpen = false" />
            <div class="multiselect" :class="{ open: productDropdownOpen }">
              <button class="multiselect-trigger" @click="productDropdownOpen = !productDropdownOpen">
                <span>{{ selectedProductCodes.length === 0 ? 'Todos' : selectedProductCodes.length === 1 ? allProductOptions.find(p => p.id === selectedProductCodes[0])?.description : `${selectedProductCodes.length} productos` }}</span>
                <span class="multiselect-arrow">{{ productDropdownOpen ? '▲' : '▼' }}</span>
              </button>
              <div v-if="productDropdownOpen" class="multiselect-dropdown">
                <div class="multiselect-options">
                  <label v-for="p in allProductOptions" :key="p.id" class="multiselect-option">
                    <input type="checkbox" :checked="selectedProductCodes.includes(p.id)" @change="toggleProductCode(p.id)" />
                    <span class="product-option-text">
                      <span class="product-code mono">{{ p.id }}</span>
                      {{ p.description }}
                    </span>
                  </label>
                </div>
                <div class="multiselect-footer">
                  <button v-if="selectedProductCodes.length" @click="selectedProductCodes = []" class="multiselect-clear">Limpiar</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      </div>

      <div v-if="!loading && activeRecords.length" class="summary-strip">
        <span class="summary-item">
          <span class="summary-label">Total</span>
          <span class="summary-value">S/. {{ fmt(totalAmount) }}</span>
        </span>
        <span class="summary-sep">·</span>
        <span class="summary-item">
          <span class="summary-label">Documentos</span>
          <span class="summary-value">{{ totalDocs }}</span>
        </span>
        <span class="summary-sep">·</span>
        <span class="summary-item">
          <span class="summary-label">Clientes</span>
          <span class="summary-value">{{ totalClients }}</span>
        </span>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="card loading-state">
      <div class="spinner" />
      <p v-if="loadProgress">
        Cargando… {{ loadProgress.loaded }} / {{ loadProgress.total }} páginas
        <span class="progress-pct">({{ Math.round(loadProgress.loaded / loadProgress.total * 100) }}%)</span>
      </p>
      <p v-else>Conectando con el proxy…</p>
    </div>

    <template v-if="!loading && topProducts.length">
      <!-- Fila 1 -->
      <div class="grid-2col">
        <!-- Top Clientes -->
        <div class="card">
          <div class="section-header">
            <h2 class="section-title">Top Clientes</h2>
            <div class="sort-toggle">
              <button :class="{ active: topClientSort === 'total' }" @click="topClientSort = 'total'">Por importe</button>
              <button :class="{ active: topClientSort === 'count' }" @click="topClientSort = 'count'">Por cantidad</button>
            </div>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Teléfono</th>
                  <th class="right">Docs</th>
                  <th class="right">Importe (S/.)</th>
                  <!-- <th class="bar-col">Import.</th> -->
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in topClientsGeneral" :key="row.customer_number">
                  <td class="rank">{{ i + 1 }}</td>
                  <td class="client-cell">
                    <span class="client-name">{{ row.customer_name }}</span>
                    <span class="client-ruc mono">{{ row.customer_number }}</span>
                  </td>
                  <td class="type-cell">{{ customerMap[row.customer_id]?.person_type || '—' }}</td>
                  <td class="mono">{{ customerMap[row.customer_id]?.telephone || '—' }}</td>
                  <td class="right mono">{{ row.count }}</td>
                  <td class="right mono">{{ fmt(row.total) }}</td>
                  <!-- <td class="bar-col">
                    <div class="bar-track">
                      <div class="bar-fill blue" :style="{ width: (row.total / maxTopClientTotal * 100).toFixed(1) + '%' }" />
                    </div>
                  </td> -->
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Ventas mensuales -->
        <div class="card">
          <div class="section-header">
            <h2 class="section-title">Ventas mensuales</h2>
            <span class="section-hint">Usa "Rango de meses" para mejor visualización</span>
          </div>
          <div class="bar-chart-wrap">
            <Bar :data="monthlyBarData" :options="monthlyBarOptions" />
          </div>
        </div>
      </div>

      <!-- Fila 2 -->
      <div class="grid-2col">
        <!-- Top Productos -->
        <div class="card">
          <div class="section-header">
            <h2 class="section-title">Top Productos</h2>
            <div class="sort-toggle">
              <button :class="{ active: sortKey === 'total' }" @click="sortKey = 'total'">Por importe</button>
              <button :class="{ active: sortKey === 'quantity' }" @click="sortKey = 'quantity'">Por cantidad</button>
            </div>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Código</th>
                  <th>Producto</th>
                  <th class="right">Uds.</th>
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

        <!-- Mix de productos -->
        <div class="card">
          <h2 class="section-title">Mix de productos — % del ingreso</h2>
          <div class="donut-wrap">
            <Doughnut :data="donutData" :options="donutOptions" />
          </div>
        </div>
      </div>

      <!-- Fila 3 -->
      <div class="grid-2col">
        <!-- Clientes sin compras recientes -->
        <div class="card">
          <div class="inactive-header">
            <h2>Clientes sin compras recientes</h2>
            <span class="section-hint">Mayor tiempo sin comprar → mayor prioridad</span>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Teléfono</th>
                  <th class="right">Última compra</th>
                  <th class="right">Días inactivo</th>
                  <th class="right">Total (S/.)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in inactiveClients" :key="row.customer_number">
                  <td class="rank">{{ i + 1 }}</td>
                  <td class="client-cell">
                    <span class="client-name">{{ row.customer_name }}</span>
                    <span class="client-ruc mono">{{ row.customer_number }}</span>
                  </td>
                  <td class="type-cell">{{ customerMap[row.customer_id]?.person_type || '—' }}</td>
                  <td class="mono">{{ customerMap[row.customer_id]?.telephone || '—' }}</td>
                  <td class="right mono">{{ row.last_purchase }}</td>
                  <td class="right">
                    <span class="days-badge" :class="row.days_inactive >= 30 ? 'danger' : row.days_inactive >= 14 ? 'warn' : 'ok'">
                      {{ row.days_inactive }}d
                    </span>
                  </td>
                  <td class="right mono">{{ fmt(row.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Clientes valiosos perdidos -->
        <div class="card">
          <div class="churned-header">
            <div class="churned-title-group">
              <h2>Clientes valiosos perdidos</h2>
              <span class="section-hint">Mayor importe histórico → urgente a recuperar</span>
            </div>
            <div class="days-filter">
              <span class="days-label">Sin comprar más de:</span>
              <div class="sort-toggle">
                <button v-for="d in daysOptions" :key="d" :class="{ active: minDaysInactive === d }" @click="minDaysInactive = d">{{ d }}d</button>
              </div>
            </div>
          </div>
          <div v-if="churnedHighValue.length === 0" class="empty-hint">
            No hay clientes con más de {{ minDaysInactive }} días sin comprar.
          </div>
          <div v-else class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Teléfono</th>
                  <th class="right">Días inactivo</th>
                  <th class="right">Total hist (S/.)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in churnedHighValue" :key="row.customer_number">
                  <td class="rank">{{ i + 1 }}</td>
                  <td class="client-cell">
                    <span class="client-name">{{ row.customer_name }}</span>
                    <span class="client-ruc mono">{{ row.customer_number }}</span>
                  </td>
                  <td class="type-cell">{{ customerMap[row.customer_id]?.person_type || '—' }}</td>
                  <td class="mono">{{ customerMap[row.customer_id]?.telephone || '—' }}</td>
                  <td class="right">
                    <span class="days-badge danger">{{ row.days_inactive }}d</span>
                  </td>
                  <td class="right mono amount-highlight">{{ fmt(row.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
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

.grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  margin: 1.25rem 1.5rem 0;
}

.grid-2col .card {
  margin: 0;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 1024px) {
  .grid-2col {
    grid-template-columns: 1fr;
  }
}

.client-cell {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.client-name {
  font-size: 0.78rem;
  color: #1e293b;
  line-height: 1.2;
}

.client-ruc {
  font-size: 0.68rem;
  color: #94a3b8;
  line-height: 1.2;
}

.type-cell {
  font-size: 0.74rem;
  color: #64748b;
  white-space: nowrap;
}

.section-hint {
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
}

.filter-select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.product-option-text {
  display: flex;
  flex-direction: column;
  gap: 0;
  line-height: 1.2;
  overflow: hidden;
  min-width: 0;
}

.product-option-text > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-code {
  font-size: 0.68rem;
  color: #94a3b8;
}

.summary-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.75rem;
  margin-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.summary-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.summary-value {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.summary-sep {
  color: #e2e8f0;
  font-size: 1rem;
}

.table-scroll {
  overflow-x: auto;
  overflow-y: auto;
  max-height: 360px;
}

.table-scroll thead th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
}

.inactive-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.inactive-header h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.churned-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.churned-title-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.churned-title-group h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.days-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.days-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
}

.days-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: monospace;
}
.days-badge.ok     { background: #dcfce7; color: #16a34a; }
.days-badge.warn   { background: #fef9c3; color: #ca8a04; }
.days-badge.danger { background: #fee2e2; color: #dc2626; }

.amount-highlight { color: #dc2626; font-weight: 700; }

.empty-hint {
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9rem;
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

.period-select {
  padding: 0.45rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #1e293b;
  background: #f8fafc;
  outline: none;
  cursor: pointer;
}
.period-select:focus { border-color: #3b82f6; background: #fff; }

.source-toggle {
  display: flex;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  height: 36px;
  align-self: flex-end;
}

.source-toggle button {
  padding: 0 0.9rem;
  background: #fff;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.source-toggle button + button { border-left: 1px solid #e2e8f0; }

.source-toggle button.active {
  background: #0f172a;
  color: #fff;
}

.multiselect-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.multiselect-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.multiselect-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.multiselect-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.multiselect {
  position: relative;
}

.multiselect-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 200px;
  padding: 0.45rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  font-size: 0.88rem;
  color: #1e293b;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s;
  height: 36px;
  overflow: hidden;
}

.multiselect-trigger span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.multiselect-trigger:hover,
.multiselect.open .multiselect-trigger { border-color: #7c3aed; background: #fff; }

.multiselect-arrow { font-size: 0.65rem; color: #94a3b8; }

.multiselect-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  width: 280px;
  max-height: 260px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
  overflow: hidden;
}

.multiselect-options {
  overflow-y: auto;
  flex: 1;
}

.multiselect-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 400;
  color: #334155;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
  transition: background 0.1s;
}

.multiselect-option:hover { background: #f8fafc; }

.multiselect-option input[type='checkbox'] {
  accent-color: #7c3aed;
  cursor: pointer;
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}

.multiselect-footer {
  border-top: 1px solid #f1f5f9;
  padding: 0.4rem 0.75rem;
  text-align: right;
}

.multiselect-clear {
  background: none;
  border: none;
  font-size: 0.78rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
  padding: 0;
}

.multiselect-clear:hover { text-decoration: underline; }

.btn-refresh {
  padding: 0.3rem 0.85rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-refresh:hover:not(:disabled) { border-color: #2563eb; color: #2563eb; }
.btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }

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

.progress-pct { color: #2563eb; font-weight: 700; }

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

table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }

thead tr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }

th {
  padding: 0.35rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  text-align: left;
  white-space: nowrap;
}

tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.1s; }
tbody tr:hover { background: #f8fafc; }

td { padding: 0.3rem 0.6rem; color: #334155; }

.rank { width: 1.5rem; text-align: center; font-weight: 700; color: #94a3b8; font-size: 0.72rem; }
.code { font-family: monospace; font-size: 0.75rem; color: #64748b; }
.desc { max-width: 200px; }
.right { text-align: right; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 0.76rem; }

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

.section-hint {
  font-size: 0.78rem;
  color: #94a3b8;
  font-weight: 400;
}

.nowrap { white-space: nowrap; }

.days-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: monospace;
}
.days-badge.ok     { background: #dcfce7; color: #16a34a; }
.days-badge.warn   { background: #fef9c3; color: #ca8a04; }
.days-badge.danger { background: #fee2e2; color: #dc2626; }

.bar-chart-wrap {
  height: 280px;
  position: relative;
}

.donut-wrap {
  height: 320px;
  max-width: 700px;
  margin: 0 auto;
}
</style>
