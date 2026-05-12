import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { SaleRecord } from './proxy'

// ── Schema ────────────────────────────────────────────────────────────────────

interface CachedRecord extends SaleRecord {
  _month: string // YYYY-MM — índice para búsquedas rápidas
}

interface SyncEntry {
  key: string       // YYYY-MM
  synced_at: string // ISO timestamp
  count: number
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
}

const DB_NAME = 'oceans-analytics'
const DB_VERSION = 1

let _db: IDBPDatabase<OceansDB> | null = null

async function getDB(): Promise<IDBPDatabase<OceansDB>> {
  if (_db) return _db
  _db = await openDB<OceansDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('records')) {
        const store = db.createObjectStore('records', { autoIncrement: true })
        store.createIndex('by_month', '_month')
      }
      if (!db.objectStoreNames.contains('sync_registry')) {
        db.createObjectStore('sync_registry')
      }
    },
  })
  return _db
}

// ── Registry ──────────────────────────────────────────────────────────────────

export async function getSyncRegistry(): Promise<Record<string, SyncEntry>> {
  const db = await getDB()
  const keys = await db.getAllKeys('sync_registry')
  const values = await db.getAll('sync_registry')
  const result: Record<string, SyncEntry> = {}
  keys.forEach((k, i) => { if (values[i]) result[k] = values[i]! })
  return result
}

export async function isSynced(monthKey: string): Promise<boolean> {
  const db = await getDB()
  return !!(await db.get('sync_registry', monthKey))
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getRecordsForMonths(monthKeys: string[]): Promise<SaleRecord[]> {
  const db = await getDB()
  const results: SaleRecord[] = []
  for (const month of monthKeys) {
    const recs = await db.getAllFromIndex('records', 'by_month', month)
    results.push(...recs)
  }
  return results
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function saveRecordsForMonth(monthKey: string, records: SaleRecord[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['records', 'sync_registry'], 'readwrite')
  const recStore = tx.objectStore('records')
  const regStore = tx.objectStore('sync_registry')

  for (const r of records) {
    await recStore.add({ ...r, _month: monthKey })
  }

  await regStore.put({ key: monthKey, synced_at: new Date().toISOString(), count: records.length }, monthKey)
  await tx.done
}

// ── Delete ────────────────────────────────────────────────────────────────────

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
  const tx = db.transaction(['records', 'sync_registry'], 'readwrite')
  await tx.objectStore('records').clear()
  await tx.objectStore('sync_registry').clear()
  await tx.done
}
