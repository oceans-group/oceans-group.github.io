<script setup lang="ts">
import { computed } from 'vue'
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { INVENTORY_START, OPENING_BALANCE_UNTIL } from '../../services/inventory'
import { fmt } from '../../utils/format'

const {
  totalSales, netSales, costOfSales, grossProfit, totalExpenses, netProfit, totalPurchases, uncostedSales,
  catalogReady, inventoryValue, inventoryLoading, loadedRange, totalDocs, totalClients,
} = useAnalyticsData()

// Estado de resultados (sin IGV a pagar): cada cifra sale de la anterior
const igv = computed(() => totalSales.value - netSales.value)
const grossMargin = computed(() => (netSales.value ? (grossProfit.value / netSales.value) * 100 : 0))

// Flujo de caja: dinero que entra y sale tal como se cobra/paga (con IGV)
const cashFlow = computed(() => totalSales.value - totalPurchases.value - totalExpenses.value)

const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
// Si el rango termina en el futuro, el inventario es el de hoy
const closingDate = computed(() => {
  if (!loadedRange.value) return ''
  const today = new Date().toISOString().slice(0, 10)
  return fmtDate(loadedRange.value.end < today ? loadedRange.value.end : today)
})
const beforeInventory = computed(() => !!loadedRange.value && loadedRange.value.end < INVENTORY_START)
// Hasta el 12/10 las compras de mercadería se registraban como gastos diversos
const mixesOldPurchases = computed(() => !!loadedRange.value && loadedRange.value.start <= OPENING_BALANCE_UNTIL)
</script>

<template>
  <div class="fin">
    <!-- Estado de resultados -->
    <section class="block">
      <h3 class="block-title">Estado de resultados</h3>
      <div class="row">
        <div class="tile">
          <span class="label">Ventas</span>
          <span class="value">{{ fmt(totalSales) }}</span>
          <span class="sub">con IGV</span>
        </div>
        <span class="op">−</span>
        <div class="tile">
          <span class="label">IGV</span>
          <span class="value muted">{{ fmt(igv) }}</span>
          <span class="sub">facturas y boletas</span>
        </div>
        <span class="op">=</span>
        <div class="tile">
          <span class="label">Ventas netas</span>
          <span class="value">{{ fmt(netSales) }}</span>
          <span class="sub">notas de venta completas</span>
        </div>
        <span class="op">−</span>
        <div class="tile">
          <span class="label">Costo de ventas</span>
          <span class="value">{{ catalogReady ? fmt(costOfSales) : '—' }}</span>
          <span class="sub">costo de lo vendido</span>
        </div>
        <span class="op">=</span>
        <div class="tile result">
          <span class="label">Utilidad bruta</span>
          <span class="value" :class="grossProfit >= 0 ? 'pos' : 'neg'">
            {{ catalogReady ? fmt(grossProfit) : '—' }}<sup v-if="catalogReady && uncostedSales > 0" class="mark">*</sup>
          </span>
          <span class="sub">{{ catalogReady ? grossMargin.toFixed(1) + '% de las ventas netas' : 'requiere catálogo' }}</span>
        </div>
        <span class="op">−</span>
        <div class="tile">
          <span class="label">Gastos diversos</span>
          <span class="value">{{ fmt(totalExpenses) }}</span>
          <span class="sub">según registro</span>
        </div>
        <span class="op">=</span>
        <div class="tile result main">
          <span class="label">Utilidad neta</span>
          <span class="value" :class="netProfit >= 0 ? 'pos' : 'neg'">
            {{ catalogReady ? fmt(netProfit) : '—' }}<sup v-if="catalogReady && (uncostedSales > 0 || mixesOldPurchases)" class="mark">*</sup>
          </span>
          <span class="sub">{{ netProfit >= 0 ? 'ganancia' : 'pérdida' }} del periodo</span>
        </div>
      </div>
    </section>

    <div class="pair">
      <!-- Flujo de caja -->
      <section class="block">
        <h3 class="block-title">Flujo de caja <span class="hint">dinero que entra y sale</span></h3>
        <div class="row">
          <div class="tile">
            <span class="label">Cobros por ventas</span>
            <span class="value">{{ fmt(totalSales) }}</span>
          </div>
          <span class="op">−</span>
          <div class="tile">
            <span class="label">Compras mercadería</span>
            <span class="value">{{ fmt(totalPurchases) }}</span>
            <span class="sub">sin saldo inicial</span>
          </div>
          <span class="op">−</span>
          <div class="tile">
            <span class="label">Gastos diversos</span>
            <span class="value">{{ fmt(totalExpenses) }}</span>
          </div>
          <span class="op">=</span>
          <div class="tile result">
            <span class="label">Flujo neto</span>
            <span class="value" :class="cashFlow >= 0 ? 'pos' : 'neg'">{{ fmt(cashFlow) }}</span>
          </div>
        </div>
      </section>

      <!-- Situación -->
      <section class="block">
        <h3 class="block-title">Situación <span class="hint">al {{ closingDate }}</span></h3>
        <div class="row">
          <div class="tile result">
            <span class="label">Activo corriente · Inventario</span>
            <span v-if="beforeInventory" class="value muted small">desde {{ fmtDate(INVENTORY_START) }}</span>
            <span v-else-if="inventoryValue === null" class="value muted small">{{ inventoryLoading ? 'calculando…' : '—' }}</span>
            <span v-else class="value">{{ fmt(inventoryValue) }}</span>
            <span class="sub">mercadería a costo promedio</span>
          </div>
          <div class="tile">
            <span class="label">Documentos</span>
            <span class="value small">{{ totalDocs }}</span>
            <span class="sub">{{ totalClients }} clientes</span>
          </div>
        </div>
      </section>
    </div>

    <p v-if="catalogReady && (uncostedSales > 0 || mixesOldPurchases)" class="notes">
      <span class="mark">*</span>
      <template v-if="uncostedSales > 0">
        Incluye S/. {{ fmt(uncostedSales) }} de ventas netas de productos sin costo en el catálogo (su costo no se descuenta).
      </template>
      <template v-if="mixesOldPurchases">
        Hasta el {{ fmtDate(OPENING_BALANCE_UNTIL) }} las compras de mercadería se registraban como gastos diversos: en ese
        periodo la utilidad neta descuenta la mercadería dos veces (como gasto y como costo de ventas).
      </template>
    </p>
  </div>
</template>

<style scoped>
.fin {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pair {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 0.75rem;
}
@media (max-width: 1100px) { .pair { grid-template-columns: 1fr; } }

.block {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.6rem 0.8rem 0.7rem;
  background: #fcfdfe;
}

.block-title {
  margin: 0 0 0.45rem;
  font-size: 0.7rem;
  font-weight: 800;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.hint { font-weight: 500; color: #94a3b8; text-transform: none; letter-spacing: 0; margin-left: 0.3rem; }

.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
}

.op { font-size: 1.1rem; font-weight: 300; color: #94a3b8; }

.tile { display: flex; flex-direction: column; min-width: 0; }
.tile.result { padding: 0.15rem 0.55rem; border-radius: 6px; background: #f1f5f9; }
.tile.main { background: #e0f2fe; }

.label { font-size: 0.64rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.value { font-size: 0.95rem; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap; }
.value.small { font-size: 0.85rem; }
.value.muted { color: #64748b; font-weight: 600; }
.sub { font-size: 0.64rem; color: #94a3b8; white-space: nowrap; }

.pos { color: #16a34a; }
.neg { color: #dc2626; }
.mark { color: #d97706; margin-left: 1px; }

.notes { margin: 0; font-size: 0.72rem; color: #92400e; }
</style>
