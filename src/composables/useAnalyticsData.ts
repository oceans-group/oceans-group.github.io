import { ref, computed, provide, inject, type InjectionKey } from 'vue'
import {
  fetchAllCustomers, fetchPersonTypes, fetchProductCatalog,
  type SaleRecord, type ExpenseRecord, type PurchaseRecord, type Period, type PersonType, type CustomerCacheEntry,
  type CatalogItem,
} from '../services/proxy'
import { netFactor } from '../utils/igv'
import {
  loadRecordsForRange, loadExpensesForRange, loadPurchasesForRange, getMonthsStatus,
  type AnalyticsProgress, type MonthStatus,
} from '../services/analytics'
import { monthlyCache, clearAllCache, getCustomerCacheFromDB, saveCustomerCacheToDB } from '../services/cache'
import type { DrilldownDoc } from '../components/DrilldownModal.vue'

export interface ProductRow {
  internal_id: string
  description: string
  quantity: number
  total: number
  /** Venta neta: sin el IGV a pagar (las notas de venta no se declaran y van completas) */
  net: number
  /** Costo de lo vendido sin IGV; null si el producto no tiene costo en el catálogo */
  cost: number | null
}

export interface CostIssue {
  internal_id: string
  description: string
  issue: 'sin-costo' | 'margen-negativo'
  net: number
  cost: number | null
}

export interface ClientRow {
  customer_id: number
  customer_number: string
  customer_name: string
  person_type: string
  telephone: string
  count: number
  total: number
  last_purchase: string
}

export interface InactiveClientRow extends ClientRow {
  days_inactive: number
}

/**
 * Estado y datos del dashboard de análisis: filtros, carga (caché + proxy), catálogo de clientes
 * y agregados compartidos por varias secciones. Se crea una vez en la vista y las secciones lo
 * obtienen con useAnalyticsData().
 */
