<script setup lang="ts">
import { useAnalyticsData } from '../../composables/useAnalyticsData'

const { loading, loadProgress, loadProgressExp, loadingCustomers, customerProgress } = useAnalyticsData()
</script>

<template>
  <div v-if="loadingCustomers" class="card loading-state">
    <div class="spinner" />
    <p>Cargando catálogo de clientes…</p>
    <div v-if="customerProgress.total > 0" class="customer-progress">
      <div class="customer-progress-bar">
        <div
          class="customer-progress-fill"
          :style="{ width: Math.round(customerProgress.loaded / customerProgress.total * 100) + '%' }"
        />
      </div>
      <span class="customer-progress-label">
        {{ customerProgress.loaded }} / {{ customerProgress.total }} páginas
        ({{ Math.round(customerProgress.loaded / customerProgress.total * 100) }}%)
      </span>
    </div>
  </div>

  <div v-if="loading" class="card loading-state">
    <div class="spinner" />
    <div class="progress-rows">
      <p v-if="loadProgress">
        <span class="progress-tag">Ventas</span>
        <span v-if="loadProgress.phase === 'cache'" class="phase-badge cache">caché</span>
        <span v-else class="phase-badge proxy">proxy</span>
        {{ loadProgress.label }}
        <span class="progress-pct">· {{ loadProgress.monthsDone }}/{{ loadProgress.monthsTotal }}</span>
      </p>
      <p v-if="loadProgressExp">
        <span class="progress-tag">Gastos</span>
        <span v-if="loadProgressExp.phase === 'cache'" class="phase-badge cache">caché</span>
        <span v-else class="phase-badge proxy">proxy</span>
        {{ loadProgressExp.label }}
        <span class="progress-pct">· {{ loadProgressExp.monthsDone }}/{{ loadProgressExp.monthsTotal }}</span>
      </p>
      <p v-if="!loadProgress && !loadProgressExp">Conectando…</p>
    </div>
  </div>
</template>

<style scoped>
/* .card.loading-state: debe ganarle al padding de .analytics .card */
.card.loading-state {
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

.customer-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  width: 240px;
}

.customer-progress-bar {
  width: 100%;
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}

.customer-progress-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.customer-progress-label {
  font-size: 0.75rem;
  color: #64748b;
}

.progress-rows { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.progress-rows p { margin: 0; display: flex; align-items: center; gap: 0.4rem; }

.progress-tag {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  width: 3.5rem;
  flex-shrink: 0;
}

.phase-badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  margin-right: 0.3rem;
}
.phase-badge.cache { background: #dcfce7; color: #16a34a; }
.phase-badge.proxy { background: #ede9fe; color: #7c3aed; }
</style>
