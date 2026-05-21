<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { loadRecordsForRange } from '../services/analytics'
import { fetchAllCustomers, fetchPersonTypes, type SaleRecord, type CustomerCacheEntry, type PersonType } from '../services/proxy'
import { getCustomerCacheFromDB, saveCustomerCacheToDB } from '../services/cache'

// ── Períodos ──────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10)
const thisYear = today.slice(0, 4)
const lastYear = String(Number(thisYear) - 1)

const baseStart = ref(`${lastYear}-01-01`)
const baseEnd = ref(`${lastYear}-12-31`)
const currStart = ref(`${thisYear}-01-01`)
const currEnd = ref(today)

const loading = ref(false)
const error = ref<string | null>(null)
const calculated = ref(false)
const customerMap = ref<Record<string, CustomerCacheEntry>>({})
const personTypes = ref<PersonType[]>([])
const selectedTypeIds = ref<number[]>([])
const typeDropdownOpen = ref(false)

function toggleType(id: number) {
  const idx = selectedTypeIds.value.indexOf(id)
  if (idx === -1) selectedTypeIds.value.push(id)
  else selectedTypeIds.value.splice(idx, 1)
}

onMounted(async () => {
  const [local] = await Promise.all([
    getCustomerCacheFromDB(),
    fetchPersonTypes().then(r => { personTypes.value = r }).catch(() => {}),
  ])
  if (local) { customerMap.value = local.data; return }
  try {
    const data = await fetchAllCustomers()
    customerMap.value = data
    await saveCustomerCacheToDB(data, new Date().toISOString())
  } catch { /* sin datos de clientes */ }
})

// ── RFM engine ────────────────────────────────────────────────────────────────

type Tier = 'A' | 'B' | 'C' | 'D'

interface CustomerRFM {
  customer_id: number
  customer_number: string
  customer_name: string
  recency: number
  frequency: number
  monetary: number
  r: number; f: number; m: number
  score: number
  tier: Tier
}

function quartileScore(value: number, sorted: number[], lowerBetter: boolean): number {
  const n = sorted.length
  if (n === 0) return 1
  const q1 = sorted[Math.floor(n * 0.25)] ?? sorted[0]!
  const q2 = sorted[Math.floor(n * 0.5)] ?? sorted[0]!
  const q3 = sorted[Math.floor(n * 0.75)] ?? sorted[0]!
  if (lowerBetter) {
    if (value <= q1) return 4
    if (value <= q2) return 3
    if (value <= q3) return 2
    return 1
  } else {
    if (value >= q3) return 4
    if (value >= q2) return 3
    if (value >= q1) return 2
    return 1
  }
}

function toTier(score: number): Tier {
  if (score >= 10) return 'A'
  if (score >= 7) return 'B'
  if (score >= 4) return 'C'
  return 'D'
}

function calcRFM(records: SaleRecord[], periodEnd: string): Map<string, CustomerRFM> {
  const byCustomer = new Map<string, { id: number; name: string; dates: string[]; total: number }>()
  const endMs = Date.parse(periodEnd)

  for (const r of records) {
    const c = byCustomer.get(r.customer_number) ?? { id: r.customer_id, name: r.customer_name, dates: [], total: 0 }
    c.dates.push(r.date_of_issue)
    c.total += Number(r.total)
    byCustomer.set(r.customer_number, c)
  }

  const rawList = [...byCustomer.entries()].map(([num, c]) => {
    const lastDate = c.dates.sort().at(-1)!
    const recency = Math.floor((endMs - Date.parse(lastDate)) / 86_400_000)
    return { id: c.id, num, name: c.name, recency, frequency: c.dates.length, monetary: c.total }
  })

  const recencies = [...rawList.map(r => r.recency)].sort((a, b) => a - b)
  const frequencies = [...rawList.map(r => r.frequency)].sort((a, b) => a - b)
  const monetaries = [...rawList.map(r => r.monetary)].sort((a, b) => a - b)

  const result = new Map<string, CustomerRFM>()
  for (const row of rawList) {
    const r = quartileScore(row.recency, recencies, true)
    const f = quartileScore(row.frequency, frequencies, false)
    const m = quartileScore(row.monetary, monetaries, false)
    const score = r + f + m
    result.set(row.num, {
      customer_id: row.id,
      customer_number: row.num,
      customer_name: row.name,
      recency: row.recency,
      frequency: row.frequency,
      monetary: row.monetary,
      r, f, m, score,
      tier: toTier(score),
    })
  }
  return result
}

