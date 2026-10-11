<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnalyticsData, type ClientRow } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'
import { saleToDoc } from '../../utils/drilldown'

const { clientStats, activeRecords, openDrilldown } = useAnalyticsData()

type TopClientSort = 'total' | 'count'
const topClientSort = ref<TopClientSort>('total')

const topClients = computed(() => [...clientStats.value].sort((a, b) => b[topClientSort.value] - a[topClientSort.value]))

function openClientDrilldown(row: ClientRow) {
  const docs = activeRecords.value
    .filter((r) => r.customer_number === row.customer_number)
    .map(saleToDoc)
  openDrilldown(`Documentos — ${row.customer_name}`, docs)
}
</script>

<template>
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Top Clientes</h2>
      <div class="sort-toggle">
        <button :class="{ active: topClientSort === 'total' }" @click="topClientSort = 'total'">Por importe</button>
        <button :class="{ active: topClientSort === 'count' }" @click="topClientSort = 'count'">Por cantidad</button>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Teléfono</th>
            <th class="right">Docs</th>
            <th class="right">Importe (S/.)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in topClients" :key="row.customer_number" class="clickable-row" @click="openClientDrilldown(row)">
            <td class="rank">{{ i + 1 }}</td>
            <td class="client-cell">
              <span class="client-name">{{ row.customer_name }}</span>
              <span class="client-ruc mono">{{ row.customer_number }}</span>
            </td>
            <td class="type-cell">{{ row.person_type }}</td>
            <td class="mono">{{ row.telephone }}</td>
            <td class="right mono">{{ row.count }}</td>
            <td class="right mono">{{ fmt(row.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
