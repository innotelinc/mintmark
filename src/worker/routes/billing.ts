// /api/billing: what this visitor has paid for, and the one place a StoreKit
// purchase becomes an entitlement. The client posts the transaction id; Apple is
// asked about it; only then is anything stored.

import { Hono } from 'hono'

import { BillingError, billingConfigured, verifyTransaction } from '../appstore'
import { saveEntitlement } from '../db'
import type { AppContext } from '../env'
import { privateJson } from '../http'
import { planFor } from '../plan'

export const billing = new Hono<AppContext>()

/** StoreKit transaction ids are decimal; anything else never reaches Apple. */
const TRANSACTION_ID = /^\d{6,32}$/

billing.get('/', async (c) => privateJson(c, { plan: await planFor(c.get('db'), c.get('visitor')) }))

billing.post('/verify', async (c) => {
  const db = c.get('db')
  const owner = c.get('visitor')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : ''
  if (!TRANSACTION_ID.test(transactionId)) {
    return c.json({ error: 'transaction', message: 'Send the StoreKit transaction id as transactionId.' }, 400)
  }
  if (!billingConfigured(c.env)) {
    return c.json(
      { error: 'billing_unconfigured', message: 'In-app purchases are not configured on this server yet.' },
      503,
    )
  }

  try {
    const purchase = await verifyTransaction(c.env, transactionId)
    await saveEntitlement(db, owner, {
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      originalTransactionId: purchase.originalTransactionId,
      environment: purchase.environment,
      expiresAt: purchase.expiresAt,
    })
    return privateJson(
      c,
      {
        plan: await planFor(db, owner),
        purchase: {
          productId: purchase.productId,
          expiresAt: purchase.expiresAt,
          environment: purchase.environment,
        },
      },
      201,
    )
  } catch (error) {
    const failure = error instanceof BillingError ? error : new BillingError('billing_failed', 'That purchase could not be verified.', 502)
    return c.json({ error: failure.code, message: failure.message }, failure.status as never)
  }
})
