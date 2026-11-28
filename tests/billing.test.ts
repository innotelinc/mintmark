// The billing path, exercised without Apple and without D1.
//
// `verifyTransaction` is driven through a stubbed `fetch`, so what is asserted is
// the request the Worker would really send (a signed ES256 token, App Store
// Server API host) and what it does with Apple's answer. `planFor` and the
// `/api/billing` route run against an in-memory stand-in for D1, so an
// entitlement that is written is the entitlement that is read back.

import { Hono } from 'hono'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  DAILY_APPRAISAL_LIMIT,
  DAILY_DEPLOYMENT_LIMIT,
  PRO_DAILY_APPRAISAL_LIMIT,
  PRO_MONTHLY_PRODUCT,
  PRO_YEARLY_PRODUCT,
} from '../src/shared/config'
import { BillingError, billingConfigured, verifyTransaction } from '../src/worker/appstore'
import type { AppContext, Env } from '../src/worker/env'
import { deploymentLimit, planFor } from '../src/worker/plan'
import { billing } from '../src/worker/routes/billing'

/** Apple's bundle id for the app; a purchase from any other app must not count. */
const BUNDLE_ID = 'us.inotel.mintmark'
const TRANSACTION_ID = '2000000123456789'
const DAY = 86_400_000

const base64url = (value: string): string => {
  let binary = ''
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64url = (value: string): Uint8Array<ArrayBuffer> => {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** A JWS shaped like the one Apple returns; only the payload is ever read. */
const signedInfo = (payload: Record<string, unknown>): string =>
  `${base64url(JSON.stringify({ alg: 'ES256' }))}.${base64url(JSON.stringify(payload))}.c2ln`

const appleSays = (payload: Record<string, unknown>): Response =>
  new Response(JSON.stringify({ signedTransactionInfo: signedInfo(payload) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const appleDoesNotKnow = (): Response => new Response(JSON.stringify({ errorCode: 4040001 }), { status: 404 })

const transaction = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  bundleId: BUNDLE_ID,
  productId: PRO_MONTHLY_PRODUCT,
  transactionId: TRANSACTION_ID,
  originalTransactionId: '2000000123456700',
  purchaseDate: Date.now() - DAY,
  expiresDate: Date.now() + DAY,
  type: 'Auto-Renewable Subscription',
  ...overrides,
})

/** One Apple reply per call, in order, with the request kept for inspection. */
const apple = (...replies: (() => Response)[]) => {
  const calls: { url: string; authorization: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(input), authorization: String(init?.headers?.authorization ?? '') })
      const reply = replies.shift()
      if (!reply) throw new Error(`unexpected App Store Server API call: ${String(input)}`)
      return reply()
    }),
  )
  return calls
}

const failure = async (promise: Promise<unknown>): Promise<BillingError> => {
  try {
    await promise
  } catch (error) {
    if (error instanceof BillingError) return error
    throw error
  }
  throw new Error('expected the purchase to be rejected')
}

let privateKeyPem: string
let publicKey: CryptoKey

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  let binary = ''
  for (const byte of pkcs8) binary += String.fromCharCode(byte)
  const lines = btoa(binary).match(/.{1,64}/g) ?? []
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
  publicKey = pair.publicKey
})

const env = (overrides: Partial<Env> = {}): Env =>
  ({
    APPLE_ISSUER_ID: '69a6de70-0000-47e3-e053-5b8c7c11a4d1',
    APPLE_KEY_ID: '2X9ABCDEFG',
    APPLE_PRIVATE_KEY: privateKeyPem,
    ...overrides,
  }) as unknown as Env

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The row shape `readEntitlement` selects, keyed by the visitor it belongs to. */
type Row = {
  product_id: string
  transaction_id: string
  original_transaction_id: string
  environment: string
  expires_at: number
}

/** Just enough D1 for the two statements the billing path runs. */
class FakeDb {
  rows = new Map<string, Row>()

