import type { MiddlewareHandler } from 'hono'

import type { AppraisalSummary } from '../shared/types'
import type { AppContext } from './env'

// Schema lives with the Worker: D1 has no migration tool on Freebuff Sites, so
// tables are created on the first request of each isolate. Add new statements
// at the end; never edit existing ones in place once deployed.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS appraisals (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    value_low REAL NOT NULL,
    value_high REAL NOT NULL,
    currency TEXT NOT NULL,
    grade REAL NOT NULL DEFAULT 0,
    grade_label TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0,
    identified INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL,
    thumb TEXT NOT NULL,
    result TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS appraisals_owner ON appraisals(owner_sub, created_at DESC)`,
  // Admin choices, one row per setting: the gateway key and whether a key is
  // required. The key is stored server-side and never sent back to a browser.
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  // What a visitor has bought. One row per visitor: the latest Pro subscription
  // wins, and an expired row is simply ignored by planFor. Apple's ids are kept
  // for support questions, not for identity — there is still no account.
  `CREATE TABLE IF NOT EXISTS entitlements (
    owner_sub TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    original_transaction_id TEXT NOT NULL DEFAULT '',
    environment TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
]

let ready: Promise<void> | undefined

export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(
    () => undefined,
    (error) => {
      ready = undefined
      throw error
    },
  )
  return ready
}

export const requireDb: MiddlewareHandler<AppContext> = async (c, next) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'database_missing', message: 'No database is attached yet. Add D1 storage named DB and redeploy.' }, 503)
  }
  await ensureSchema(db)
  c.set('db', db)
  await next()
}

export const id = () => crypto.randomUUID()
export const now = () => Date.now()

/** Midnight UTC that started the current day, and the next one. */
export function utcDay(at = now()): { start: number; end: number } {
  const start = new Date(at)
  start.setUTCHours(0, 0, 0, 0)
  return { start: start.getTime(), end: start.getTime() + 86_400_000 }
}

/** Appraisals generated today by this visitor: each one spent API credits. */
export async function appraisalsToday(db: D1Database, owner: string): Promise<number> {
  const { start } = utcDay()
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM appraisals WHERE owner_sub = ? AND created_at >= ?`)
    .bind(owner, start)
    .first<{ n: number }>()
  return Number(row?.n ?? 0)
}

/** Appraisals across every visitor today: the deployment's spend ceiling. */
export async function appraisalsTodayAll(db: D1Database): Promise<number> {
  const { start } = utcDay()
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM appraisals WHERE created_at >= ?`)
    .bind(start)
    .first<{ n: number }>()
  return Number(row?.n ?? 0)
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare(`SELECT value FROM app_settings WHERE key = ?`).bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function putSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, now())
    .run()
}

export async function deleteSetting(db: D1Database, key: string): Promise<void> {
  await db.prepare(`DELETE FROM app_settings WHERE key = ?`).bind(key).run()
}

export type Entitlement = {
  productId: string
  transactionId: string
  originalTransactionId: string
  /** `production` or `sandbox`: which Apple environment verified it. */
  environment: string
  /** When the subscription lapses, in ms. */
  expiresAt: number
}

export async function readEntitlement(db: D1Database, owner: string): Promise<Entitlement | null> {
  const row = await db
    .prepare(`SELECT product_id, transaction_id, original_transaction_id, environment, expires_at FROM entitlements WHERE owner_sub = ?`)
    .bind(owner)
    .first<Record<string, unknown>>()
  if (!row) return null
  return {
    productId: String(row.product_id ?? ''),
    transactionId: String(row.transaction_id ?? ''),
    originalTransactionId: String(row.original_transaction_id ?? ''),
    environment: String(row.environment ?? ''),
    expiresAt: Number(row.expires_at ?? 0),
  }
}

export async function saveEntitlement(db: D1Database, owner: string, entitlement: Entitlement): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entitlements (owner_sub, product_id, transaction_id, original_transaction_id, environment, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_sub) DO UPDATE SET
         product_id = excluded.product_id,
         transaction_id = excluded.transaction_id,
         original_transaction_id = excluded.original_transaction_id,
         environment = excluded.environment,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
    )
    .bind(owner, entitlement.productId, entitlement.transactionId, entitlement.originalTransactionId, entitlement.environment, entitlement.expiresAt, now())
    .run()
}

export function mapSummary(row: Record<string, unknown>): AppraisalSummary {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    subtitle: String(row.subtitle ?? ''),
    valueLow: Number(row.value_low ?? 0),
    valueHigh: Number(row.value_high ?? 0),
    currency: String(row.currency ?? 'USD'),
    grade: Number(row.grade ?? 0),
    gradeLabel: String(row.grade_label ?? ''),
    confidence: Number(row.confidence ?? 0),
    identified: Boolean(row.identified),
    thumb: String(row.thumb ?? ''),
    createdAt: Number(row.created_at ?? 0),
  }
}
