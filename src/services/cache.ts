import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { SaleRecord, CustomerCacheEntry, ExpenseRecord, PurchaseRecord } from './proxy'
import type { KardexMove } from './inventory'

// ── Schema ────────────────────────────────────────────────────────────────────

interface CachedRecord extends SaleRecord {
  _month: string
}

interface SyncEntry {
  key: string
  synced_at: string
  count: number
  partial_end?: string // si está presente: caché parcial hasta esta fecha (inclusive)
}

interface CustomerMeta {
  data: Record<string, CustomerCacheEntry>
  cached_at: string
  total: number
}

interface CachedExpense extends ExpenseRecord {
  _month: string
}

interface CachedPurchase extends PurchaseRecord {
  _month: string
}

interface CachedKardex extends KardexMove {
  _month: string
}

interface OceansDB extends DBSchema {
  records: {
    key: number
    value: CachedRecord
    indexes: { by_month: string }
  }
  sync_registry: {
    key: string
    value: SyncEntry
  }
  expenses: {
    key: number
    value: CachedExpense
    indexes: { by_month: string }
  }
  sync_expenses: {
    key: string
    value: SyncEntry
  }
  purchases: {
    key: number
    value: CachedPurchase
    indexes: { by_month: string }
  }
  sync_purchases: {
    key: string
    value: SyncEntry
  }
  kardex: {
    key: number
    value: CachedKardex
    indexes: { by_month: string }
  }
  sync_kardex: {
    key: string
    value: SyncEntry
  }
  metadata: {
    key: string
    value: CustomerMeta
  }
}

const DB_NAME = 'oceans-analytics'
const DB_VERSION = 7

let _db: IDBPDatabase<OceansDB> | null = null

async function getDB(): Promise<IDBPDatabase<OceansDB>> {
  if (_db) return _db
  _db = await openDB<OceansDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const store = db.createObjectStore('records', { autoIncrement: true })
        store.createIndex('by_month', '_month')
        db.createObjectStore('sync_registry')
      }
      if (oldVersion < 2) {
        db.createObjectStore('metadata')
      }
      if (oldVersion < 3) {
        const exp = db.createObjectStore('expenses', { autoIncrement: true })
        exp.createIndex('by_month', '_month')
        db.createObjectStore('sync_expenses')
      }
      if (oldVersion > 0 && oldVersion < 4) {
        // Se corrigió el filtrado de documentos anulados/rechazados y notas de venta
        // sin pago confirmado: se limpia la caché de ventas para forzar un refetch.
        transaction.objectStore('records').clear()
        transaction.objectStore('sync_registry').clear()
      }
      if (oldVersion > 0 && oldVersion < 5) {
        // Los gastos anulados ya no se guardan: se limpia la caché de gastos para forzar un refetch.
        transaction.objectStore('expenses').clear()
        transaction.objectStore('sync_expenses').clear()
      }
      if (oldVersion < 6) {
        const pur = db.createObjectStore('purchases', { autoIncrement: true })
        pur.createIndex('by_month', '_month')
        db.createObjectStore('sync_purchases')
      }
      if (oldVersion < 7) {
        const kdx = db.createObjectStore('kardex', { autoIncrement: true })
        kdx.createIndex('by_month', '_month')
        db.createObjectStore('sync_kardex')
      }
    },
  })
  return _db
}

// ── Caché mensual (ventas, gastos, compras) ─────────────────────────────────

/** Tipo de dato guardado por mes y sus dos stores: registros (índice by_month) y registro de sincronización */
const MONTHLY_STORES = {
  sales: { data: 'records', sync: 'sync_registry' },
  expenses: { data: 'expenses', sync: 'sync_expenses' },
  purchases: { data: 'purchases', sync: 'sync_purchases' },
  kardex: { data: 'kardex', sync: 'sync_kardex' },
} as const

interface MonthlyKinds {
  sales: SaleRecord
  expenses: ExpenseRecord
  purchases: PurchaseRecord
  kardex: KardexMove
}

export type MonthlyKind = keyof MonthlyKinds

export interface SaveOptions {
  partial_end?: string // si se proporciona, es una caché parcial hasta este día
}

export interface MonthlyCache<T> {
  /** Mes completamente sincronizado (no parcial) */
  isFullySynced(monthKey: string): Promise<boolean>
  /** Mes parcialmente sincronizado: hasta qué fecha cubre (null si no hay caché parcial) */
  getPartialEnd(monthKey: string): Promise<string | null>
  getForMonths(monthKeys: string[]): Promise<T[]>
  /** Reemplaza los registros del mes (y su entrada de sincronización) */
  saveForMonth(monthKey: string, records: T[], options?: SaveOptions): Promise<void>
  clearMonth(monthKey: string): Promise<void>
}