  prepare(sql: string) {
    const self = this
    return {
      bind: (...params: unknown[]) => ({
        first: async () => {
          if (!/FROM entitlements WHERE owner_sub = \?/i.test(sql)) throw new Error(`unexpected query: ${sql}`)
          const row = self.rows.get(String(params[0]))
          return row ? { ...row } : null
        },
        run: async () => {
          if (!/INSERT INTO entitlements/i.test(sql)) throw new Error(`unexpected write: ${sql}`)
          const [owner, product_id, transaction_id, original_transaction_id, environment, expires_at] = params
          self.rows.set(String(owner), {
            product_id: String(product_id),
            transaction_id: String(transaction_id),
            original_transaction_id: String(original_transaction_id),
            environment: String(environment),
            expires_at: Number(expires_at),
          })
          return { success: true }
        },
      }),
    }
  }
}

const seed = (db: FakeDb, owner: string, row: Row) => db.rows.set(owner, row)

/** The `/api/billing` routes alone, with the visitor and database already set. */
const app = (db: FakeDb, owner = 'visitor-1') => {
  const instance = new Hono<AppContext>()
  instance.use('*', async (c, next) => {
    c.set('db', db as unknown as D1Database)
    c.set('visitor', owner)
    await next()
  })
  instance.route('/api/billing', billing)
  return instance
}

const verify = (instance: Hono<AppContext>, body: unknown, bindings: Env) =>
  instance.request('/api/billing/verify', { method: 'POST', body: JSON.stringify(body) }, bindings)

describe('the App Store Server API token', () => {
  it('is ES256, signed by the configured key, for this bundle', async () => {
    const calls = apple(appleDoesNotKnow, appleDoesNotKnow)
    const before = Math.floor(Date.now() / 1000)

    const error = await failure(verifyTransaction(env(), TRANSACTION_ID))
    expect(error.code).toBe('not_found')

    expect(calls[0]?.url).toBe(`https://api.storekit.itunes.apple.com/inApps/v1/transactions/${TRANSACTION_ID}`)
    const token = calls[0]?.authorization.replace(/^Bearer /, '') ?? ''
    const [header, claims, signature] = token.split('.')
    expect(header && claims && signature).toBeTruthy()

    const decodedHeader = JSON.parse(new TextDecoder().decode(fromBase64url(header!))) as Record<string, unknown>
    expect(decodedHeader).toEqual({ alg: 'ES256', kid: '2X9ABCDEFG', typ: 'JWT' })

    const decoded = JSON.parse(new TextDecoder().decode(fromBase64url(claims!))) as Record<string, number | string>
    expect(decoded.iss).toBe('69a6de70-0000-47e3-e053-5b8c7c11a4d1')
    expect(decoded.aud).toBe('appstoreconnect-v1')
    expect(decoded.bid).toBe(BUNDLE_ID)
    expect(Number(decoded.exp) - Number(decoded.iat)).toBe(300)
    expect(Number(decoded.iat)).toBeGreaterThanOrEqual(before)

    // WebCrypto signs ECDSA as r||s, which is exactly what a JWS ES256 signature is.
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64url(signature!),
      new TextEncoder().encode(`${header}.${claims}`),
    )
    expect(verified).toBe(true)
  })

  it('tries the sandbox after production, with a token signed for each', async () => {
    apple(appleDoesNotKnow, () => appleSays(transaction()))
    const purchase = await verifyTransaction(env(), TRANSACTION_ID)
    expect(purchase.environment).toBe('sandbox')
    expect(purchase.productId).toBe(PRO_MONTHLY_PRODUCT)
  })

  it('reports itself unconfigured unless all three credentials are present', () => {
    expect(billingConfigured(env())).toBe(true)
    expect(billingConfigured(env({ APPLE_PRIVATE_KEY: '   ' }))).toBe(false)
    expect(billingConfigured(env({ APPLE_KEY_ID: '' }))).toBe(false)
    expect(billingConfigured(env({ APPLE_ISSUER_ID: undefined }))).toBe(false)
  })
})

