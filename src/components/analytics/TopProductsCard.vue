<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnalyticsData, type ProductRow } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'
import { saleToDoc } from '../../utils/drilldown'

const { productStats, activeRecords, catalogReady, openDrilldown } = useAnalyticsData()

/** Margen bruto sobre la venta neta; null si el producto no tiene costo */
function margin(p: ProductRow): number | null {
  return p.cost === null || !p.net ? null : ((p.net - p.cost) / p.net) * 100
}

type SortKey = 'quantity' | 'total'
const sortKey = ref<SortKey>('total')

const topProducts = computed(() => [...productStats.value].sort((a, b) => b[sortKey.value] - a[sortKey.value]))
const maxQuantity = computed(() => Math.max(1, ...productStats.value.map((p) => p.quantity)))
const maxTotal = computed(() => Math.max(1, ...productStats.value.map((p) => p.total)))

function openProductDrilldown(product: ProductRow) {
  const docs = activeRecords.value
    .filter((r) => r.items?.some((item) => item.internal_id === product.internal_id))
    .map(saleToDoc)
  openDrilldown(`Documentos — ${product.description}`, docs)
}
</script>

<template>
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Top Productos</h2>
      <div class="sort-toggle">
        <button :class="{ active: sortKey === 'total' }" @click="sortKey = 'total'">Por importe</button>
        <button :class="{ active: sortKey === 'quantity' }" @click="sortKey = 'quantity'">Por cantidad</button>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Código</th>
            <th>Producto</th>
            <th class="right">Uds.</th>
            <th class="bar-col">Cant.</th>
            <th class="right">Importe (S/.)</th>
            <th class="bar-col">Import.</th>
            <th v-if="catalogReady" class="right" title="Costo de lo vendido, sin IGV">Costo (S/.)</th>
            <th v-if="catalogReady" class="right" title="(Venta neta − costo) / venta neta">Margen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in topProducts" :key="p.internal_id" class="clickable-row" @click="openProductDrilldown(p)">
            <td class="rank">{{ i + 1 }}</td>
            <td class="mono code">{{ p.internal_id }}</td>
            <td class="desc">{{ p.description }}</td>
            <td class="right mono">{{ p.quantity }}</td>
            <td class="bar-col">
              <div class="bar-track">
                <div class="bar-fill purple" :style="{ width: (p.quantity / maxQuantity * 100).toFixed(1) + '%' }" />
              </div>
            </td>
            <td class="right mono">{{ fmt(p.total) }}</td>
            <td class="bar-col">
              <div class="bar-track">
                <div class="bar-fill blue" :style="{ width: (p.total / maxTotal * 100).toFixed(1) + '%' }" />
              </div>
            </td>
            <template v-if="catalogReady">
              <td class="right mono">
                <span v-if="p.cost === null" class="cost-missing" title="Sin costo en el catálogo">sin costo</span>
                <template v-else>{{ fmt(p.cost) }}</template>
              </td>
              <td class="right mono" :class="{ 'margin-neg': (margin(p) ?? 0) < 0 }">
                {{ margin(p) === null ? '—' : margin(p)!.toFixed(0) + '%' }}
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.cost-missing { color: #d97706; font-size: 0.7rem; font-weight: 600; }
.margin-neg { color: #dc2626; font-weight: 700; }
</style>
