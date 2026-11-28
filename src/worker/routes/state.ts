import { Hono } from 'hono'

import type { AppState } from '../../shared/types'
import { appraisalsToday, appraisalsTodayAll, utcDay } from '../db'
import type { AppContext } from '../env'
import { maskKey, readGatewaySettings } from '../gateway'
import { privateJson } from '../http'
import { deploymentLimit, planFor } from '../plan'

export const state = new Hono<AppContext>()

// Everything the app needs to draw itself: is a key configured (never the key
// itself), what model answers, and how much of the daily allowance is left.
state.get('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('visitor')
  const settings = await readGatewaySettings(c.env, db)
  const plan = await planFor(db, owner)
  const body: AppState = {
    capabilities: {
      vision: Boolean(settings.key),
      database: true,
      requireKey: settings.requireKey,
    },
    gateway: {
      model: settings.model,
      baseUrl: settings.baseUrl,
      keySource: settings.source,
      keyHint: settings.key ? maskKey(settings.key) : null,
    },
    usage: {
      used: await appraisalsToday(db, owner),
      limit: plan.limit,
      resetsAt: utcDay().end,
    },
    plan,
    deployment: {
      used: await appraisalsTodayAll(db),
      limit: deploymentLimit(c.env),
    },
  }
  return privateJson(c, body)
})