describe('rejected purchases', () => {
  it('refuses a transaction from another app', async () => {
    const calls = apple(() => appleSays(transaction({ bundleId: 'us.inotel.other' })))
    const error = await failure(verifyTransaction(env(), TRANSACTION_ID))
    expect(error.code).toBe('wrong_app')
    expect(error.status).toBe(400)
    // A bundle mismatch is an answer, not a miss: the sandbox is not asked.
    expect(calls).toHaveLength(1)
  })

  it('refuses a product that is not Mintmark Pro', async () => {
    apple(() => appleSays(transaction({ productId: 'us.inotel.mintmark.credits' })))
    expect((await failure(verifyTransaction(env(), TRANSACTION_ID))).code).toBe('unknown_product')
  })

  it('refuses an expired subscription', async () => {
    apple(() => appleSays(transaction({ expiresDate: Date.now() - 1000 })))
    expect((await failure(verifyTransaction(env(), TRANSACTION_ID))).code).toBe('expired')
  })

  it('refuses a transaction with no expiry at all', async () => {
    apple(() => appleSays(transaction({ expiresDate: undefined })))
    expect((await failure(verifyTransaction(env(), TRANSACTION_ID))).code).toBe('expired')
  })

  it('refuses a refunded purchase', async () => {
    apple(() => appleSays(transaction({ revocationDate: Date.now() - 1000 })))
    expect((await failure(verifyTransaction(env(), TRANSACTION_ID))).code).toBe('revoked')
  })

  it('is a 404 when Apple knows the transaction in neither environment', async () => {
    const calls = apple(appleDoesNotKnow, appleDoesNotKnow)
    const error = await failure(verifyTransaction(env(), TRANSACTION_ID))
    expect(error.code).toBe('not_found')
    expect(error.status).toBe(404)
    expect(calls.map((call) => call.url.split('/')[2])).toEqual(['api.storekit.itunes.apple.com', 'api.storekit-sandbox.itunes.apple.com'])
  })

  it('tries the sandbox first when the server is configured that way', async () => {
    const calls = apple(appleDoesNotKnow, () => appleSays(transaction({ productId: PRO_YEARLY_PRODUCT })))
    const purchase = await verifyTransaction(env({ APPLE_ENVIRONMENT: 'sandbox' }), TRANSACTION_ID)
    expect(purchase.environment).toBe('production')
    expect(calls[0]?.url).toContain('api.storekit-sandbox.itunes.apple.com')
  })
})

describe('the free tier', () => {
  it('is what a visitor with no purchase gets', async () => {
    const plan = await planFor(new FakeDb() as unknown as D1Database, 'visitor-1')
    expect(plan).toEqual({ tier: 'free', limit: DAILY_APPRAISAL_LIMIT, productId: null, expiresAt: null })
  })

  it('is what a lapsed subscription falls back to', async () => {
    const db = new FakeDb()
    seed(db, 'visitor-1', {
      product_id: PRO_MONTHLY_PRODUCT,
      transaction_id: TRANSACTION_ID,
      original_transaction_id: '2000000123456700',
      environment: 'production',
      expires_at: Date.now() - DAY,
    })
    const plan = await planFor(db as unknown as D1Database, 'visitor-1')
    expect(plan.tier).toBe('free')
    expect(plan.limit).toBe(DAILY_APPRAISAL_LIMIT)
  })

  it('is what a stored product id that is no longer sold falls back to', async () => {
    const db = new FakeDb()
    seed(db, 'visitor-1', {
      product_id: 'us.inotel.mintmark.pro.lifetime',
      transaction_id: TRANSACTION_ID,
      original_transaction_id: '',
      environment: 'production',
      expires_at: Date.now() + DAY,
    })
    expect((await planFor(db as unknown as D1Database, 'visitor-1')).tier).toBe('free')
  })

  it('is per visitor: one purchase does not raise anyone else', async () => {
    const db = new FakeDb()
    seed(db, 'visitor-1', {
      product_id: PRO_MONTHLY_PRODUCT,
      transaction_id: TRANSACTION_ID,
      original_transaction_id: '2000000123456700',
      environment: 'production',
      expires_at: Date.now() + DAY,
    })
    expect((await planFor(db as unknown as D1Database, 'visitor-1')).tier).toBe('pro')
    expect((await planFor(db as unknown as D1Database, 'visitor-2')).tier).toBe('free')
  })
})

