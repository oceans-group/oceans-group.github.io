import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { SaleRecord, CustomerCacheEntry, ExpenseRecord } from './proxy'

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
  metadata: {
    key: string
    value: CustomerMeta
  }
}

const DB_NAME = 'oceans-analytics'
const DB_VERSION = 4

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
    },
  })
  return _db
}

// ── Sync registry ─────────────────────────────────────────────────────────────

export async function getSyncRegistry(): Promise<Record<string, SyncEntry>> {
  const db = await getDB()
  const keys = await db.getAllKeys('sync_registry')
  const values = await db.getAll('sync_registry')
  const result: Record<string, SyncEntry> = {}
  keys.forEach((k, i) => { if (values[i]) result[k] = values[i]! })
  return result
}

export async function getSyncEntry(monthKey: string): Promise<SyncEntry | undefined> {
  const db = await getDB()
  return db.get('sync_registry', monthKey)
}

/** Mes completamente sincronizado (no parcial) */
export async function isFullySynced(monthKey: string): Promise<boolean> {
  const entry = await getSyncEntry(monthKey)
  return !!entry && !entry.partial_end
}

/** Mes parcialmente sincronizado — devuelve hasta qué fecha cubre */
export async function getPartialEnd(monthKey: string): Promise<string | null> {
  const entry = await getSyncEntry(monthKey)
  return entry?.partial_end ?? null
}

// ── Sales records ─────────────────────────────────────────────────────────────

export async function getRecordsForMonths(monthKeys: string[]): Promise<SaleRecord[]> {
  const db = await getDB()
  const results: SaleRecord[] = []
  for (const month of monthKeys) {
    const recs = await db.getAllFromIndex('records', 'by_month', month)
    results.push(...recs)
  }
  return results
}

export interface SaveOptions {
  partial_end?: string // si se proporciona, es una caché parcial hasta este día
}

export async function saveRecordsForMonth(
  monthKey: string,
  records: SaleRecord[],
  options: SaveOptions = {},
): Promise<void> {
  const db = await getDB()
  // Borrar registros anteriores de este mes (en caso de reemplazo de parcial)
  const tx1 = db.transaction(['records', 'sync_registry'], 'readwrite')
  const idx = tx1.objectStore('records').index('by_month')
  let cursor = await idx.openKeyCursor(IDBKeyRange.only(monthKey))
  while (cursor) {
    await tx1.objectStore('records').delete(cursor.primaryKey)
    cursor = await cursor.continue()
  }
  await tx1.objectStore('sync_registry').delete(monthKey)
  await tx1.done

  // Guardar nuevos registros
  const tx2 = db.transaction(['records', 'sync_registry'], 'readwrite')
  for (const r of records) await tx2.objectStore('records').add({ ...r, _month: monthKey })
  const entry: SyncEntry = {
    key: monthKey,
    synced_at: new Date().toISOString(),
    count: records.length,
    ...(options.partial_end ? { partial_end: options.partial_end } : {}),
  }
  await tx2.objectStore('sync_registry').put(entry, monthKey)
  await tx2.done
}

export async function clearMonth(monthKey: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['records', 'sync_registry'], 'readwrite')
  const idx = tx.objectStore('records').index('by_month')
  let cursor = await idx.openKeyCursor(IDBKeyRange.only(monthKey))
  while (cursor) {
    await tx.objectStore('records').delete(cursor.primaryKey)
    cursor = await cursor.continue()
  }
  await tx.objectStore('sync_registry').delete(monthKey)
  await tx.done
}

export async function clearAllCache(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['records', 'sync_registry', 'expenses', 'sync_expenses', 'metadata'], 'readwrite')
  await tx.objectStore('records').clear()
  await tx.objectStore('sync_registry').clear()
  await tx.objectStore('expenses').clear()
  await tx.objectStore('sync_expenses').clear()
  await tx.objectStore('metadata').clear()
  await tx.done
}

// ── Gastos ────────────────────────────────────────────────────────────────────

export async function getExpenseSyncEntry(monthKey: string): Promise<SyncEntry | undefined> {
  const db = await getDB()
  return db.get('sync_expenses', monthKey)
}

export async function isExpenseFullySynced(monthKey: string): Promise<boolean> {
  const entry = await getExpenseSyncEntry(monthKey)
  return !!entry && !entry.partial_end
}

export async function getExpensePartialEnd(monthKey: string): Promise<string | null> {
  const entry = await getExpenseSyncEntry(monthKey)
  return entry?.partial_end ?? null
}

export async function getExpensesForMonths(monthKeys: string[]): Promise<ExpenseRecord[]> {
  const db = await getDB()
  const results: ExpenseRecord[] = []
  for (const month of monthKeys) {
    const recs = await db.getAllFromIndex('expenses', 'by_month', month)
    results.push(...recs)
  }
  return results
}

export async function saveExpensesForMonth(
  monthKey: string,
  records: ExpenseRecord[],
  options: SaveOptions = {},
): Promise<void> {
  const db = await getDB()
  const tx1 = db.transaction(['expenses', 'sync_expenses'], 'readwrite')
  const idx = tx1.objectStore('expenses').index('by_month')
  let cursor = await idx.openKeyCursor(IDBKeyRange.only(monthKey))
  while (cursor) {
    await tx1.objectStore('expenses').delete(cursor.primaryKey)
    cursor = await cursor.continue()
  }
  await tx1.objectStore('sync_expenses').delete(monthKey)
  await tx1.done

  const tx2 = db.transaction(['expenses', 'sync_expenses'], 'readwrite')
  for (const r of records) await tx2.objectStore('expenses').add({ ...r, _month: monthKey })
  await tx2.objectStore('sync_expenses').put(
    { key: monthKey, synced_at: new Date().toISOString(), count: records.length, ...(options.partial_end ? { partial_end: options.partial_end } : {}) },
    monthKey,
  )
  await tx2.done
}

export async function clearExpenseMonth(monthKey: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['expenses', 'sync_expenses'], 'readwrite')
  const idx = tx.objectStore('expenses').index('by_month')
  let cursor = await idx.openKeyCursor(IDBKeyRange.only(monthKey))
  while (cursor) {
    await tx.objectStore('expenses').delete(cursor.primaryKey)
    cursor = await cursor.continue()
  }
  await tx.objectStore('sync_expenses').delete(monthKey)
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
