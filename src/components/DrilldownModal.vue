<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SaleRecord, ExpenseRecord, PurchaseRecord } from '../services/proxy'

export interface DrilldownDoc {
  key: string
  date: string
  typeLabel: string
  party: string
  partyNumber: string
  total: number
  kind: 'sale' | 'expense' | 'purchase'
  raw: SaleRecord | ExpenseRecord | PurchaseRecord
}

const props = defineProps<{
  open: boolean
  title: string
  docs: DrilldownDoc[]
}>()

const emit = defineEmits<{ close: [] }>()

const selected = ref<DrilldownDoc | null>(null)

watch(() => props.open, (isOpen) => {
  if (!isOpen) selected.value = null
})

const totalAmount = computed(() => props.docs.reduce((s, d) => s + d.total, 0))

const typeColors: Record<string, string> = {
  '01': '#2563eb',
  '03': '#0891b2',
  NV: '#7c3aed',
  gasto: '#dc2626',
  compra: '#d97706',
}

function typeColor(doc: DrilldownDoc) {
  if (doc.kind === 'expense') return typeColors.gasto
  if (doc.kind === 'purchase') return typeColors.compra
  const raw = doc.raw as SaleRecord
  return typeColors[raw.document_type_id] ?? '#64748b'
}

function fmt(n: number) {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2 })
}

function close() {
  emit('close')
}

function openDetail(doc: DrilldownDoc) {
  selected.value = doc
}