// ── Resultados ────────────────────────────────────────────────────────────────

const baseRFM = ref<Map<string, CustomerRFM>>(new Map())
const currRFM = ref<Map<string, CustomerRFM>>(new Map())

function filterByType(records: SaleRecord[]): SaleRecord[] {
  if (selectedTypeIds.value.length === 0) return records
  return records.filter((r) => {
    const entry = customerMap.value[r.customer_id]
    return entry && selectedTypeIds.value.includes(entry.person_type_id ?? -1)
  })
}

async function calculate() {
  loading.value = true
  error.value = null
  calculated.value = false
  try {
    const base = { personTypeIds: [] as number[] }
    const [baseRecs, currRecs] = await Promise.all([
      loadRecordsForRange(baseStart.value, baseEnd.value, base),
      loadRecordsForRange(currStart.value, currEnd.value, base),
    ])
    baseRFM.value = calcRFM(filterByType(baseRecs), baseEnd.value)
    currRFM.value = calcRFM(filterByType(currRecs), currEnd.value)
    calculated.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al calcular'
  } finally {
    loading.value = false
  }
}

// ── Matriz de transición ──────────────────────────────────────────────────────

const matrix = computed(() => {
  // rows = tier en base (+ Nuevo), cols = tier en actual (+ Inactivo)
  const rows = ['A', 'B', 'C', 'D', 'Nuevo'] as const
  const cols = ['A', 'B', 'C', 'D', 'Inactivo'] as const
  const grid: Record<string, Record<string, CustomerRFM[]>> = {}
  for (const r of rows) { grid[r] = {}; for (const c of cols) grid[r]![c] = [] }

  const allNums = new Set([...baseRFM.value.keys(), ...currRFM.value.keys()])
  for (const num of allNums) {
    const b = baseRFM.value.get(num)
    const c = currRFM.value.get(num)
    const rowKey = b ? b.tier : 'Nuevo'
    const colKey = c ? c.tier : 'Inactivo'
    grid[rowKey]![colKey]!.push((c ?? b)!)
  }
  return { grid, rows, cols }
})

const tierCounts = computed(() => {
  const tiers: Tier[] = ['A', 'B', 'C', 'D']
  return {
    base: tiers.map(t => ({ tier: t, count: [...baseRFM.value.values()].filter(r => r.tier === t).length })),
    curr: tiers.map(t => ({ tier: t, count: [...currRFM.value.values()].filter(r => r.tier === t).length })),
  }
})

// Clientes que mejoraron y que cayeron
const tierOrder = { A: 4, B: 3, C: 2, D: 1 }

const movers = computed(() => {
  const improved: Array<CustomerRFM & { from: Tier; to: Tier }> = []
  const declined: Array<CustomerRFM & { from: Tier; to: Tier }> = []

  for (const [num, curr] of currRFM.value) {
    const base = baseRFM.value.get(num)
    if (!base) continue
    const diff = tierOrder[curr.tier] - tierOrder[base.tier]
    if (diff > 0) improved.push({ ...curr, from: base.tier, to: curr.tier })
    if (diff < 0) declined.push({ ...curr, from: base.tier, to: curr.tier })
  }

  improved.sort((a, b) => tierOrder[b.to] - tierOrder[a.to])
  declined.sort((a, b) => tierOrder[a.to] - tierOrder[b.to])
  return { improved, declined }
})

// ── Helpers UI ────────────────────────────────────────────────────────────────

const tierLabel: Record<string, string> = {
  A: 'A — Champion', B: 'B — Leal', C: 'C — En riesgo', D: 'D — Atención', Nuevo: 'Nuevo', Inactivo: 'Inactivo',
}
const tierColor: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626', Nuevo: '#7c3aed', Inactivo: '#94a3b8',
}
const tierBg: Record<string, string> = {
  A: '#f0fdf4', B: '#eff6ff', C: '#fffbeb', D: '#fef2f2', Nuevo: '#f5f3ff', Inactivo: '#f8fafc',
}

function cellColor(row: string, col: string, count: number): string {
  if (count === 0) return '#f8fafc'
  if (col === 'Inactivo') return '#fef2f2'
  if (row === 'Nuevo') return '#f5f3ff'
  const ro = tierOrder[row as Tier] ?? 0
  const co = tierOrder[col as Tier] ?? 0
  if (co > ro) return '#f0fdf4'
  if (co < ro) return '#fef2f2'
  return '#eff6ff'
}

function fmt(n: number) {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2 })
}
</script>

