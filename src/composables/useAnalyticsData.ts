import { ref, computed, provide, inject, type InjectionKey } from 'vue'
import {
  fetchAllCustomers, fetchPersonTypes,
  type SaleRecord, type ExpenseRecord, type Period, type PersonType, type CustomerCacheEntry,
} from '../services/proxy'
import {
  loadRecordsForRange, loadExpensesForRange, getMonthsStatus,
  type AnalyticsProgress, type MonthStatus,
} from '../services/analytics'
import { clearMonth, clearExpenseMonth, clearAllCache, getCustomerCacheFromDB, saveCustomerCacheToDB } from '../services/cache'
import type { DrilldownDoc } from '../components/DrilldownModal.vue'

export interface ProductRow {
  internal_id: string
  description: string
  quantity: number
  total: number
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
function createAnalyticsData() {
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

  // ── Carga de ventas y gastos ────────────────────────────────────────────────

  const records = ref<SaleRecord[]>([])
  const expenses = ref<ExpenseRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loadProgress = ref<AnalyticsProgress | null>(null)
  const loadProgressExp = ref<AnalyticsProgress | null>(null)
  const monthsStatus = ref<MonthStatus[]>([])

  function baseFilter() {
    return { personTypeIds: [] as number[] }
  }

  async function load() {
    loading.value = true
    loadProgress.value = null
    error.value = null
    try {
      const { start, end } = effectiveDates()
      monthsStatus.value = await getMonthsStatus(start, end)
      const [recs, exps] = await Promise.all([
        loadRecordsForRange(start, end, baseFilter(), (p) => { loadProgress.value = p }),
        loadExpensesForRange(start, end, baseFilter(), (p) => { loadProgressExp.value = p }).catch((e) => {
          console.error('[gastos]', e?.response?.data ?? e?.message ?? e)
          return []
        }),
      ])
      records.value = recs
      expenses.value = exps
      monthsStatus.value = await getMonthsStatus(start, end)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error al cargar los datos'
    } finally {
      loading.value = false
      loadProgress.value = null
      loadProgressExp.value = null
    }
  }

  async function forceReload() {
    for (const m of monthsStatus.value) {
      if (m.cached || m.partialCached) {
        await clearMonth(m.month)
        await clearExpenseMonth(m.month)
      }
    }
    monthsStatus.value = monthsStatus.value.map((m) => ({ ...m, cached: false, partialCached: false }))
    await load()
  }

  async function invalidateMonth(monthKey: string) {
    await clearMonth(monthKey)
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
  const totalDocs = computed(() => activeRecords.value.length)
  const totalClients = computed(() => new Set(activeRecords.value.map((r) => r.customer_number)).size)

  /** Ventas por producto (sin ordenar: cada sección ordena según su criterio). */
  const productStats = computed<ProductRow[]>(() => {
    const map = new Map<string, ProductRow>()
    for (const record of activeRecords.value) {
      for (const item of record.items ?? []) {
        if (!item.internal_id) continue
        const key = item.internal_id
        const row = map.get(key) ?? { internal_id: item.internal_id, description: item.description, quantity: 0, total: 0 }
        row.quantity += Number(item.quantity)
        row.total += Number(item.total)
        map.set(key, row)
      }
    }
    return [...map.values()]
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
    records, expenses, loading, error, loadProgress, loadProgressExp, monthsStatus,
    load, forceReload, invalidateMonth, invalidateAll, init,
    customerMap, cacheLastUpdated, cacheRefreshing, loadingCustomers, customerProgress, personTypes,
    refreshCustomers,
    selectedPersonTypeIds, documentTypeFilter, selectedProductCodes, allProductOptions, activeRecords,
    totalSales, totalExpenses, totalDocs, totalClients, productStats, clientStats, inactiveClients,
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