export function createAnalyticsData() {
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  // ── Periodo ─────────────────────────────────────────────────────────────────

  const period = ref<Period>('between_dates')
  const dateStart = ref(today.slice(0, 4) + '-01-01')
  const dateEnd = ref(today)
  const monthStart = ref(thisMonth)
  const monthEnd = ref(thisMonth)

  function effectiveDates() {
    if (period.value === 'date') return { start: dateStart.value, end: dateStart.value }
    if (period.value === 'month') return { start: `${monthStart.value}-01`, end: new Date(parseInt(monthStart.value.slice(0,4)), parseInt(monthStart.value.slice(5,7)), 0).toISOString().slice(0,10) }
    if (period.value === 'between_months') return { start: `${monthStart.value}-01`, end: new Date(parseInt(monthEnd.value.slice(0,4)), parseInt(monthEnd.value.slice(5,7)), 0).toISOString().slice(0,10) }
    return { start: dateStart.value, end: dateEnd.value }
  }

  // ── Carga de ventas, gastos y compras ───────────────────────────────────────

  const records = ref<SaleRecord[]>([])
  const expenses = ref<ExpenseRecord[]>([])
  const purchases = ref<PurchaseRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** Fallos que no impiden mostrar el resto (p. ej. no cargaron las compras) */
  const warnings = ref<string[]>([])
  const loadProgress = ref<AnalyticsProgress | null>(null)
  const loadProgressExp = ref<AnalyticsProgress | null>(null)
  const loadProgressPur = ref<AnalyticsProgress | null>(null)
  /** Catálogo de productos por código; vacío si no cargó (la utilidad no se puede calcular) */
  const catalog = ref<Record<string, CatalogItem>>({})
  const monthsStatus = ref<MonthStatus[]>([])

  /** Limpia un mes de la caché local en ventas, gastos y compras */
  async function clearCachedMonth(monthKey: string) {
    await monthlyCache('sales').clearMonth(monthKey)
    await monthlyCache('expenses').clearMonth(monthKey)
    await monthlyCache('purchases').clearMonth(monthKey)
  }

  function baseFilter() {
    return { personTypeIds: [] as number[] }
  }

  async function load() {
    loading.value = true
    loadProgress.value = null
    error.value = null
    warnings.value = []
    try {
      const { start, end } = effectiveDates()
      monthsStatus.value = await getMonthsStatus(start, end)
      const [recs, exps, purs, items] = await Promise.all([
        loadRecordsForRange(start, end, baseFilter(), (p) => { loadProgress.value = p }),
        loadExpensesForRange(start, end, baseFilter(), (p) => { loadProgressExp.value = p }).catch((e) => {
          console.error('[gastos]', e?.response?.data ?? e?.message ?? e)
          return []
        }),
        loadPurchasesForRange(start, end, baseFilter(), (p) => { loadProgressPur.value = p }).catch((e) => {
          console.error('[compras]', e?.response?.data ?? e?.message ?? e)
          warnings.value.push('No se pudieron cargar las compras: los totales de compras y flujo de caja están incompletos.')
          return []
        }),
        fetchProductCatalog().catch((e) => {
          console.error('[catálogo]', e?.response?.data ?? e?.message ?? e)
          warnings.value.push('No se pudo cargar el catálogo de productos: no se puede calcular el costo de ventas ni la utilidad.')
          return []
        }),
      ])
      catalog.value = Object.fromEntries(items.map((it) => [it.internal_id, it]))
      records.value = recs
      expenses.value = exps
      purchases.value = purs
      monthsStatus.value = await getMonthsStatus(start, end)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error al cargar los datos'
    } finally {
      loading.value = false
      loadProgress.value = null
      loadProgressExp.value = null
      loadProgressPur.value = null
    }
  }

  async function forceReload() {
    for (const m of monthsStatus.value) {
      if (m.cached || m.partialCached) await clearCachedMonth(m.month)
    }
    monthsStatus.value = monthsStatus.value.map((m) => ({ ...m, cached: false, partialCached: false }))
    await load()
  }

  async function invalidateMonth(monthKey: string) {
    await clearCachedMonth(monthKey)
    monthsStatus.value = monthsStatus.value.map((m) =>
      m.month === monthKey ? { ...m, cached: false } : m,
    )
  }

  async function invalidateAll() {
    await clearAllCache()
    monthsStatus.value = monthsStatus.value.map((m) => ({ ...m, cached: false }))
  }

  // ── Catálogo de clientes ────────────────────────────────────────────────────

  const customerMap = ref<Record<string, CustomerCacheEntry>>({})
  const cacheLastUpdated = ref<string | null>(null)
  const cacheRefreshing = ref(false)
  const loadingCustomers = ref(false)
  const customerProgress = ref({ loaded: 0, total: 0 })
  const personTypes = ref<PersonType[]>([])

  async function loadCustomerCache() {
    // 1. IndexedDB primero (TTL 48h) — instantáneo, sin indicador
    const local = await getCustomerCacheFromDB()
    if (local) {
      customerMap.value = local.data
      cacheLastUpdated.value = local.cached_at
      return
    }
    // 2. Sin caché válida → fetch paginado del proxy con indicador
    loadingCustomers.value = true
    customerProgress.value = { loaded: 0, total: 0 }
    try {
      const data = await fetchAllCustomers((loaded, total) => {
        customerProgress.value = { loaded, total }
      })
      const now = new Date().toISOString()
      customerMap.value = data
      cacheLastUpdated.value = now
      await saveCustomerCacheToDB(data, now)
    } catch {
      customerMap.value = {}
    } finally {
      loadingCustomers.value = false
    }
  }

  async function refreshCustomers() {
    cacheRefreshing.value = true
    try {
      const data = await fetchAllCustomers()
      const now = new Date().toISOString()
      customerMap.value = data
      cacheLastUpdated.value = now
      await saveCustomerCacheToDB(data, now)
    } finally {
      cacheRefreshing.value = false
    }
  }

  async function init() {
    // Clientes primero — el filtro por tipo los necesita listos antes de cargar ventas
    await loadCustomerCache()
    await Promise.all([
      load(),
      fetchPersonTypes().then((r) => { personTypes.value = r }).catch(() => {}),
    ])
  }

  // ── Filtros sobre las ventas cargadas ───────────────────────────────────────

  const selectedPersonTypeIds = ref<number[]>([])
  const documentTypeFilter = ref('')
  const selectedProductCodes = ref<string[]>([])

  const allProductOptions = computed(() => {
    const map = new Map<string, string>()
    for (const r of records.value) {
      for (const item of r.items ?? []) {
        if (item.internal_id && !map.has(item.internal_id))
          map.set(item.internal_id, item.description)
      }
    }
    return [...map.entries()]
      .map(([id, description]) => ({ id, description }))
      .sort((a, b) => a.description.localeCompare(b.description))
  })

  const activeRecords = computed(() => {
    let result = records.value

    if (documentTypeFilter.value)
      result = result.filter((r) => r.document_type_id === documentTypeFilter.value)

    if (selectedPersonTypeIds.value.length > 0)
      result = result.filter((r) => {
        const entry = customerMap.value[r.customer_id]
        return entry && selectedPersonTypeIds.value.includes(entry.person_type_id ?? -1)
      })

    if (selectedProductCodes.value.length > 0)
      result = result.filter((r) =>
        r.items?.some((item) => selectedProductCodes.value.includes(item.internal_id)),
      )

    return result
  })

  // ── Agregados compartidos ───────────────────────────────────────────────────

  const totalSales = computed(() => activeRecords.value.reduce((s, r) => s + Number(r.total), 0))
  const totalExpenses = computed(() => expenses.value.reduce((s, e) => s + Number(e.total), 0))
  /** Compras reales del periodo: sin la compra de saldo inicial de inventario */
  const periodPurchases = computed(() => purchases.value.filter((p) => !p.is_opening_balance))
  const totalPurchases = computed(() => periodPurchases.value.reduce((s, p) => s + p.total, 0))
  const openingBalanceTotal = computed(() =>
    purchases.value.filter((p) => p.is_opening_balance).reduce((s, p) => s + p.total, 0),
  )
  const totalDocs = computed(() => activeRecords.value.length)
  const totalClients = computed(() => new Set(activeRecords.value.map((r) => r.customer_number)).size)

  const catalogReady = computed(() => Object.keys(catalog.value).length > 0)

  /** Costo unitario sin IGV del producto, o null si no tiene costo cargado */
  function unitCost(internalId: string): number | null {
    const cost = catalog.value[internalId]?.cost
    return cost ? cost : null
  }

  /** Costo sin IGV de lo vendido en un documento (solo productos con costo) */
  function recordCost(r: SaleRecord): number {
    let cost = 0
    for (const item of r.items ?? []) cost += (unitCost(item.internal_id) ?? 0) * Number(item.quantity)
    return cost
  }

  /** Ventas por producto (sin ordenar: cada sección ordena según su criterio). */
  const productStats = computed<ProductRow[]>(() => {
    const map = new Map<string, ProductRow>()
    for (const record of activeRecords.value) {
      const factor = netFactor(record)
      for (const item of record.items ?? []) {
        if (!item.internal_id) continue
        const key = item.internal_id
        const unit = unitCost(key)
        const row = map.get(key) ?? { internal_id: item.internal_id, description: item.description, quantity: 0, total: 0, net: 0, cost: unit === null ? null : 0 }
        row.quantity += Number(item.quantity)
        row.total += Number(item.total)
        row.net += Number(item.total) * factor
        if (row.cost !== null && unit !== null) row.cost += unit * Number(item.quantity)
        map.set(key, row)
      }
    }
    return [...map.values()]
  })

  // ── Utilidad (sin IGV a pagar; ver utils/igv.ts) ────────────────────────────

  const netSales = computed(() => activeRecords.value.reduce((s, r) => s + Number(r.total) * netFactor(r), 0))
  const costOfSales = computed(() => productStats.value.reduce((s, p) => s + (p.cost ?? 0), 0))
  const grossProfit = computed(() => netSales.value - costOfSales.value)
  const netProfit = computed(() => grossProfit.value - totalExpenses.value)
  /** Ventas netas de productos sin costo: su costo no se descuenta y la utilidad sale inflada */
  const uncostedSales = computed(() => productStats.value.reduce((s, p) => s + (p.cost === null ? p.net : 0), 0))

  /** Productos vendidos cuyo costo hay que revisar en el catálogo de facturaofitec */
  const costIssues = computed<CostIssue[]>(() => {
    if (!catalogReady.value) return []
    const issues: CostIssue[] = []
    for (const p of productStats.value) {
      if (p.net <= 0) continue
      if (p.cost === null) issues.push({ internal_id: p.internal_id, description: p.description, issue: 'sin-costo', net: p.net, cost: null })
      else if (p.cost > p.net) issues.push({ internal_id: p.internal_id, description: p.description, issue: 'margen-negativo', net: p.net, cost: p.cost })
    }
    return issues.sort((a, b) => Math.abs((b.cost ?? 0) - b.net) - Math.abs((a.cost ?? 0) - a.net))
  })

  /** Ventas por cliente (sin ordenar). */
  const clientStats = computed<ClientRow[]>(() => {
    const map = new Map<string, ClientRow>()
    for (const r of activeRecords.value) {
      const existing = map.get(r.customer_number)
      const cm = customerMap.value[r.customer_id]
      const row: ClientRow = existing ?? {
        customer_id: r.customer_id,
        customer_number: r.customer_number,
        customer_name: r.customer_name,
        person_type: cm?.person_type || '—',
        telephone: cm?.telephone || '—',
        count: 0,
        total: 0,
        last_purchase: r.date_of_issue,
      }
      if (r.date_of_issue > row.last_purchase) row.last_purchase = r.date_of_issue
      row.count += 1
      row.total += Number(r.total)
      map.set(r.customer_number, row)
    }
    return [...map.values()]
  })

  /** Clientes ordenados por días sin comprar (mayor primero; a igual días, mayor importe). */
  const inactiveClients = computed<InactiveClientRow[]>(() => {
    const msPerDay = 86_400_000
    return [...clientStats.value]
      .sort((a, b) => b.total - a.total)
      .map((r) => ({
        ...r,
        days_inactive: Math.floor((Date.parse(today) - Date.parse(r.last_purchase)) / msPerDay),
      }))
      .sort((a, b) => b.days_inactive - a.days_inactive)
  })

  // ── Drill-down de documentos ────────────────────────────────────────────────

  const drilldown = ref<{ open: boolean; title: string; docs: DrilldownDoc[] }>({ open: false, title: '', docs: [] })

  function openDrilldown(title: string, docs: DrilldownDoc[]) {
    drilldown.value = { open: true, title, docs: [...docs].sort((a, b) => b.date.localeCompare(a.date)) }
  }

  function closeDrilldown() {
    drilldown.value.open = false
  }

  return {
    period, dateStart, dateEnd, monthStart, monthEnd,
    records, expenses, purchases, catalog, catalogReady, loading, error, warnings, loadProgress, loadProgressExp, loadProgressPur, monthsStatus,
    load, forceReload, invalidateMonth, invalidateAll, init,
    customerMap, cacheLastUpdated, cacheRefreshing, loadingCustomers, customerProgress, personTypes,
    refreshCustomers,
    selectedPersonTypeIds, documentTypeFilter, selectedProductCodes, allProductOptions, activeRecords,
    totalSales, totalExpenses, periodPurchases, totalPurchases, openingBalanceTotal, totalDocs, totalClients,
    netSales, costOfSales, grossProfit, netProfit, uncostedSales, costIssues, recordCost, productStats, clientStats, inactiveClients,
    drilldown, openDrilldown, closeDrilldown,
  }
}

export type AnalyticsData = ReturnType<typeof createAnalyticsData>

const ANALYTICS_KEY: InjectionKey<AnalyticsData> = Symbol('analytics-data')

/** Crea el estado del dashboard y lo comparte con los componentes hijos. */
export function provideAnalyticsData(): AnalyticsData {
  const data = createAnalyticsData()
  provide(ANALYTICS_KEY, data)
  return data
}

export function useAnalyticsData(): AnalyticsData {
  const data = inject(ANALYTICS_KEY)
  if (!data) throw new Error('useAnalyticsData() requiere provideAnalyticsData() en un componente padre')
  return data
}
