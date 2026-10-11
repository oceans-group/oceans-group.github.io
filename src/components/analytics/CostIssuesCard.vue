<script setup lang="ts">
import { computed } from 'vue'
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'

const { costIssues, uncostedSales } = useAnalyticsData()

const missing = computed(() => costIssues.value.filter((i) => i.issue === 'sin-costo').length)
const negative = computed(() => costIssues.value.filter((i) => i.issue === 'margen-negativo').length)
</script>

<template>
  <div class="card cost-issues">
    <div class="section-header">
      <div class="title-group">
        <h2 class="section-title">Costos a revisar en el catálogo</h2>
        <span class="section-hint">
          Corregir el costo de compra en facturaofitec (Productos) ajusta la utilidad automáticamente
        </span>
      </div>
    </div>
    <p class="summary">
      <template v-if="missing">
        <strong>{{ missing }}</strong> producto{{ missing === 1 ? '' : 's' }} sin costo
        (S/. {{ fmt(uncostedSales) }} de ventas netas sin costo descontado: la utilidad sale inflada).
      </template>
      <template v-if="missing && negative"> · </template>
      <template v-if="negative">
        <strong>{{ negative }}</strong> con costo mayor que la venta: probablemente el costo es de la caja o paquete, no de la unidad.
      </template>
    </p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Problema</th>
            <th class="right">Venta neta (S/.)</th>
            <th class="right">Costo (S/.)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in costIssues" :key="i.internal_id">
            <td class="mono code">{{ i.internal_id }}</td>
            <td class="desc">{{ i.description }}</td>
            <td>
              <span class="badge" :class="i.issue">{{ i.issue === 'sin-costo' ? 'Sin costo' : 'Costo > venta' }}</span>
            </td>
            <td class="right mono">{{ fmt(i.net) }}</td>
            <td class="right mono">{{ i.cost === null ? '—' : fmt(i.cost) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.cost-issues { border-left: 4px solid #d97706; }

.title-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.summary {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  color: #475569;
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}
.badge.sin-costo { background: #fef3c7; color: #b45309; }
.badge.margen-negativo { background: #fee2e2; color: #dc2626; }
</style>
