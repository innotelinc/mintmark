import type { MiddlewareHandler } from 'hono'

import { getSetting, putSetting } from './db'
import type { AppContext } from './env'

// Anonymous identity that survives a proxy. A hash of the address is wrong
// behind one: every visitor arrives from the proxy's address and would share a
// collection and a daily allowance. So a browser is given a signed random id in
// its own cookie (HttpOnly, first-party, still no account), a native build
// sends the id it keeps on the device, and only a client that presents neither
// falls back to the address hash.
const COOKIE = 'mm_v'
const VISITOR_HEADER = 'x-mintmark-visitor'
const SECRET_SETTING = 'visitor_secret'
const COOKIE_MAX_AGE = 31_536_000
const ID_HEX = 16
const SIG_HEX = 16

const ID = /^[0-9a-f]{16}$/

export const isVisitorId = (value: string): boolean => ID.test(value)

const encoder = new TextEncoder()

const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const randomId = (): string => hex(crypto.getRandomValues(new Uint8Array(ID_HEX / 2)))

type Signer = { key: CryptoKey }

let signer: Promise<Signer> | undefined

/** One HMAC secret per deployment, created on first use and kept in D1. */
function signerFor(db: D1Database): Promise<Signer> {
  signer ??= (async () => {
    const existing = await getSetting(db, SECRET_SETTING)
    const secret = existing ?? hex(crypto.getRandomValues(new Uint8Array(32)))
    if (!existing) await putSetting(db, SECRET_SETTING, secret)
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    return { key }
  })().catch((error) => {
    signer = undefined
    throw error
  })
  return signer
}

async function signature({ key }: Signer, id: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(id))).slice(0, SIG_HEX)
}

async function readCookieId(request: Request, signer: Signer): Promise<string | null> {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== COOKIE) continue
    const [id, sig] = rest.join('=').split('.')
    if (!id || !sig || !isVisitorId(id) || sig.length !== SIG_HEX) return null
    return (await signature(signer, id)) === sig ? id : null
  }
  return null
}

/** A hash of the client address: the fallback when nothing else identifies. */
async function addressKey(request: Request): Promise<string> {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = request.headers.get('cf-connecting-ip') || forwarded || 'local'
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`mintmark:${address}`))
  return `v_${hex(new Uint8Array(digest).slice(0, 8))}`
}

/**
 * Resolves who is asking onto the context. A browser without a cookie is still
 * counted against its address for this request, and is handed a signed cookie so
 * the next one has its own collection.
 */
export const identify: MiddlewareHandler<AppContext> = async (c, next) => {
  const signer = await signerFor(c.get('db'))
  const cookieId = await readCookieId(c.req.raw, signer)
  const headerId = (c.req.header(VISITOR_HEADER) ?? '').trim().toLowerCase()

  if (cookieId) {
    c.set('visitor', `v_${cookieId}`)
  } else if (isVisitorId(headerId)) {
    c.set('visitor', `v_${headerId}`)
  } else {
    c.set('visitor', await addressKey(c.req.raw))
    const id = randomId()
    const value = `${id}.${await signature(signer, id)}`
    c.header(
      'Set-Cookie',
      `${COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
    )
  }

  await next()
}
