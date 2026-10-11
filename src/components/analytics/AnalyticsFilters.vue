<script setup lang="ts">
import { ref } from 'vue'
import type { Period } from '../../services/proxy'
import { useAnalyticsData } from '../../composables/useAnalyticsData'

const {
  period, dateStart, dateEnd, monthStart, monthEnd,
  records, loading, monthsStatus, load, forceReload, invalidateMonth, invalidateAll,
  personTypes, selectedPersonTypeIds, cacheLastUpdated, cacheRefreshing, refreshCustomers,
  documentTypeFilter, selectedProductCodes, allProductOptions,
} = useAnalyticsData()

const periodLabels: Record<Period, string> = {
  between_dates: 'Rango de fechas',
  between_months: 'Rango de meses',
  month: 'Mes',
  date: 'Fecha',
}

const documentTypeOptions = [
  { id: '', label: 'Todos los tipos' },
  { id: '01', label: 'Factura' },
  { id: '03', label: 'Boleta' },
  { id: 'NV', label: 'Nota de Venta' },
]

const dropdownOpen = ref(false)
const productDropdownOpen = ref(false)
const showCachePanel = ref(false)

function togglePersonType(id: number) {
  const idx = selectedPersonTypeIds.value.indexOf(id)
  if (idx === -1) selectedPersonTypeIds.value.push(id)
  else selectedPersonTypeIds.value.splice(idx, 1)
}

function toggleProductCode(id: string) {
  const idx = selectedProductCodes.value.indexOf(id)
  if (idx === -1) selectedProductCodes.value.push(id)
  else selectedProductCodes.value.splice(idx, 1)
}
</script>

<template>
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

      <button class="btn-force-reload" @click="forceReload" :disabled="loading" title="Elimina el caché del rango actual y recarga todo desde el proxy">
        ↻ Recargar datos
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
            class="btn-force-reload"
            @click="refreshCustomers"
            :disabled="cacheRefreshing"
            :title="cacheLastUpdated ? `Actualizado: ${new Date(cacheLastUpdated).toLocaleString('es-PE')}` : 'Sin datos'"
          >
            {{ cacheRefreshing ? 'Actualizando…' : '↻ Recargar clientes' }}
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

      <!-- Botón ⚙ Caché + Popover -->
      <div v-if="!loading && monthsStatus.length" class="cache-btn-wrap">
        <div v-if="showCachePanel" class="cache-backdrop" @click="showCachePanel = false" />
        <button
          class="btn-cache-toggle"
          :class="{ active: showCachePanel }"
          @click="showCachePanel = !showCachePanel"
          title="Estado de caché local"
        >
          ⚙ Caché
        </button>
        <div v-if="showCachePanel" class="cache-popover">
          <div class="sync-header">
            <span class="sync-title">Caché local</span>
            <button class="sync-clear-all" @click="invalidateAll">✕ Limpiar todo</button>
          </div>
          <div class="sync-months">
            <span
              v-for="m in monthsStatus"
              :key="m.month"
              class="sync-month"
              :class="{ cached: m.cached, live: m.live, uncached: !m.cached && !m.live, partial: m.partialCached }"
              :title="m.live ? 'En vivo' : m.cached ? 'En caché — click para invalidar' : m.partialCached ? 'Parcial' : 'Sin caché'"
              @click="!m.live && (m.cached || m.partialCached) ? invalidateMonth(m.month) : undefined"
            >
              {{ m.month.slice(5) }}/{{ m.month.slice(2,4) }}
            </span>
          </div>
          <div class="sync-legend">
            <span class="legend-item"><span class="dot cached" />Caché</span>
            <span class="legend-item"><span class="dot live" />En vivo</span>
            <span class="legend-item"><span class="dot uncached" />Sin caché</span>
          </div>
        </div>
      </div>
    </div>

    <slot />
  </div>
</template>

<style scoped>
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

.btn-force-reload {
  padding: 0.5rem 1rem;
  background: #fff;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  height: 36px;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-force-reload:hover:not(:disabled) { border-color: #dc2626; color: #dc2626; }
.btn-force-reload:disabled { opacity: 0.5; cursor: not-allowed; }

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

.filter-select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

/* ── Multiselect ────────────────────────────────────────────────────────── */

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

/* ── Panel de caché ─────────────────────────────────────────────────────── */

.cache-btn-wrap {
  position: relative;
  display: inline-block;
  margin-top: 0.75rem;
}

.btn-cache-toggle {
  padding: 0.3rem 0.7rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-cache-toggle:hover,
.btn-cache-toggle.active { background: #1e293b; color: #f8fafc; border-color: #1e293b; }

.cache-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.cache-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 0.9rem 1.1rem;
  z-index: 200;
  min-width: 280px;
}

.sync-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.sync-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.sync-clear-all {
  background: none;
  border: none;
  font-size: 0.72rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
}
.sync-clear-all:hover { color: #dc2626; }

.sync-months {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.5rem;
}

.sync-month {
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: monospace;
  cursor: default;
}
.sync-month.cached { background: #dcfce7; color: #16a34a; cursor: pointer; }
.sync-month.cached:hover { background: #fef2f2; color: #dc2626; }
.sync-month.live { background: #eff6ff; color: #2563eb; }
.sync-month.uncached { background: #f1f5f9; color: #94a3b8; }

.sync-legend {
  display: flex;
  gap: 1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: #64748b;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.dot.cached { background: #16a34a; }
.dot.live { background: #2563eb; }
.dot.uncached { background: #cbd5e1; }
</style>
