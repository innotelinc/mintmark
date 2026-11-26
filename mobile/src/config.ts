export const BRAND = 'Mintmark'
export const VISION_MODEL_LABEL = 'Mintmark gateway'
export const DAILY_APPRAISAL_LIMIT = 25
/**
 * Mintmark Pro. These ids must exist in App Store Connect as auto-renewable
 * subscriptions in one `Mintmark Pro` group before the paywall can load prices;
 * the Worker checks the purchase against Apple, so a build with a missing product
 * shows no offer rather than selling something the server will not honour.
 */
export const PRO_MONTHLY_PRODUCT = 'us.inotel.mintmark.pro.monthly'
export const PRO_YEARLY_PRODUCT = 'us.inotel.mintmark.pro.yearly'
export const PRO_PRODUCT_IDS = [PRO_MONTHLY_PRODUCT, PRO_YEARLY_PRODUCT] as const
/** What the server allows a Pro subscriber per UTC day. */
export const PRO_DAILY_APPRAISAL_LIMIT = 100
export const MAX_NOTE_CHARS = 240

/**
 * Where the Worker lives. Baked in at build time from EXPO_PUBLIC_API_URL
 * (app.json → `extra`, or the mobile/.env for local development). A beta tester
 * can point the app somewhere else on the Admin screen; that choice is kept on
 * the device, so a TestFlight build is usable before the server is deployed.
 */
export const DEFAULT_API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '')
