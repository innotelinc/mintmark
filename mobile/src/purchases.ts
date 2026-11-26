// StoreKit 2, through expo-iap. The app never grants Pro itself: StoreKit hands
// back a transaction id, and the Worker asks Apple about it before storing an
// entitlement. Nothing here decides what a purchase is worth.
//
// This module needs a development build or a prebuilt archive — expo-iap is a
// native module, so Expo Go cannot run it. The TestFlight workflow runs
// `expo prebuild` + CocoaPods, which autolinks it.

import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  showManageSubscriptionsIOS,
  ErrorCode,
  type Purchase,
} from 'expo-iap'

import { PRO_PRODUCT_IDS } from './config'

export type ProOffer = {
  id: string
  title: string
  price: string
  description: string
}

/** The fields the paywall draws that every store version provides. */
type StoreProduct = {
  id: string
  title?: string
  description?: string
  displayPrice?: string
  price?: string
}

let connected: Promise<void> | undefined

/** expo-iap needs one connection before any store call. */
export function ensureStore(): Promise<void> {
  connected ??= initConnection().then(() => undefined)
  return connected
}

export async function proOffers(): Promise<ProOffer[]> {
  await ensureStore()
  const products = (await fetchProducts({
    skus: [...PRO_PRODUCT_IDS],
    type: 'subs',
  })) as unknown as StoreProduct[] | null
  return (products ?? []).map((product) => ({
    id: product.id,
    title: product.title ?? product.id,
    // displayPrice is the localised App Store string; price is the older field.
    price: product.displayPrice ?? product.price ?? '',
    description: product.description ?? '',
  }))
}

/**
 * Start a subscription purchase and resolve with the transaction StoreKit
 * reports. The purchase is only finished after the server has verified it, so a
 * crash between the two replays the transaction rather than losing it.
 */
export async function buyPro(productId: string): Promise<Purchase> {
  await ensureStore()
  return new Promise<Purchase>((resolve, reject) => {
    const updates = purchaseUpdatedListener((purchase) => {
      updates.remove()
      errors.remove()
      resolve(purchase)
    })
    const errors = purchaseErrorListener((error) => {
      updates.remove()
      errors.remove()
      reject(new Error(error.code === ErrorCode.UserCancelled ? 'Purchase cancelled.' : error.message))
    })
    void requestPurchase({
      request: { apple: { sku: productId } },
      type: 'subs',
    }).catch((problem: unknown) => {
      updates.remove()
      errors.remove()
      reject(problem instanceof Error ? problem : new Error('The App Store could not start that purchase.'))
    })
  })
}

/** Everything this Apple ID already owns, including expired subscriptions. */
export async function restorePro(): Promise<Purchase[]> {
  await ensureStore()
  const purchases = await getAvailablePurchases()
  return purchases ?? []
}

/** Only after the server has stored the entitlement. */
export async function finishPro(purchase: Purchase): Promise<void> {
  await finishTransaction({ purchase, isConsumable: false })
}

export async function manageSubscriptions(): Promise<void> {
  await ensureStore()
  await showManageSubscriptionsIOS()
}

export async function closeStore(): Promise<void> {
  await endConnection()
  connected = undefined
}