export function monthlyCache<K extends MonthlyKind>(kind: K): MonthlyCache<MonthlyKinds[K]> {
  const { data, sync } = MONTHLY_STORES[kind]
  type T = MonthlyKinds[K]

  const getSyncEntry = async (monthKey: string): Promise<SyncEntry | undefined> => (await getDB()).get(sync, monthKey)

  async function deleteMonth(db: IDBPDatabase<OceansDB>, monthKey: string) {
    const tx = db.transaction([data, sync], 'readwrite')
    const store = tx.objectStore(data)
    let cursor = await store.index('by_month').openKeyCursor(IDBKeyRange.only(monthKey))
    while (cursor) {
      await store.delete(cursor.primaryKey)
      cursor = await cursor.continue()
    }
    await tx.objectStore(sync).delete(monthKey)
    await tx.done
  }

  return {
    async isFullySynced(monthKey) {
      const entry = await getSyncEntry(monthKey)
      return !!entry && !entry.partial_end
    },
    async getPartialEnd(monthKey) {
      return (await getSyncEntry(monthKey))?.partial_end ?? null
    },
    async getForMonths(monthKeys) {
      const db = await getDB()
      const results: T[] = []
      // La store de `kind` guarda exactamente T (+ _month); idb devuelve la unión de las tres
      for (const month of monthKeys) results.push(...(await db.getAllFromIndex(data, 'by_month', month) as unknown as T[]))
      return results
    },
    async saveForMonth(monthKey, records, options = {}) {
      const db = await getDB()
      // Borrar registros anteriores de este mes (en caso de reemplazo de parcial)
      await deleteMonth(db, monthKey)
      const tx = db.transaction([data, sync], 'readwrite')
      const store = tx.objectStore(data)
      // Las tres stores comparten forma: registro + _month (idb no puede tiparlo con la store como unión)
      for (const r of records) await store.add({ ...r, _month: monthKey } as CachedRecord & CachedExpense & CachedPurchase & CachedKardex)
      const entry: SyncEntry = {
        key: monthKey,
        synced_at: new Date().toISOString(),
        count: records.length,
        ...(options.partial_end ? { partial_end: options.partial_end } : {}),
      }
      await tx.objectStore(sync).put(entry, monthKey)
      await tx.done
    },
    async clearMonth(monthKey) {
      await deleteMonth(await getDB(), monthKey)
    },
  }
}

/** Entradas de sincronización de ventas por mes (para el panel de caché) */
export async function getSyncRegistry(): Promise<Record<string, SyncEntry>> {
  const db = await getDB()
  const keys = await db.getAllKeys('sync_registry')
  const values = await db.getAll('sync_registry')
  const result: Record<string, SyncEntry> = {}
  keys.forEach((k, i) => { if (values[i]) result[k] = values[i]! })
  return result
}

export async function clearAllCache(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['records', 'sync_registry', 'expenses', 'sync_expenses', 'purchases', 'sync_purchases', 'kardex', 'sync_kardex', 'metadata'], 'readwrite')
  await tx.objectStore('records').clear()
  await tx.objectStore('sync_registry').clear()
  await tx.objectStore('expenses').clear()
  await tx.objectStore('sync_expenses').clear()
  await tx.objectStore('purchases').clear()
  await tx.objectStore('sync_purchases').clear()
  await tx.objectStore('kardex').clear()
  await tx.objectStore('sync_kardex').clear()
  await tx.objectStore('metadata').clear()
  await tx.done
}

// ── Customer cache (TTL 48h) ──────────────────────────────────────────────────

const CUSTOMER_TTL = 48 * 60 * 60 * 1000

export async function getCustomerCacheFromDB(): Promise<CustomerMeta | null> {
  const db = await getDB()
  const entry = await db.get('metadata', 'customers')
  if (!entry) return null
  if (Date.now() - Date.parse(entry.cached_at) > CUSTOMER_TTL) return null
  return entry
}

export async function saveCustomerCacheToDB(
  data: Record<string, CustomerCacheEntry>,
  last_updated: string | null,
): Promise<void> {
  const db = await getDB()
  await db.put(
    'metadata',
    { data, cached_at: last_updated ?? new Date().toISOString(), total: Object.keys(data).length },
    'customers',
  )
}
