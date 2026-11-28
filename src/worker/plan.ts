// The tier a visitor is on. Purchases are the only input: nothing here trusts a
// client, and an entitlement that has lapsed falls back to the free allowance.

import { DAILY_APPRAISAL_LIMIT, DAILY_DEPLOYMENT_LIMIT, PRO_DAILY_APPRAISAL_LIMIT, isProProduct } from '../shared/config'
import type { Plan } from '../shared/types'
import { readEntitlement } from './db'
import type { Env } from './env'

export async function planFor(db: D1Database, owner: string): Promise<Plan> {
  const entitlement = await readEntitlement(db, owner)
  if (entitlement && entitlement.expiresAt > Date.now() && isProProduct(entitlement.productId)) {
    return {
      tier: 'pro',
      limit: PRO_DAILY_APPRAISAL_LIMIT,
      productId: entitlement.productId,
      expiresAt: entitlement.expiresAt,
    }
  }
  return { tier: 'free', limit: DAILY_APPRAISAL_LIMIT, productId: null, expiresAt: null }
}

/**
 * The deployment's ceiling for today. `MINTMARK_DAILY_DEPLOYMENT_LIMIT` lets a
 * deployment keep a tighter spend cap than the shipped 2,500; it can only lower
 * the ceiling, never raise it, so a typo cannot widen what an anonymous visitor
 * is able to spend. A value that is not a positive whole number is ignored
 * rather than read as zero, which would close the app.
 */
export function deploymentLimit(env: Env): number {
  const raw = env.MINTMARK_DAILY_DEPLOYMENT_LIMIT?.trim()
  if (!raw || !/^\d+$/.test(raw)) return DAILY_DEPLOYMENT_LIMIT
  const value = Number(raw)
  return value > 0 && value < DAILY_DEPLOYMENT_LIMIT ? value : DAILY_DEPLOYMENT_LIMIT
}