describe('POST /api/billing/verify', () => {
  it('turns a live transaction into Pro and returns the plan the server will enforce', async () => {
    const db = new FakeDb()
    apple(() => appleSays(transaction()))

    const response = await verify(app(db), { transactionId: TRANSACTION_ID }, env())
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')

    const body = (await response.json()) as { plan: { tier: string; limit: number }; purchase: { productId: string; environment: string } }
    expect(body.plan).toMatchObject({ tier: 'pro', limit: PRO_DAILY_APPRAISAL_LIMIT })
    expect(body.purchase).toMatchObject({ productId: PRO_MONTHLY_PRODUCT, environment: 'production' })

    expect(db.rows.get('visitor-1')).toEqual({
      product_id: PRO_MONTHLY_PRODUCT,
      transaction_id: TRANSACTION_ID,
      original_transaction_id: '2000000123456700',
      environment: 'production',
      expires_at: expect.any(Number) as unknown as number,
    })
  })

  it('does not make a visitor Pro when Apple rejects the transaction', async () => {
    const db = new FakeDb()
    apple(() => appleSays(transaction({ expiresDate: Date.now() - 1000 })))

    const response = await verify(app(db), { transactionId: TRANSACTION_ID }, env())
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'expired' })
    expect(db.rows.size).toBe(0)

    const state = await app(db).request('/api/billing', {}, env())
    expect(((await state.json()) as { plan: { tier: string } }).plan.tier).toBe('free')
  })

  it('refuses a transaction id Apple could not have issued', async () => {
    const db = new FakeDb()
    const instance = app(db)

    for (const transactionId of ['', 'abc', '12345', '1234567890123456789012345678901234567', 42]) {
      const response = await verify(instance, { transactionId }, env())
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'transaction' })
    }
    expect(db.rows.size).toBe(0)
  })

  it('says so, and sells nothing, when the server has no Apple credentials', async () => {
    const instance = app(new FakeDb())
    const response = await verify(instance, { transactionId: TRANSACTION_ID }, env({ APPLE_PRIVATE_KEY: undefined }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'billing_unconfigured' })
  })
})

describe('the deployment ceiling', () => {
  it('leaves room for several Pro subscribers, not one or two', () => {
    // The per-visitor Pro allowance is a product promise; the ceiling must not
    // be reachable by the first few subscribers on a busy day.
    expect(DAILY_DEPLOYMENT_LIMIT).toBeGreaterThanOrEqual(PRO_DAILY_APPRAISAL_LIMIT * 20)
    expect(DAILY_DEPLOYMENT_LIMIT).toBeGreaterThanOrEqual(DAILY_APPRAISAL_LIMIT * 10)
  })

  it('is the default when the deployment sets no override', () => {
    expect(deploymentLimit(env())).toBe(DAILY_DEPLOYMENT_LIMIT)
  })

  it('can be lowered for a deployment on a tighter budget', () => {
    expect(deploymentLimit(env({ MINTMARK_DAILY_DEPLOYMENT_LIMIT: '600' }))).toBe(600)
    expect(deploymentLimit(env({ MINTMARK_DAILY_DEPLOYMENT_LIMIT: ' 40 ' }))).toBe(40)
  })

  it('cannot be raised above the shipped ceiling', () => {
    expect(deploymentLimit(env({ MINTMARK_DAILY_DEPLOYMENT_LIMIT: String(DAILY_DEPLOYMENT_LIMIT * 4) }))).toBe(
      DAILY_DEPLOYMENT_LIMIT,
    )
  })

  it('ignores a value that is not a positive whole number', () => {
    for (const value of ['', '   ', '0', '-5', '12.5', '250 appraisals', 'lots']) {
      expect(deploymentLimit(env({ MINTMARK_DAILY_DEPLOYMENT_LIMIT: value }))).toBe(DAILY_DEPLOYMENT_LIMIT)
    }
  })
})
