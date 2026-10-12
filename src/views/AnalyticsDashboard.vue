<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import '../styles/analytics.css'
import { provideAnalyticsData } from '../composables/useAnalyticsData'
import DrilldownModal from '../components/DrilldownModal.vue'
import AnalyticsFilters from '../components/analytics/AnalyticsFilters.vue'
import SummaryStrip from '../components/analytics/SummaryStrip.vue'
import LoadingPanel from '../components/analytics/LoadingPanel.vue'
import IncomeStatementCard from '../components/analytics/IncomeStatementCard.vue'
import CostIssuesCard from '../components/analytics/CostIssuesCard.vue'
import TopProductsCard from '../components/analytics/TopProductsCard.vue'
import ProductMixCard from '../components/analytics/ProductMixCard.vue'
import ExpensesByTypeCard from '../components/analytics/ExpensesByTypeCard.vue'
import PurchasesCard from '../components/analytics/PurchasesCard.vue'
import TopClientsCard from '../components/analytics/TopClientsCard.vue'
import ClientTypeCard from '../components/analytics/ClientTypeCard.vue'
import InactiveClientsCard from '../components/analytics/InactiveClientsCard.vue'
import ChurnedClientsCard from '../components/analytics/ChurnedClientsCard.vue'
import InventoryTab from '../components/analytics/InventoryTab.vue'

const { loading, error, warnings, activeRecords, productStats, expenses, costIssues, drilldown, closeDrilldown, init } = provideAnalyticsData()

// ── Pestañas (en la URL para poder compartir el enlace) ─────────────────────

type Tab = 'resultados' | 'inventario' | 'clientes'
const tabs: { id: Tab; label: string }[] = [
  { id: 'resultados', label: 'Resultados' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'clientes', label: 'Clientes' },
]

const route = useRoute()
const router = useRouter()
const activeTab = computed<Tab>(() => tabs.find((t) => t.id === route.query.tab)?.id ?? 'resultados')

function selectTab(tab: Tab) {
  router.replace({ query: { ...route.query, tab: tab === 'resultados' ? undefined : tab } })
}

onMounted(init)
</script>

<template>
  <div class="analytics">
    <AnalyticsFilters>
      <SummaryStrip v-if="!loading && activeRecords.length" />
    </AnalyticsFilters>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-for="w in warnings" :key="w" class="warning">{{ w }}</div>

    <LoadingPanel />

    <template v-if="!loading && productStats.length">
      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="tab"
          :class="{ active: activeTab === t.id }"
          @click="selectTab(t.id)"
        >
          {{ t.label }}
        </button>
      </nav>

      <template v-if="activeTab === 'resultados'">
        <IncomeStatementCard />
        <CostIssuesCard v-if="costIssues.length" />
        <TopProductsCard />
        <div class="grid-2col">
          <ProductMixCard />
          <PurchasesCard />
        </div>
        <ExpensesByTypeCard v-if="expenses.length" />
      </template>

      <InventoryTab v-else-if="activeTab === 'inventario'" />

      <template v-else>
        <div class="grid-2col">
          <TopClientsCard />
          <ClientTypeCard />
        </div>
        <div class="grid-2col">
          <InactiveClientsCard />
          <ChurnedClientsCard />
        </div>
      </template>
    </template>

    <div v-else-if="!loading" class="card empty">
      No hay datos para el rango seleccionado.
    </div>

    <DrilldownModal
      :open="drilldown.open"
      :title="drilldown.title"
      :docs="drilldown.docs"
      @close="closeDrilldown"
    />
  </div>
</template>

<style scoped>
.warning {
  margin: 1rem 1.5rem 0;
  padding: 0.75rem 1rem;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  color: #b45309;
  font-size: 0.9rem;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  margin: 1.25rem 1.5rem 0;
  border-bottom: 1px solid #e2e8f0;
}

.tab {
  padding: 0.6rem 1.1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover { color: #0f172a; }
.tab.active { color: #2563eb; border-bottom-color: #2563eb; }
</style>
