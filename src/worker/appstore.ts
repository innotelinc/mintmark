// StoreKit purchases, verified on the server against Apple's App Store Server
// API. The app never decides whether it is Pro: it hands over the transaction id
// StoreKit gave it, and the Worker asks Apple what that transaction is worth.
//
// The API is authenticated with a short-lived ES256 JWT signed by the App Store
// Connect key (appstoreconnect-v1 audience). Apple answers with
// `{ signedTransactionInfo }`, a JWS. Its signature is not checked here: it
// arrived over TLS in response to a request only this deployment's key could
// have signed, which is the trust anchor Apple documents for server lookups.
// Verifying the JWS chain locally would add Apple's root CA to the Worker for no
// extra assurance about a reply we already authenticated.

import { isProProduct, type ProProductId } from '../shared/config'
import type { Env } from './env'

const BUNDLE_ID = 'us.inotel.mintmark'

const HOSTS = {
  production: 'https://api.storekit.itunes.apple.com',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const

type AppleEnvironment = keyof typeof HOSTS

export type VerifiedPurchase = {
  productId: ProProductId
  transactionId: string
  originalTransactionId: string
  environment: AppleEnvironment
  /** When the subscription renews or lapses, in ms. */
  expiresAt: number
}

export class BillingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'BillingError'
  }
}

const configured = (value: string | undefined): string => (value ?? '').trim()

/** Apple verification needs all three; without them nobody is sold anything. */
export function billingConfigured(env: Env): boolean {
  return Boolean(configured(env.APPLE_ISSUER_ID) && configured(env.APPLE_KEY_ID) && configured(env.APPLE_PRIVATE_KEY))
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let binary = ''
  for (const byte of raw) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The .p8 block App Store Connect hands out, as PKCS#8 DER. */
function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  if (!body) throw new BillingError('billing_unconfigured', 'The Apple private key is empty.', 503)
  const binary = atob(body)
  const der = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) der[index] = binary.charCodeAt(index)
  return der
}

/** The bearer token the App Store Server API expects, valid for five minutes. */
async function appleToken(env: Env, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: configured(env.APPLE_KEY_ID), typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: configured(env.APPLE_ISSUER_ID),
      iat: now,
      exp: now + 300,
      aud: 'appstoreconnect-v1',
      bid: BUNDLE_ID,
    }),
  )
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('pkcs8', pemToDer(configured(env.APPLE_PRIVATE_KEY)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  } catch {
    throw new BillingError('billing_unconfigured', 'The Apple private key could not be read; it must be the whole .p8 block.', 503)
  }
  // WebCrypto signs ECDSA as r||s, which is exactly what a JWS ES256 signature is.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${claims}`))
  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`
}

function decodePayload(jws: string): Record<string, unknown> {
  const part = jws.split('.')[1]
  if (!part) throw new BillingError('bad_transaction', 'Apple sent a transaction without a payload.', 502)
  const standard = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
}

async function lookup(env: Env, transactionId: string, environment: AppleEnvironment): Promise<VerifiedPurchase> {
  const token = await appleToken(env)
  const response = await fetch(`${HOSTS[environment]}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  if (response.status === 404) {
    throw new BillingError('not_found', 'Apple does not know that transaction.', 404)
  }
  if (!response.ok) {
    throw new BillingError('billing_failed', 'Apple could not verify that purchase.', 502)
  }
  const body = (await response.json()) as { signedTransactionInfo?: string }
  if (!body.signedTransactionInfo) {
    throw new BillingError('bad_transaction', 'Apple sent no transaction information.', 502)
  }

  const transaction = decodePayload(body.signedTransactionInfo)
  if (transaction.bundleId !== BUNDLE_ID) {
    throw new BillingError('wrong_app', 'That purchase belongs to another app.', 400)
  }
  const productId = String(transaction.productId ?? '')
  if (!isProProduct(productId)) {
    throw new BillingError('unknown_product', 'That purchase is not a Mintmark Pro product.', 400)
  }
  if (transaction.revocationDate) {
    throw new BillingError('revoked', 'That purchase was refunded or revoked.', 400)
  }
  const expiresAt = Number(transaction.expiresDate ?? 0)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new BillingError('expired', 'That subscription has expired. Renew it in the app, then try again.', 400)
  }

  return {
    productId,
    transactionId: String(transaction.transactionId ?? transactionId),
    originalTransactionId: String(transaction.originalTransactionId ?? ''),
    environment,
    expiresAt,
  }
}

/**
 * Ask Apple about one transaction. Production is tried first and the sandbox
 * second, because a TestFlight build buys in the sandbox and an App Store build
 * in production, and the client cannot be trusted to say which. A transaction
 * Apple does not recognise in either environment is a 404.
 */
export async function verifyTransaction(env: Env, transactionId: string): Promise<VerifiedPurchase> {
  const order: AppleEnvironment[] = configured(env.APPLE_ENVIRONMENT).toLowerCase() === 'sandbox' ? ['sandbox', 'production'] : ['production', 'sandbox']
  let missing: BillingError | null = null
  for (const environment of order) {
    try {
      return await lookup(env, transactionId, environment)
    } catch (error) {
      if (error instanceof BillingError && error.code === 'not_found') {
        missing = error
        continue
      }
      throw error
    }
  }
  throw missing ?? new BillingError('not_found', 'Apple does not know that transaction.', 404)
}
