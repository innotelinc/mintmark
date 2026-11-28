// The deployment ceiling, exercised through the routes that enforce and report
// it rather than through `deploymentLimit` alone. D1 is an in-memory stand-in
// that answers the count queries with a fixed "spent today", so a request that
// is refused here is refused by the handler the deployment actually runs. The
// gateway is stubbed to fail loudly if a refused request ever reaches it: a
// blocked appraisal must not spend a model call.

import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DAILY_APPRAISAL_LIMIT, DAILY_DEPLOYMENT_LIMIT } from '../src/shared/config'
import type { AppContext, Env } from '../src/worker/env'
import { appraisals } from '../src/worker/routes/appraisals'
import { state } from '../src/worker/routes/state'

const PHOTO = `data:image/jpeg;base64,${btoa('a small coin photo')}`

/**
 * Just enough D1 for the reads the two routes make before they decide anything:
 * how many appraisals the deployment and the visitor have used, whether a
 * gateway key is stored (it is not; the key comes from `env`), and whether the
 * visitor has an entitlement (they do not). A write means the route went further
 * than the ceiling, so it throws.
 */
class FakeDb {
  constructor(private readonly spentToday: number) {}

  prepare(sql: string) {
    const spent = this.spentToday
    return {
      bind: (..._params: unknown[]) => ({
        first: async () => {
          if (/COUNT\(\*\) AS n FROM appraisals WHERE created_at >= \?/i.test(sql)) return { n: spent }
          if (/COUNT\(\*\) AS n FROM appraisals WHERE owner_sub = \?/i.test(sql)) return { n: 0 }
          if (/FROM app_settings WHERE key = \?/i.test(sql)) return null
          if (/FROM entitlements WHERE owner_sub = \?/i.test(sql)) return null
          throw new Error(`unexpected query: ${sql}`)
        },
        run: async () => {
          throw new Error(`unexpected write: ${sql}`)
        },
      }),
    }
  }
}

const env = (overrides: Partial<Env> = {}): Env =>
  ({ MINTMARK_API_KEY: 'sk-test-0123456789abcdef', ...overrides }) as unknown as Env

/** Both routes, mounted as index.ts mounts them, with the visitor already set. */
const app = (db: FakeDb, owner = 'visitor-1') => {
  const instance = new Hono<AppContext>()
  instance.use('*', async (c, next) => {
    c.set('db', db as unknown as D1Database)
    c.set('visitor', owner)
    await next()
  })
  instance.route('/api/appraisals', appraisals)
  instance.route('/api/state', state)
  return instance
}

const post = (db: FakeDb, bindings: Env) =>
  app(db).request('/api/appraisals', { method: 'POST', body: JSON.stringify({ image: PHOTO }) }, bindings)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/appraisals and a lowered deployment ceiling', () => {
  it('is refused at the ceiling, and no model call is made', async () => {
    const gateway = vi.fn()
    vi.stubGlobal('fetch', gateway)

    const response = await post(new FakeDb(25), env({ MINTMARK_DAILY_DEPLOYMENT_LIMIT: '25' }))

    expect(response.status).toBe(429)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('limit')
    expect(body.message).toContain('used up its appraisals')
    expect(gateway).not.toHaveBeenCalled()
  })

  it('is not what stops the same request one appraisal below it', async () => {
    const gateway = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'upstream down' } }), { status: 503 }))
    vi.stubGlobal('fetch', gateway)

    const response = await post(new FakeDb(24), env({ MINTMARK_DAILY_DEPLOYMENT_LIMIT: '25' }))

    // The gateway answered, so the request cleared both the visitor's allowance
    // and the deployment's: under the cap, the cap is not what refuses it.
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'unavailable' })
    expect(gateway).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/state and the ceiling it reports', () => {
  it('reports the lowered ceiling, leaving the visitor allowance alone', async () => {
    const response = await app(new FakeDb(40)).request('/api/state', {}, env({ MINTMARK_DAILY_DEPLOYMENT_LIMIT: '25' }))

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      deployment: { used: number; limit: number }
      usage: { limit: number }
      plan: { tier: string }
    }
    expect(body.deployment).toEqual({ used: 40, limit: 25 })
    // Only the deployment's cap moves: what a visitor may spend stays the same.
    expect(body.usage.limit).toBe(DAILY_APPRAISAL_LIMIT)
    expect(body.plan.tier).toBe('free')
  })

  it('reports the shipped ceiling when the deployment sets no override', async () => {
    const response = await app(new FakeDb(40)).request('/api/state', {}, env())
    expect(((await response.json()) as { deployment: { limit: number } }).deployment.limit).toBe(DAILY_DEPLOYMENT_LIMIT)
  })
})
