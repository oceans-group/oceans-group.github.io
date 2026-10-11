<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'
import { purchaseToDoc } from '../../utils/drilldown'

const { periodPurchases, totalPurchases, openingBalanceTotal, openDrilldown } = useAnalyticsData()

type View = 'supplier' | 'product'
const view = ref<View>('supplier')

interface SupplierRow { supplier_number: string; supplier_name: string; count: number; total: number }

const bySupplier = computed<SupplierRow[]>(() => {
  const map = new Map<string, SupplierRow>()
  for (const p of periodPurchases.value) {
    const key = p.supplier_number || p.supplier_name
    const row = map.get(key) ?? { supplier_number: p.supplier_number, supplier_name: p.supplier_name, count: 0, total: 0 }
    row.count += 1
    row.total += p.total
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})

interface ProductRow { internal_id: string; description: string; quantity: number; cost: number; total: number }

const byProduct = computed<ProductRow[]>(() => {
  const map = new Map<string, ProductRow & { costSum: number }>()
  for (const p of periodPurchases.value) {
    for (const it of p.items) {
      const row = map.get(it.internal_id) ?? { internal_id: it.internal_id, description: it.description, quantity: 0, cost: 0, total: 0, costSum: 0 }
      row.quantity += it.quantity
      row.costSum += it.quantity * it.unit_value
      row.total += it.total
      map.set(it.internal_id, row)
    }
  }
  // Costo promedio ponderado (sin IGV) de lo comprado en el rango
  return [...map.values()]
    .map(({ costSum, ...r }) => ({ ...r, cost: r.quantity ? costSum / r.quantity : 0 }))
    .sort((a, b) => b.total - a.total)
})

const maxSupplierTotal = computed(() => Math.max(1, ...bySupplier.value.map((r) => r.total)))
const maxProductTotal = computed(() => Math.max(1, ...byProduct.value.map((r) => r.total)))

function openSupplier(row: SupplierRow) {
  const docs = periodPurchases.value
    .filter((p) => (p.supplier_number || p.supplier_name) === (row.supplier_number || row.supplier_name))
    .map(purchaseToDoc)
  openDrilldown(`Compras — ${row.supplier_name}`, docs)
}

function openProduct(row: ProductRow) {
  const docs = periodPurchases.value
    .filter((p) => p.items.some((it) => it.internal_id === row.internal_id))
    .map(purchaseToDoc)
  openDrilldown(`Compras — ${row.description}`, docs)
}
</script>

<template>
  <div class="card">
    <div class="section-header">
      <div class="title-group">
        <h2 class="section-title">Compras de mercadería</h2>
        <span class="section-hint">
          Total S/. {{ fmt(totalPurchases) }} en {{ periodPurchases.length }} compras
          <template v-if="openingBalanceTotal"> · no incluye el saldo inicial (S/. {{ fmt(openingBalanceTotal) }})</template>
        </span>
      </div>
      <div v-if="periodPurchases.length" class="sort-toggle">
        <button :class="{ active: view === 'supplier' }" @click="view = 'supplier'">Por proveedor</button>
        <button :class="{ active: view === 'product' }" @click="view = 'product'">Por producto</button>
      </div>
    </div>

    <div v-if="!periodPurchases.length" class="empty-hint">
      Aún no hay compras de mercadería registradas en este rango.
    </div>

    <div v-else-if="view === 'supplier'" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Proveedor</th>
            <th class="right">Compras</th>
            <th class="right">Total (S/.)</th>
            <th class="bar-col">Proporción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in bySupplier" :key="row.supplier_number || row.supplier_name" class="clickable-row" @click="openSupplier(row)">
            <td class="rank">{{ i + 1 }}</td>
            <td class="client-cell">
              <span class="client-name">{{ row.supplier_name }}</span>
              <span class="client-ruc mono">{{ row.supplier_number }}</span>
            </td>
            <td class="right mono">{{ row.count }}</td>
            <td class="right mono">{{ fmt(row.total) }}</td>
            <td class="bar-col">
              <div class="bar-track">
                <div class="bar-fill purchase" :style="{ width: (row.total / maxSupplierTotal * 100).toFixed(1) + '%' }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Código</th>
            <th>Producto</th>
            <th class="right">Cantidad</th>
            <th class="right" title="Promedio ponderado, sin IGV">Costo unit.</th>
            <th class="right">Total (S/.)</th>
            <th class="bar-col">Proporción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in byProduct" :key="row.internal_id" class="clickable-row" @click="openProduct(row)">
            <td class="rank">{{ i + 1 }}</td>
            <td class="mono code">{{ row.internal_id }}</td>
            <td class="desc">{{ row.description }}</td>
            <td class="right mono">{{ row.quantity }}</td>
            <td class="right mono">{{ fmt(row.cost) }}</td>
            <td class="right mono">{{ fmt(row.total) }}</td>
            <td class="bar-col">
              <div class="bar-track">
                <div class="bar-fill purchase" :style="{ width: (row.total / maxProductTotal * 100).toFixed(1) + '%' }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.title-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.bar-fill.purchase { background: #d97706; }
</style>
