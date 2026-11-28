/**
 * Serve the built Mintmark worker from our own box, with no Cloudflare in the path.
 *
 * The worker (`src/worker/index.ts`, built to `dist/mintmark/index.js`) expects two
 * bindings, and this supplies both without touching the worker code:
 *
 *   ASSETS  — `fetch()` over `dist/client`, with the same SPA fallback the Sites
 *             deployment used, so an unknown path returns the app shell.
 *   DB      — D1's surface (`prepare/bind/first/all/run/batch/exec`) over a local
 *             SQLite file, because the worker creates its own schema on first use.
 *
 * `MINTMARK_API_KEY` is read from the environment, exactly as it was on the hosted
 * deployment, so the gateway key never ships inside the image. The optional
 * `MINTMARK_*` overrides (gateway URL and model, the daily deployment ceiling)
 * are passed through the same way.
 *
 * One deliberate behaviour lives here rather than in the worker: on a brand-new
 * database the free-appraisal default is written once (`requireKey = 0`), matching
 * what the live deployment ran with. A key pasted into `/admin` still wins.
 */
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const PORT = Number(process.env.PORT ?? 8080)
const DATA_DIR = process.env.DATA_DIR ?? '/data'
const DIST = resolve(process.cwd(), 'dist/client')
const WORKER = resolve(process.cwd(), 'dist/mintmark/index.js')

mkdirSync(DATA_DIR, { recursive: true })

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** The part of D1's API this worker actually calls. */
class Statement {
  constructor(db, sql, args = []) {
    this.db = db
    this.sql = sql
    this.args = args
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args)
  }

  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.args)
    if (!row) return null
    return column ? row[column] : row
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true, meta: {} }
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.args)
    return {
      success: true,
      meta: { changes: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0) },
    }
  }
}

class D1 {
  constructor(file) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  }

  prepare(sql) {
    return new Statement(this.db, sql)
  }

  async batch(statements) {
    const out = []
    for (const statement of statements) out.push(await statement.run())
    return out
  }

  async exec(sql) {
    this.db.exec(sql)
    return { count: 0, duration: 0 }
  }
}

/** Read-only static handler over the built client, with an SPA fallback. */
const assets = {
  async fetch(input) {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const pathname = decodeURIComponent(new URL(raw, 'http://localhost').pathname)
    const wanted = pathname.endsWith('/') ? `${pathname}index.html` : pathname
    // Resolve inside DIST only: a decoded `..` must not escape the document root.
    let file = normalize(join(DIST, wanted))
    if (!file.startsWith(DIST)) file = join(DIST, 'index.html')
    if (!existsSync(file) || !statSync(file).isFile()) file = join(DIST, 'index.html')
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    const body = Readable.toWeb(createReadStream(file))
    const immutable = /\.[0-9a-f]{8,}\.(js|css|woff2?)$/.test(file)
    return new Response(body, {
      headers: {
        'content-type': type,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    })
  },
}

const db = new D1(join(DATA_DIR, 'mintmark.sqlite'))
// New database: the deployment this replaced served free appraisals.
try {
  db.db
    .prepare('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)')
    .run()
  // The setting is `require_key` (see src/worker/gateway.ts); '0' means a key is
  // not demanded of the visitor.
  const existing = db.db.prepare("SELECT value FROM app_settings WHERE key = 'require_key'").get()
  if (!existing) {
    db.db
      .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('require_key', '0', Date.now())
  }
} catch (error) {
  console.error('could not seed settings:', error)
}

const env = {
  ASSETS: assets,
  DB: db,
  MINTMARK_API_KEY: process.env.MINTMARK_API_KEY,
  MINTMARK_BASE_URL: process.env.MINTMARK_BASE_URL,
  MINTMARK_MODEL: process.env.MINTMARK_MODEL,
  MINTMARK_DAILY_DEPLOYMENT_LIMIT: process.env.MINTMARK_DAILY_DEPLOYMENT_LIMIT,
}

const ctx = { waitUntil() {}, passThroughOnException() {} }
const worker = (await import(pathToFileURL(WORKER).href)).default

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `127.0.0.1:${PORT}`
    const url = `http://${host}${req.url ?? '/'}`
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value)
      else if (Array.isArray(value)) headers.set(name, value.join(', '))
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
    })
    const response = await worker.fetch(request, env, ctx)

    res.statusCode = response.status
    for (const [name, value] of response.headers) res.setHeader(name, value)
    if (!response.body) return res.end()
    Readable.fromWeb(response.body).pipe(res)
  } catch (error) {
    console.error('request failed:', error)
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'Something went wrong.' }))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mintmark selfhost listening on :${PORT} (data ${DATA_DIR}, assets ${DIST})`)
})
