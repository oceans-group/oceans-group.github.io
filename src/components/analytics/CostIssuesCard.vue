<script setup lang="ts">
import { computed } from 'vue'
import { useAnalyticsData, UNUSUAL_MARGIN, type CostIssue } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'

const { costIssues, uncostedSales } = useAnalyticsData()

const count = (issue: CostIssue['issue']) => costIssues.value.filter((i) => i.issue === issue).length
const missing = computed(() => count('sin-costo'))
const negative = computed(() => count('margen-negativo'))
const unusual = computed(() => count('margen-inusual'))

const labels: Record<CostIssue['issue'], string> = {
  'sin-costo': 'Sin costo',
  'margen-negativo': 'Costo > venta',
  'margen-inusual': 'Margen inusual',
}

const margin = (i: CostIssue) => (i.cost === null || !i.net ? null : ((i.net - i.cost) / i.net) * 100)
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
      <template v-if="unusual && (missing || negative)"> · </template>
      <template v-if="unusual">
        <strong>{{ unusual }}</strong> con margen inusual (≥ {{ UNUSUAL_MARGIN.high * 100 }}% o ≤ {{ UNUSUAL_MARGIN.low * 100 }}%):
        revisar que el costo y la venta estén en la misma unidad.
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
            <th class="right">Margen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in costIssues" :key="i.internal_id">
            <td class="mono code">{{ i.internal_id }}</td>
            <td class="desc">{{ i.description }}</td>
            <td>
              <span class="badge" :class="i.issue">{{ labels[i.issue] }}</span>
            </td>
            <td class="right mono">{{ fmt(i.net) }}</td>
            <td class="right mono">{{ i.cost === null ? '—' : fmt(i.cost) }}</td>
            <td class="right mono">{{ margin(i) === null ? '—' : margin(i)!.toFixed(0) + '%' }}</td>
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
.badge.margen-inusual { background: #e0e7ff; color: #4338ca; }
</style>
