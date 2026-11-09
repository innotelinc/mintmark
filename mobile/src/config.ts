export const BRAND = 'Mintmark'
export const VISION_MODEL_LABEL = 'Mintmark gateway'
export const DAILY_APPRAISAL_LIMIT = 25
export const MAX_NOTE_CHARS = 240

/**
 * Where the Worker lives. Baked in at build time from EXPO_PUBLIC_API_URL
 * (app.json → `extra`, or the mobile/.env for local development). A beta tester
 * can point the app somewhere else on the Admin screen; that choice is kept on
 * the device, so a TestFlight build is usable before the server is deployed.
 */
export const DEFAULT_API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '')