function backToList() {
  selected.value = null
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drilldown-overlay" @click.self="close">
      <div class="drilldown-panel">
        <div class="drilldown-header">
          <button v-if="selected" class="back-btn" @click="backToList">← Volver</button>
          <div class="drilldown-title">
            <h3>{{ selected ? 'Detalle del documento' : title }}</h3>
            <span v-if="!selected" class="drilldown-subtitle">
              {{ docs.length }} documento{{ docs.length === 1 ? '' : 's' }} · S/. {{ fmt(totalAmount) }}
            </span>
          </div>
          <button class="close-btn" @click="close">✕</button>
        </div>

        <!-- Lista de documentos -->
        <div v-if="!selected" class="drilldown-body">
          <div v-if="docs.length === 0" class="empty-hint">No hay documentos para este detalle.</div>
          <table v-else>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cliente / Proveedor</th>
                <th class="right">Total (S/.)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="doc in docs" :key="doc.key" class="clickable-row" @click="openDetail(doc)">
                <td class="mono">{{ doc.date }}</td>
                <td>
                  <span class="type-badge" :style="{ background: typeColor(doc) }">{{ doc.typeLabel }}</span>
                </td>
                <td class="party-cell">
                  <span class="party-name">{{ doc.party }}</span>
                  <span class="party-number mono">{{ doc.partyNumber }}</span>
                </td>
                <td class="right mono">{{ fmt(doc.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Detalle de un documento -->
        <div v-else class="drilldown-body detail-body">
          <template v-if="selected.kind === 'sale'">
            <div class="detail-grid">
              <div class="detail-field"><span class="label">Tipo</span><span>{{ (selected.raw as SaleRecord).document_type_description }}</span></div>
              <div class="detail-field"><span class="label">ID</span><span class="mono">{{ (selected.raw as SaleRecord).id }}</span></div>
              <div class="detail-field"><span class="label">Fecha</span><span>{{ (selected.raw as SaleRecord).date_of_issue }}</span></div>
              <div class="detail-field"><span class="label">Cliente</span><span>{{ (selected.raw as SaleRecord).customer_name }}</span></div>
              <div class="detail-field"><span class="label">N° Doc. cliente</span><span class="mono">{{ (selected.raw as SaleRecord).customer_number }}</span></div>
              <div class="detail-field"><span class="label">Forma de pago</span><span>{{ (selected.raw as SaleRecord).payment_form || '—' }}</span></div>
              <div class="detail-field"><span class="label">Vendedor</span><span>{{ (selected.raw as SaleRecord).user_name || '—' }}</span></div>
              <div class="detail-field"><span class="label">Estado</span><span>{{ (selected.raw as SaleRecord).state_type_id || '—' }}</span></div>
              <div class="detail-field total-field"><span class="label">Total</span><span class="amount-highlight">S/. {{ fmt(Number((selected.raw as SaleRecord).total)) }}</span></div>
            </div>

            <h4 class="items-title">Items</h4>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th class="right">Cant.</th>
                  <th class="right">P. Unit.</th>
                  <th class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in (selected.raw as SaleRecord).items" :key="item.key">
                  <td class="mono code">{{ item.internal_id }}</td>
                  <td class="desc">{{ item.description }}</td>
                  <td class="right mono">{{ item.quantity }}</td>
                  <td class="right mono">{{ fmt(Number(item.unit_price)) }}</td>
                  <td class="right mono">{{ fmt(Number(item.total)) }}</td>
                </tr>
              </tbody>
            </table>
          </template>

          <template v-else-if="selected.kind === 'purchase'">
            <div class="detail-grid">
              <div class="detail-field"><span class="label">Tipo</span><span>{{ (selected.raw as PurchaseRecord).document_type_description }}</span></div>
              <div class="detail-field"><span class="label">N°</span><span class="mono">{{ (selected.raw as PurchaseRecord).number }}</span></div>
              <div class="detail-field"><span class="label">Fecha</span><span>{{ (selected.raw as PurchaseRecord).date_of_issue }}</span></div>
              <div class="detail-field"><span class="label">Proveedor</span><span>{{ (selected.raw as PurchaseRecord).supplier_name || '—' }}</span></div>
              <div class="detail-field"><span class="label">N° Doc. proveedor</span><span class="mono">{{ (selected.raw as PurchaseRecord).supplier_number || '—' }}</span></div>
              <div class="detail-field"><span class="label">Pago</span><span>{{ (selected.raw as PurchaseRecord).payment_state || '—' }}</span></div>
              <div class="detail-field"><span class="label">Moneda</span><span>{{ (selected.raw as PurchaseRecord).currency_type_id }}<template v-if="(selected.raw as PurchaseRecord).currency_type_id === 'USD'"> (T.C. {{ (selected.raw as PurchaseRecord).exchange_rate }})</template></span></div>
              <div class="detail-field"><span class="label">Sin IGV</span><span class="mono">S/. {{ fmt((selected.raw as PurchaseRecord).total_taxed) }}</span></div>
              <div class="detail-field total-field"><span class="label">Total</span><span class="amount-highlight">S/. {{ fmt((selected.raw as PurchaseRecord).total) }}</span></div>
            </div>

            <h4 class="items-title">Items</h4>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th class="right">Cant.</th>
                  <th class="right">Costo unit. (sin IGV)</th>
                  <th class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in (selected.raw as PurchaseRecord).items" :key="i">
                  <td class="mono code">{{ item.internal_id }}</td>
                  <td class="desc">{{ item.description }}</td>
                  <td class="right mono">{{ item.quantity }}</td>
                  <td class="right mono">{{ fmt(item.unit_value) }}</td>
                  <td class="right mono">{{ fmt(item.total) }}</td>
                </tr>
              </tbody>
            </table>
          </template>

          <template v-else>
            <div class="detail-grid">
              <div class="detail-field"><span class="label">Tipo de gasto</span><span>{{ (selected.raw as ExpenseRecord).expense_type_description || '—' }}</span></div>
              <div class="detail-field"><span class="label">Motivo</span><span>{{ (selected.raw as ExpenseRecord).expense_reason_description || '—' }}</span></div>
              <div class="detail-field"><span class="label">N°</span><span class="mono">{{ (selected.raw as ExpenseRecord).number || '—' }}</span></div>
              <div class="detail-field"><span class="label">Fecha</span><span>{{ (selected.raw as ExpenseRecord).date_of_issue }}</span></div>
              <div class="detail-field"><span class="label">Proveedor</span><span>{{ (selected.raw as ExpenseRecord).supplier_name || '—' }}</span></div>
              <div class="detail-field"><span class="label">N° Doc. proveedor</span><span class="mono">{{ (selected.raw as ExpenseRecord).supplier_number || '—' }}</span></div>
              <div class="detail-field"><span class="label">Estado</span><span>{{ (selected.raw as ExpenseRecord).state_type_description || '—' }}</span></div>
              <div class="detail-field total-field"><span class="label">Total</span><span class="amount-highlight">S/. {{ fmt(Number((selected.raw as ExpenseRecord).total)) }}</span></div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drilldown-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
}

.drilldown-panel {
  width: min(720px, 100%);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15);
  animation: slide-in 0.18s ease-out;
}

@keyframes slide-in {
  from { transform: translateX(24px); opacity: 0.6; }
  to { transform: translateX(0); opacity: 1; }
}

.drilldown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.drilldown-title { flex: 1; display: flex; flex-direction: column; }
.drilldown-title h3 { margin: 0; font-size: 1rem; color: #0f172a; }
.drilldown-subtitle { font-size: 0.75rem; color: #64748b; margin-top: 2px; }

.back-btn, .close-btn {
  border: none;
  background: #f1f5f9;
  color: #334155;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.8rem;
  cursor: pointer;
}
.back-btn:hover, .close-btn:hover { background: #e2e8f0; }
.close-btn { font-size: 0.9rem; padding: 6px 10px; }

.drilldown-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
thead th { text-align: left; color: #64748b; font-weight: 600; padding: 8px 6px; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; background: #fff; }
tbody td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9; }
.right { text-align: right; }
.mono { font-family: ui-monospace, monospace; }
.code { color: #475569; }
.desc { max-width: 260px; }

.clickable-row { cursor: pointer; transition: background 0.1s; }
.clickable-row:hover { background: #f8fafc; }

.type-badge {
  color: #fff;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.party-cell { display: flex; flex-direction: column; }
.party-name { color: #0f172a; }
.party-number { color: #94a3b8; font-size: 0.7rem; }

.empty-hint { color: #64748b; font-size: 0.85rem; padding: 24px 0; text-align: center; }

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 24px;
  margin-bottom: 20px;
}
.detail-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.85rem; }
.detail-field .label { color: #64748b; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.02em; }
.total-field { grid-column: 1 / -1; }
.amount-highlight { color: #16a34a; font-weight: 700; font-size: 1.1rem; }

.items-title { font-size: 0.85rem; color: #334155; margin: 0 0 8px; }
</style>