<template>
  <div class="lc-page">
    <!-- Filtros -->
    <div class="lc-card filters-card">
      <div class="filters-grid">
        <div class="period-block">
          <h3 class="period-label">Período base</h3>
          <div class="period-inputs">
            <label>Desde <input type="date" v-model="baseStart" /></label>
            <label>Hasta <input type="date" v-model="baseEnd" /></label>
          </div>
        </div>
        <div class="period-arrow">→</div>
        <div class="period-block">
          <h3 class="period-label">Período actual</h3>
          <div class="period-inputs">
            <label>Desde <input type="date" v-model="currStart" /></label>
            <label>Hasta <input type="date" v-model="currEnd" /></label>
          </div>
        </div>
        <!-- Tipo de cliente -->
        <div v-if="personTypes.length" class="period-block">
          <h3 class="period-label">Tipo de cliente</h3>
          <div class="type-select-wrap">
            <div v-if="typeDropdownOpen" class="type-backdrop" @click="typeDropdownOpen = false" />
            <div class="type-multiselect" :class="{ open: typeDropdownOpen }">
              <button class="type-trigger" @click="typeDropdownOpen = !typeDropdownOpen">
                <span>{{ selectedTypeIds.length === 0 ? 'Todos' : selectedTypeIds.length === 1 ? personTypes.find(p => p.id === selectedTypeIds[0])?.description : `${selectedTypeIds.length} tipos` }}</span>
                <span>{{ typeDropdownOpen ? '▲' : '▼' }}</span>
              </button>
              <div v-if="typeDropdownOpen" class="type-dropdown">
                <label v-for="pt in personTypes" :key="pt.id" class="type-option">
                  <input type="checkbox" :checked="selectedTypeIds.includes(pt.id)" @change="toggleType(pt.id)" />
                  {{ pt.description }}
                </label>
                <div class="type-footer" v-if="selectedTypeIds.length">
                  <button @click="selectedTypeIds = []" class="type-clear">Limpiar</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button class="btn-calc" @click="calculate" :disabled="loading">
          {{ loading ? 'Calculando…' : 'Calcular RFM' }}
        </button>
      </div>

      <div class="rfm-legend">
        <span v-for="(label, tier) in tierLabel" :key="tier" class="tier-pill"
          :style="{ background: tierBg[tier], color: tierColor[tier], border: `1px solid ${tierColor[tier]}` }">
          {{ label }}
        </span>
        <span class="legend-note">— RFM: Recency · Frequency · Monetary</span>
      </div>
    </div>

    <div v-if="error" class="lc-error">{{ error }}</div>

    <div v-if="loading" class="lc-card lc-loading">
      <div class="spinner" />
      <p>Cargando y calculando RFM para ambos períodos…</p>
    </div>

    <template v-if="!loading && calculated">
      <!-- Distribución por tier -->
      <div class="grid-2">
        <div class="lc-card">
          <h2 class="lc-title">Distribución — Período base</h2>
          <div class="tier-bars">
            <div v-for="t in tierCounts.base" :key="t.tier" class="tier-bar-row">
              <span class="tier-tag" :style="{ color: tierColor[t.tier], background: tierBg[t.tier] }">{{ t.tier }}</span>
              <div class="tier-bar-track">
                <div class="tier-bar-fill"
                  :style="{ width: baseRFM.size ? (t.count / baseRFM.size * 100).toFixed(1) + '%' : '0%', background: tierColor[t.tier] }" />
              </div>
              <span class="tier-count">{{ t.count }}</span>
            </div>
          </div>
          <p class="tier-total">{{ baseRFM.size }} clientes</p>
        </div>

        <div class="lc-card">
          <h2 class="lc-title">Distribución — Período actual</h2>
          <div class="tier-bars">
            <div v-for="t in tierCounts.curr" :key="t.tier" class="tier-bar-row">
              <span class="tier-tag" :style="{ color: tierColor[t.tier], background: tierBg[t.tier] }">{{ t.tier }}</span>
              <div class="tier-bar-track">
                <div class="tier-bar-fill"
                  :style="{ width: currRFM.size ? (t.count / currRFM.size * 100).toFixed(1) + '%' : '0%', background: tierColor[t.tier] }" />
              </div>
              <span class="tier-count">{{ t.count }}</span>
            </div>
          </div>
          <p class="tier-total">{{ currRFM.size }} clientes</p>
        </div>
      </div>

      <!-- Matriz de transición -->
      <div class="lc-card">
        <h2 class="lc-title">Matriz de transición</h2>
        <p class="lc-subtitle">Filas = tier en período base · Columnas = tier en período actual · 🟢 mejoraron · 🔴 cayeron · 🔵 estables</p>
        <div class="matrix-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="matrix-corner">Base ↓ / Actual →</th>
                <th v-for="col in matrix.cols" :key="col"
                  :style="{ color: tierColor[col] }">
                  {{ col }}
                </th>
                <th class="matrix-total-col">Total base</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in matrix.rows" :key="row">
                <td class="matrix-row-header" :style="{ color: tierColor[row] }">{{ row }}</td>
                <td v-for="col in matrix.cols" :key="col"
                  class="matrix-cell"
                  :style="{ background: cellColor(row, col, matrix.grid[row]?.[col]?.length ?? 0) }">
                  <span v-if="(matrix.grid[row]?.[col]?.length ?? 0) > 0" class="cell-count">
                    {{ matrix.grid[row]?.[col]?.length }}
                  </span>
                  <span v-else class="cell-empty">—</span>
                </td>
                <td class="matrix-total-col">
                  {{ matrix.cols.reduce((s, c) => s + (matrix.grid[row]?.[c]?.length ?? 0), 0) }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="matrix-corner">Total actual</td>
                <td v-for="col in matrix.cols" :key="col" class="matrix-total-col">
                  {{ matrix.rows.reduce((s, r) => s + (matrix.grid[r]?.[col]?.length ?? 0), 0) }}
                </td>
                <td class="matrix-total-col"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Clientes que mejoraron / cayeron -->
      <div class="grid-2">
        <div class="lc-card">
          <h2 class="lc-title improved-title">↑ Clientes que mejoraron</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>DNI/RUC</th>
                  <th>Teléfono</th>
                  <th>De</th>
                  <th>A</th>
                  <th class="right">Docs</th>
                  <th class="right">Total (S/.)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in movers.improved" :key="r.customer_number">
                  <td class="client-name">{{ r.customer_name }}</td>
                  <td class="mono">{{ r.customer_number }}</td>
                  <td class="mono">{{ customerMap[r.customer_id]?.telephone || '—' }}</td>
                  <td>
                    <span class="tier-badge" :style="{ color: tierColor[r.from], background: tierBg[r.from] }">{{ r.from }}</span>
                  </td>
                  <td>
                    <span class="tier-badge" :style="{ color: tierColor[r.to], background: tierBg[r.to] }">{{ r.to }}</span>
                  </td>
                  <td class="right mono">{{ r.frequency }}</td>
                  <td class="right mono">{{ fmt(r.monetary) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="movers.improved.length === 0" class="empty">Sin clientes que mejoraron en este período.</p>
          </div>
        </div>

        <div class="lc-card">
          <h2 class="lc-title declined-title">↓ Clientes que cayeron</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>DNI/RUC</th>
                  <th>Teléfono</th>
                  <th>De</th>
                  <th>A</th>
                  <th class="right">Docs</th>
                  <th class="right">Total (S/.)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in movers.declined" :key="r.customer_number">
                  <td class="client-name">{{ r.customer_name }}</td>
                  <td class="mono">{{ r.customer_number }}</td>
                  <td class="mono">{{ customerMap[r.customer_id]?.telephone || '—' }}</td>
                  <td>
                    <span class="tier-badge" :style="{ color: tierColor[r.from], background: tierBg[r.from] }">{{ r.from }}</span>
                  </td>
                  <td>
                    <span class="tier-badge" :style="{ color: tierColor[r.to], background: tierBg[r.to] }">{{ r.to }}</span>
                  </td>
                  <td class="right mono">{{ r.frequency }}</td>
                  <td class="right mono">{{ fmt(r.monetary) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="movers.declined.length === 0" class="empty">Sin clientes que cayeron en este período.</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
*,*::before,*::after { box-sizing: border-box; }

.lc-page {
  padding-bottom: 2rem;
  font-family: 'Inter', system-ui, sans-serif;
  color: #1e293b;
}

.lc-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  padding: 1.25rem 1.5rem;
  margin: 1.25rem 1.5rem 0;
}

.filters-grid {
  display: flex;
  align-items: flex-end;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.period-block { display: flex; flex-direction: column; gap: 0.5rem; }

.period-label {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.period-inputs { display: flex; gap: 0.75rem; flex-wrap: wrap; }

.period-inputs label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.period-inputs input[type='date'] {
  padding: 0.4rem 0.7rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.88rem;
  background: #f8fafc;
  outline: none;
}
.period-inputs input[type='date']:focus { border-color: #2563eb; background: #fff; }

.period-arrow { font-size: 1.5rem; color: #94a3b8; padding-bottom: 0.25rem; }

.btn-calc {
  padding: 0.5rem 1.5rem;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  height: 36px;
  transition: background 0.15s;
  align-self: flex-end;
}
.btn-calc:hover:not(:disabled) { background: #6d28d9; }
.btn-calc:disabled { opacity: 0.6; cursor: not-allowed; }

.rfm-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
  align-items: center;
}

.tier-pill {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.legend-note {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-left: 0.25rem;
}

.lc-error {
  margin: 1rem 1.5rem 0;
  padding: 0.75rem;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #dc2626;
  font-size: 0.9rem;
}

.lc-loading {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: #64748b;
}

.spinner {
  width: 28px; height: 28px;
  border: 3px solid #e2e8f0;
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  margin: 1.25rem 1.5rem 0;
}
.grid-2 .lc-card { margin: 0; min-width: 0; overflow: hidden; }

@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }

.lc-title {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #0f172a;
}
.improved-title { color: #16a34a; }
.declined-title { color: #dc2626; }

.lc-subtitle {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: -0.5rem 0 1rem;
}

.tier-bars { display: flex; flex-direction: column; gap: 0.5rem; }

.tier-bar-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.tier-tag {
  width: 2rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 800;
  border-radius: 4px;
  padding: 0.1rem 0;
  flex-shrink: 0;
}

.tier-bar-track {
  flex: 1;
  background: #f1f5f9;
  border-radius: 999px;
  height: 10px;
  overflow: hidden;
}

.tier-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.tier-count {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
  width: 2.5rem;
  text-align: right;
}

.tier-total {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: #94a3b8;
  text-align: right;
}

.matrix-wrap { overflow-x: auto; }

.matrix-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.84rem;
}

.matrix-table th, .matrix-table td {
  padding: 0.5rem 0.75rem;
  text-align: center;
  border: 1px solid #f1f5f9;
}

.matrix-corner {
  background: #f8fafc;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  text-align: left;
}

.matrix-table thead th {
  background: #f8fafc;
  font-weight: 700;
  font-size: 0.78rem;
}

.matrix-row-header {
  font-weight: 800;
  font-size: 0.88rem;
  background: #f8fafc;
  text-align: left;
}

.matrix-cell { font-size: 0.9rem; transition: background 0.2s; }

.cell-count { font-weight: 700; }
.cell-empty { color: #e2e8f0; }

.matrix-total-col {
  background: #f8fafc;
  font-weight: 600;
  color: #64748b;
  font-size: 0.78rem;
}

.table-scroll { overflow-x: auto; overflow-y: auto; max-height: 360px; }
.table-scroll thead th { position: sticky; top: 0; background: #f8fafc; z-index: 1; }

table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
thead tr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
th { padding: 0.4rem 0.6rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; text-align: left; white-space: nowrap; }
tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.1s; }
tbody tr:hover { background: #f8fafc; }
td { padding: 0.4rem 0.6rem; color: #334155; }

.client-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mono { font-family: monospace; font-size: 0.78rem; }
.right { text-align: right; }

.tier-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-weight: 800;
  font-size: 0.78rem;
}

.empty { text-align: center; color: #94a3b8; font-size: 0.88rem; padding: 1.5rem 0 0; }

.type-select-wrap { position: relative; }
.type-backdrop { position: fixed; inset: 0; z-index: 99; }

.type-multiselect { position: relative; }

.type-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 180px;
  padding: 0.4rem 0.7rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  font-size: 0.84rem;
  color: #1e293b;
  cursor: pointer;
  text-align: left;
  height: 34px;
}
.type-trigger:hover, .type-multiselect.open .type-trigger { border-color: #7c3aed; background: #fff; }

.type-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  width: 220px;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
  overflow: hidden;
}

.type-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem;
  font-size: 0.84rem;
  font-weight: 400;
  color: #334155;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
}
.type-option:hover { background: #f8fafc; }
.type-option input[type='checkbox'] { accent-color: #7c3aed; cursor: pointer; flex-shrink: 0; }

.type-footer { border-top: 1px solid #f1f5f9; padding: 0.35rem 0.75rem; text-align: right; }
.type-clear { background: none; border: none; font-size: 0.75rem; font-weight: 600; color: #7c3aed; cursor: pointer; }
.type-clear:hover { text-decoration: underline; }
</style>
