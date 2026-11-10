import type { Context, MiddlewareHandler } from 'hono'

import type { AppContext } from './env'

/** Personalised responses must never be cached by a proxy or the browser. */
export function privateJson<T>(c: Context<AppContext>, body: T, status = 200) {
  c.header('Cache-Control', 'private, no-store')
  return c.json(body as never, status as never)
}

/**
 * Origins a wrapped native build runs under. Capacitor serves the bundle from a
 * custom scheme on iOS (`capacitor://localhost`) and from `http://localhost` on
 * Android, so the API is cross-origin from inside our own app even though no
 * other client is allowed to mutate anything.
 */
const APP_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'])

const isAppOrigin = (origin: string | undefined): origin is string => Boolean(origin && APP_ORIGINS.has(origin))

/**
 * Public names this deployment is served under besides its own. The site sits
 * behind an estate proxy that terminates TLS for the friendly name and forwards
 * with Host rewritten to the managed edge hostname, so the browser announces
 * this origin while the Worker sees its own.
 */
const PUBLIC_ORIGINS = new Set(['https://mint.innotel.tech'])

const isPublicOrigin = (origin: string | undefined): boolean => Boolean(origin && PUBLIC_ORIGINS.has(origin))

/**
 * The iOS shell is a different origin from the API, so it needs CORS headers to
 * read a reply at all. Only the app's own scheme is ever echoed; preflights are
 * answered here, before the database middleware runs.
 */
export const appCors: MiddlewareHandler<AppContext> = async (c, next) => {
  const origin = c.req.header('origin')
  if (isAppOrigin(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Vary', 'Origin')
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
      c.header('Access-Control-Allow-Headers', 'content-type, accept, x-mintmark-visitor')
      c.header('Access-Control-Max-Age', '600')
      return c.body(null, 204)
    }
  }
  return next()
}

/**
 * Mutations must come from this origin when a browser announces one, or from
 * the app's own scheme. A request with no Origin header (curl, a native client)
 * carries no ambient credentials, so it is allowed through; the Worker holds no
 * session cookie to abuse.
 */
export const sameOrigin: MiddlewareHandler<AppContext> = async (c, next) => {
  const method = c.req.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin && !isAppOrigin(origin) && !isPublicOrigin(origin)) {
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  }
  return next()
}
