<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnalyticsData, type ClientRow } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'
import { saleToDoc } from '../../utils/drilldown'

const { clientStats, activeRecords, openDrilldown } = useAnalyticsData()

type TopClientSort = 'total' | 'count'
const topClientSort = ref<TopClientSort>('total')

// El puesto se calcula sobre la lista completa: al buscar, cada cliente conserva su posición real
const topClients = computed(() =>
  [...clientStats.value]
    .sort((a, b) => b[topClientSort.value] - a[topClientSort.value])
    .map((row, i) => ({ ...row, rank: i + 1 })),
)

// Búsqueda por nombre, DNI/RUC, teléfono o tipo, sin distinguir mayúsculas ni tildes
const query = ref('')
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const visibleClients = computed(() => {
  const q = normalize(query.value.trim())
  if (!q) return topClients.value
  return topClients.value.filter((r) =>
    normalize(`${r.customer_name} ${r.customer_number} ${r.telephone} ${r.person_type}`).includes(q))
})

function openClientDrilldown(row: ClientRow) {
  const docs = activeRecords.value
    .filter((r) => r.customer_number === row.customer_number)
    .map(saleToDoc)
  openDrilldown(`Documentos — ${row.customer_name}`, docs)
}
</script>

<template>
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Top Clientes</h2>
      <div class="sort-toggle">
        <button :class="{ active: topClientSort === 'total' }" @click="topClientSort = 'total'">Por importe</button>
        <button :class="{ active: topClientSort === 'count' }" @click="topClientSort = 'count'">Por cantidad</button>
      </div>
    </div>
    <div class="search-row">
      <input
        v-model="query"
        type="search"
        class="search"
        placeholder="Buscar por cliente, DNI/RUC, teléfono o tipo…"
        aria-label="Buscar cliente"
      />
      <span v-if="query.trim()" class="search-count">{{ visibleClients.length }} de {{ topClients.length }}</span>
    </div>
    <div v-if="!visibleClients.length" class="empty-hint">Ningún cliente coincide con “{{ query.trim() }}”.</div>
    <div v-else class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Teléfono</th>
            <th class="right">Docs</th>
            <th class="right">Importe (S/.)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleClients" :key="row.customer_number" class="clickable-row" @click="openClientDrilldown(row)">
            <td class="rank">{{ row.rank }}</td>
            <td class="client-cell">
              <span class="client-name">{{ row.customer_name }}</span>
              <span class="client-ruc mono">{{ row.customer_number }}</span>
            </td>
            <td class="type-cell">{{ row.person_type }}</td>
            <td class="mono">{{ row.telephone }}</td>
            <td class="right mono">{{ row.count }}</td>
            <td class="right mono">{{ fmt(row.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.search-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: -0.25rem 0 0.75rem;
}

.search {
  flex: 1;
  max-width: 360px;
  padding: 0.4rem 0.7rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  font-size: 0.85rem;
  color: #1e293b;
  outline: none;
}
.search:focus { border-color: #3b82f6; background: #fff; }

.search-count { font-size: 0.75rem; color: #64748b; white-space: nowrap; }
</style>
