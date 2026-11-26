// The tier a visitor is on. Purchases are the only input: nothing here trusts a
// client, and an entitlement that has lapsed falls back to the free allowance.

import { DAILY_APPRAISAL_LIMIT, PRO_DAILY_APPRAISAL_LIMIT, isProProduct } from '../shared/config'
import type { Plan } from '../shared/types'
import { readEntitlement } from './db'

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
