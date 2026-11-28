export interface Env {
  ASSETS: Fetcher
  // Attached by Freebuff Sites once provisioned (sites_add_storage). Optional so
  // the app can explain what is missing instead of crashing.
  DB?: D1Database
  // A Mintmark key for the OmniRoute gateway, sold through Magnate. Optional:
  // the admin panel can store a key in D1 instead, and this one is the fallback.
  // It is read in settings.ts and nowhere else, and never leaves the Worker.
  MINTMARK_API_KEY?: string
  // Optional overrides; they default to GATEWAY_BASE_URL and VISION_MODEL in
  // shared/config.ts.
  MINTMARK_BASE_URL?: string
  MINTMARK_MODEL?: string
  // A tighter cap on appraisals across the whole deployment per UTC day. It can
  // only lower the shipped 2,500, never raise it; unset, malformed or larger
  // values keep the default. See deploymentLimit in plan.ts.
  MINTMARK_DAILY_DEPLOYMENT_LIMIT?: string
  // In-app purchases. The three App Store Connect values authenticate the App
  // Store Server API call that turns a StoreKit transaction into an entitlement;
  // without them /api/billing answers 503 and the app stays on the free tier.
  APPLE_ISSUER_ID?: string
  APPLE_KEY_ID?: string
  /** The whole .p8 block, newlines included. Server-side only. */
  APPLE_PRIVATE_KEY?: string
  /** `sandbox` to try the sandbox first (a TestFlight-only server); production otherwise. */
  APPLE_ENVIRONMENT?: string
}

export type Variables = {
  db: D1Database
  // Resolved by visitor.ts: a signed cookie, the device id a native build sends,
  // or a hash of the address. Never the raw address.
  visitor: string
}

export type AppContext = { Bindings: Env; Variables: Variables }
