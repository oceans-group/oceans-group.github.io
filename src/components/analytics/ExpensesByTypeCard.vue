<script setup lang="ts">
import { computed } from 'vue'
import { useAnalyticsData } from '../../composables/useAnalyticsData'
import { fmt } from '../../utils/format'
import { expenseToDoc } from '../../utils/drilldown'

const { expenses, totalExpenses, openDrilldown } = useAnalyticsData()

interface ExpenseTypeRow { description: string; count: number; total: number }

const expensesByType = computed<ExpenseTypeRow[]>(() => {
  const map = new Map<string, ExpenseTypeRow>()
  for (const e of expenses.value) {
    const key = e.expense_type_description || 'Sin tipo'
    const row = map.get(key) ?? { description: key, count: 0, total: 0 }
    row.count += 1
    row.total += Number(e.total)
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})

const maxExpenseTotal = computed(() => expensesByType.value[0]?.total ?? 1)

function openExpenseTypeDrilldown(row: ExpenseTypeRow) {
  const docs = expenses.value
    .filter((e) => (e.expense_type_description || 'Sin tipo') === row.description)
    .map(expenseToDoc)
  openDrilldown(`Gastos — ${row.description}`, docs)
}
</script>

<template>
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Gastos diversos por tipo</h2>
      <span class="section-hint">Total S/. {{ fmt(totalExpenses) }} en {{ expenses.length }} registros</span>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Tipo de gasto</th>
            <th class="right">Registros</th>
            <th class="right">Total (S/.)</th>
            <th class="bar-col">Proporción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in expensesByType" :key="row.description" class="clickable-row" @click="openExpenseTypeDrilldown(row)">
            <td class="rank">{{ i + 1 }}</td>
            <td>{{ row.description }}</td>
            <td class="right mono">{{ row.count }}</td>
            <td class="right mono amount-highlight">{{ fmt(row.total) }}</td>
            <td class="bar-col">
              <div class="bar-track">
                <div class="bar-fill expense" :style="{ width: (row.total / maxExpenseTotal * 100).toFixed(1) + '%' }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
