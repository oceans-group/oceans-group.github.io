<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'
import { exportToExcel } from '../../utils/excel'

const { inactiveClients, customerMap } = useAnalyticsData()

type ChurnedSortKey = 'total' | 'count'
const churnedSortKey = ref<ChurnedSortKey>('total')
const minDaysInactive = ref(30)
const daysOptions = [15, 30, 60, 90]

const churnedHighValue = computed(() =>
  inactiveClients.value
    .filter((r) => r.days_inactive >= minDaysInactive.value)
    .sort((a, b) => b[churnedSortKey.value] - a[churnedSortKey.value]),
)

function exportChurnedClients() {
  const rows = churnedHighValue.value.map((r, i) => ({
    '#': i + 1,
    'Cliente': r.customer_name,
    'DNI/RUC': r.customer_number,
    'Tipo': customerMap.value[r.customer_id]?.person_type || '—',
    'Teléfono': customerMap.value[r.customer_id]?.telephone || '—',
    'Días inactivo': r.days_inactive,
    'Docs': r.count,
    'Total histórico S/.': r.total,
  }))
  exportToExcel(rows, 'clientes-valiosos-perdidos')
}
</script>

<template>
  <div class="card">
    <div class="churned-header">
      <div class="churned-title-group">
        <h2>Clientes valiosos perdidos</h2>
        <span class="section-hint">Mayor importe histórico → urgente a recuperar</span>
      </div>
      <div class="churned-controls">
        <div class="days-filter">
          <span class="days-label">Sin comprar más de:</span>
          <div class="sort-toggle">
            <button v-for="d in daysOptions" :key="d" :class="{ active: minDaysInactive === d }" @click="minDaysInactive = d">{{ d }}d</button>
          </div>
        </div>
        <div class="sort-toggle">
          <button :class="{ active: churnedSortKey === 'total' }" @click="churnedSortKey = 'total'">Por importe</button>
          <button :class="{ active: churnedSortKey === 'count' }" @click="churnedSortKey = 'count'">Por cantidad</button>
        </div>
        <button class="btn-export" @click="exportChurnedClients" title="Exportar Excel">
          ⬇ Excel
        </button>
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
            <th class="right">Docs</th>
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
            <td class="type-cell">{{ row.person_type }}</td>
            <td class="mono">{{ row.telephone }}</td>
            <td class="right">
              <span class="days-badge danger">{{ row.days_inactive }}d</span>
            </td>
            <td class="right mono">{{ row.count }}</td>
            <td class="right mono amount-highlight">{{ fmt(row.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
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

.churned-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
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
</style>
