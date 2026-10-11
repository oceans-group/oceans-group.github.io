<script setup lang="ts">
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'
import { exportToExcel } from '../../utils/excel'

const { inactiveClients, customerMap } = useAnalyticsData()

function exportInactiveClients() {
  const rows = inactiveClients.value.map((r, i) => ({
    '#': i + 1,
    'Cliente': r.customer_name,
    'DNI/RUC': r.customer_number,
    'Tipo': customerMap.value[r.customer_id]?.person_type || '—',
    'Teléfono': customerMap.value[r.customer_id]?.telephone || '—',
    'Última compra': r.last_purchase,
    'Días inactivo': r.days_inactive,
    'Docs': r.count,
    'Total S/.': r.total,
  }))
  exportToExcel(rows, 'clientes-sin-compras-recientes')
}
</script>

<template>
  <div class="card">
    <div class="inactive-header">
      <div>
        <h2>Clientes sin compras recientes</h2>
        <span class="section-hint">Mayor tiempo sin comprar → mayor prioridad</span>
      </div>
      <button class="btn-export" @click="exportInactiveClients" title="Exportar Excel">
        ⬇ Excel
      </button>
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
            <th class="right">Docs</th>
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
            <td class="type-cell">{{ row.person_type }}</td>
            <td class="mono">{{ row.telephone }}</td>
            <td class="right mono">{{ row.last_purchase }}</td>
            <td class="right">
              <span class="days-badge" :class="row.days_inactive >= 30 ? 'danger' : row.days_inactive >= 14 ? 'warn' : 'ok'">
                {{ row.days_inactive }}d
              </span>
            </td>
            <td class="right mono">{{ row.count }}</td>
            <td class="right mono">{{ fmt(row.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
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
</style>
