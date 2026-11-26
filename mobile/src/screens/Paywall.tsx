import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Purchase } from 'expo-iap'

import { useAppState, useVerifyPurchase } from '../api'
import { DAILY_APPRAISAL_LIMIT, PRO_DAILY_APPRAISAL_LIMIT, PRO_PRODUCT_IDS } from '../config'
import { untilLabel } from '../format'
import { buyPro, finishPro, manageSubscriptions, proOffers, restorePro, type ProOffer } from '../purchases'
import { colors, displayFont, radius, shadow } from '../theme'
import { Badge, Button, Card, Label } from '../ui'

const BENEFITS = [
  { icon: 'sparkles-outline', title: `${PRO_DAILY_APPRAISAL_LIMIT} appraisals a day`, body: `Four times the free allowance of ${DAILY_APPRAISAL_LIMIT}, for a box of coins rather than one.` },
  { icon: 'albums-outline', title: 'Everything else stays free', body: 'Identification, grading, values and the collection itself are the same on both tiers.' },
  { icon: 'cloud-offline-outline', title: 'No account, still', body: 'The subscription lives with your Apple ID. Mintmark keeps no email, no password and no card.' },
] as const

export function Paywall({ onBack }: { onBack: () => void }) {
  const { data: state } = useAppState()
  const verify = useVerifyPurchase()
  const [offers, setOffers] = useState<ProOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const plan = state?.plan
  const isPro = plan?.tier === 'pro'

  useEffect(() => {
    let live = true
    void proOffers()
      .then((list) => {
        if (live) setOffers(list)
      })
      .catch(() => {
        if (live) setError('The App Store could not be reached. Check your connection and try again.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  /** The worker asks Apple, stores the entitlement, and only then is it finished. */
  const activate = async (purchase: Purchase) => {
    const transactionId = purchase.transactionId
    if (!transactionId) throw new Error('The App Store did not return a transaction id.')
    await verify.mutateAsync(transactionId)
    await finishPro(purchase)
  }

  const subscribe = async (offer: ProOffer) => {
    if (busy) return
    setBusy(offer.id)
    setError(null)
    try {
      const purchase = await buyPro(offer.id)
      await activate(purchase)
      Alert.alert('Mintmark Pro is on', `You now have ${PRO_DAILY_APPRAISAL_LIMIT} appraisals a day.`)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The purchase did not complete.')
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    if (busy) return
    setBusy('restore')
    setError(null)
    try {
      const purchases = await restorePro()
      const owned = purchases.filter((purchase) => (PRO_PRODUCT_IDS as readonly string[]).includes(purchase.productId))
      if (!owned.length) throw new Error('No Mintmark Pro subscription was found on this Apple ID.')
      let activated = false
      for (const purchase of owned) {
        try {
          await activate(purchase)
          activated = true
          break
        } catch {
          // An expired or refunded transaction answers 400; try the next one.
        }
      }
      if (!activated) throw new Error('Apple has that subscription, but it is not active.')
      Alert.alert('Restored', `Mintmark Pro is active: ${PRO_DAILY_APPRAISAL_LIMIT} appraisals a day.`)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Nothing could be restored.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={18} color={colors.muted} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <Label>Mintmark Pro</Label>
      <Text style={styles.title}>Appraise the whole box.</Text>
      <Text style={styles.lede}>
        Mintmark is free to use, and stays free. Pro is for the days when the tin of old change turns out to be a collection: more
        appraisals a day, and nothing else taken away from the free app.
      </Text>

      {isPro && plan && (
        <Card style={styles.active}>
          <View style={styles.activeHead}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.activeTitle}>Pro is active</Text>
            <Badge tone="success">{plan.expiresAt ? `Renews ${untilLabel(plan.expiresAt)}` : 'Subscribed'}</Badge>
          </View>
          <Text style={styles.activeNote}>
            {PRO_DAILY_APPRAISAL_LIMIT} appraisals a day on this device. Manage or cancel the subscription in your Apple ID settings.
          </Text>
          <Button onPress={() => void manageSubscriptions().catch(() => setError('Apple could not open subscription settings.'))}>
            Manage subscription
          </Button>
        </Card>
      )}

      <View style={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <View key={benefit.title} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Ionicons name={benefit.icon} size={17} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>{benefit.title}</Text>
              <Text style={styles.benefitBody}>{benefit.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>SUBSCRIBE</Text>
      {loading ? (
        <Card style={styles.loading}>
          <ActivityIndicator color={colors.faint} />
          <Text style={styles.loadingText}>Reading the App Store…</Text>
        </Card>
      ) : offers.length ? (
        offers.map((offer) => (
          <Pressable key={offer.id} onPress={() => void subscribe(offer)} disabled={Boolean(busy)}>
            <Card style={styles.offer}>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerTitle}>{offer.title || 'Mintmark Pro'}</Text>
                <Text style={styles.offerBody}>{offer.description || 'Auto-renewing subscription.'}</Text>
              </View>
              <View style={styles.offerRight}>
                <Text style={styles.offerPrice}>{offer.price || '—'}</Text>
                {busy === offer.id ? <ActivityIndicator color={colors.faint} /> : <Ionicons name="chevron-forward" size={16} color={colors.faint} />}
              </View>
            </Card>
          </Pressable>
        ))
      ) : (
        <Card tone="warning">
          <Text style={styles.offerBody}>
            No subscription is available from the App Store yet. This build may be older than the products, or the App Store is
            unreachable; the free tier keeps working either way.
          </Text>
        </Card>
      )}

      <Button onPress={() => void restore()} loading={busy === 'restore'} style={styles.restore}>
        Restore purchases
      </Button>

      {error && (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Text style={styles.legal}>
        Payment is charged to your Apple ID at confirmation. A subscription renews automatically unless it is cancelled at least 24
        hours before the current period ends; manage or cancel it in Settings › Apple ID › Subscriptions. Prices are shown by the App
        Store in your local currency.
      </Text>
      <View style={styles.links}>
        <Pressable onPress={() => void Linking.openURL('https://mint.innotel.tech/privacy')}>
          <Text style={styles.link}>Privacy</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL('https://mint.innotel.tech/support')}>
          <Text style={styles.link}>Support</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
          <Text style={styles.link}>Terms of Use</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  back: { alignItems: 'center', flexDirection: 'row', gap: 2, marginBottom: 14, marginLeft: -4 },
  backText: { color: colors.muted, fontSize: 13.5, fontWeight: '600' },
  title: { color: colors.fg, fontFamily: displayFont, fontSize: 30, letterSpacing: -0.5, lineHeight: 34, marginTop: 6 },
  lede: { color: colors.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  active: { marginTop: 18, ...shadow.card },
  activeHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  activeTitle: { color: colors.fg, flex: 1, fontSize: 15, fontWeight: '600' },
  activeNote: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 12, marginTop: 8 },
  benefits: { gap: 14, marginTop: 22 },
  benefit: { flexDirection: 'row', gap: 12 },
  benefitIcon: { alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: radius.tile, height: 34, justifyContent: 'center', width: 34 },
  benefitTitle: { color: colors.fg, fontSize: 13.5, fontWeight: '600' },
  benefitBody: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  sectionLabel: { color: colors.faint, fontSize: 10.5, fontWeight: '600', letterSpacing: 1.36, marginBottom: 8, marginTop: 26 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loadingText: { color: colors.muted, fontSize: 13 },
  offer: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 10 },
  offerTitle: { color: colors.fg, fontSize: 15, fontWeight: '600' },
  offerBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  offerRight: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  offerPrice: { color: colors.fg, fontFamily: displayFont, fontSize: 17 },
  restore: { marginTop: 14 },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radius.control, marginTop: 14, padding: 12 },
  errorText: { color: colors.danger, fontSize: 12.5, lineHeight: 18 },
  legal: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 26 },
  links: { flexDirection: 'row', gap: 18, marginTop: 12 },
  link: { color: colors.accent, fontSize: 12, fontWeight: '600' },
})
