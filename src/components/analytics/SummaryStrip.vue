<script setup lang="ts">
import { computed } from 'vue'
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'

const { totalSales, totalPurchases, totalExpenses, totalDocs, totalClients } = useAnalyticsData()

// Entradas menos salidas de dinero; no es la utilidad (esa descuenta el costo de lo vendido, no lo comprado)
const cashFlow = computed(() => totalSales.value - totalPurchases.value - totalExpenses.value)
</script>

<template>
  <div class="summary-strip">
    <span class="summary-item">
      <span class="summary-label">Ventas</span>
      <span class="summary-value">S/. {{ fmt(totalSales) }}</span>
    </span>
    <span class="summary-sep">·</span>
    <span class="summary-item" title="Sin el saldo inicial de inventario">
      <span class="summary-label">Compras mercadería</span>
      <span class="summary-value purchase-val">S/. {{ fmt(totalPurchases) }}</span>
    </span>
    <span class="summary-sep">·</span>
    <span class="summary-item">
      <span class="summary-label">Gastos diversos</span>
      <span class="summary-value expense-val">S/. {{ fmt(totalExpenses) }}</span>
    </span>
    <span class="summary-sep">·</span>
    <span class="summary-item" title="Ventas − Compras mercadería − Gastos diversos">
      <span class="summary-label">Flujo de caja</span>
      <span class="summary-value" :class="cashFlow >= 0 ? 'profit-pos' : 'profit-neg'">
        S/. {{ fmt(cashFlow) }}
      </span>
    </span>
    <span class="summary-sep">·</span>
    <span class="summary-item">
      <span class="summary-label">Docs</span>
      <span class="summary-value">{{ totalDocs }}</span>
    </span>
    <span class="summary-sep">·</span>
    <span class="summary-item">
      <span class="summary-label">Clientes</span>
      <span class="summary-value">{{ totalClients }}</span>
    </span>
  </div>
</template>

<style scoped>
.summary-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.75rem;
  margin-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.summary-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.summary-value {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.summary-sep {
  color: #e2e8f0;
  font-size: 1rem;
}

/* Después de .summary-value para que el color de estas clases prevalezca */
.expense-val { color: #dc2626; }
.purchase-val { color: #d97706; }
.profit-pos  { color: #16a34a; font-weight: 800; }
.profit-neg  { color: #dc2626; font-weight: 800; }
</style>
