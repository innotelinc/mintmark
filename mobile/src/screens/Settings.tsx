import { Ionicons } from '@expo/vector-icons'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useAppState, useDeleteAllAppraisals } from '../api'
import { DAILY_APPRAISAL_LIMIT, VISION_MODEL_LABEL } from '../config'
import { untilLabel } from '../format'
import { colors, radius, shadow } from '../theme'
import { Badge, Button, Card, Label } from '../ui'

export function Settings({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const { data: state } = useAppState()
  const clear = useDeleteAllAppraisals()

  const limit = state?.usage.limit || DAILY_APPRAISAL_LIMIT
  const used = state?.usage.used ?? 0
  const keyDetail =
    state?.gateway.keySource === 'stored'
      ? `Key stored in the app · ${state.gateway.keyHint ?? ''}`
      : state?.gateway.keySource === 'env'
        ? `Key from the server · ${state.gateway.keyHint ?? ''}`
        : 'No key configured yet'

  const confirmDeleteAll = () =>
    Alert.alert('Delete all appraisals?', 'Every coin, photo and result is removed for good.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: () => clear.mutate(undefined, { onError: () => Alert.alert('Could not delete your appraisals') }) },
    ])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Label>Settings</Label>
      <Text style={styles.title}>Mintmark</Text>

      <Text style={styles.sectionLabel}>USAGE</Text>
      <Card>
        <View style={styles.usageHead}>
          <Text style={styles.usageTitle}>
            {used} of {limit} appraisals today
          </Text>
          <Text style={styles.usageReset}>{state ? `Resets ${untilLabel(state.usage.resetsAt)}` : ''}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${Math.min(100, Math.round((used / limit) * 100))}%` }]} />
        </View>
        <Text style={styles.usageNote}>Each appraisal sends one photo through the gateway and is billed to the Mintmark key&apos;s owner.</Text>
      </Card>

      <Text style={styles.sectionLabel}>ADMIN</Text>
      <Pressable onPress={onOpenAdmin}>
        <Card style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="key-outline" size={17} color={colors.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle}>Gateway key and server</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {keyDetail}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.faint} />
        </Card>
      </Pressable>

      <Text style={styles.sectionLabel}>CONNECTIONS</Text>
      <Card style={{ padding: 0 }}>
        <View style={[styles.connection, { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Vision model · {VISION_MODEL_LABEL}</Text>
            <Text style={styles.rowSub}>{keyDetail}</Text>
          </View>
          <Badge tone={state?.capabilities.vision ? 'success' : 'neutral'}>{state?.capabilities.vision ? 'Connected' : 'Not set'}</Badge>
        </View>
        <View style={styles.connection}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Database</Text>
            <Text style={styles.rowSub}>{state?.gateway.baseUrl ?? 'Not connected'}</Text>
          </View>
          <Badge tone={state?.capabilities.database ? 'success' : 'neutral'}>{state?.capabilities.database ? 'Connected' : 'Not set'}</Badge>
        </View>
      </Card>

      <Text style={styles.sectionLabel}>DATA</Text>
      <Card style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Delete all appraisals</Text>
          <Text style={styles.rowSub}>Removes every saved coin, photo and result.</Text>
        </View>
        <Button variant="danger" onPress={confirmDeleteAll} loading={clear.isPending}>
          Delete
        </Button>
      </Card>

      <Text style={styles.disclaimer}>
        Mintmark estimates a collector-market value from one photograph. It is not a professional grading, and not an offer to buy. Values move with the market and fall
        sharply for cleaning, damage or a fake.
      </Text>
      <Text style={styles.version}>Version 0.1.0 · iOS</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.fg, fontFamily: 'Iowan Old Style', fontSize: 28, letterSpacing: -0.4, marginTop: 4 },
  sectionLabel: { color: colors.faint, fontSize: 10.5, fontWeight: '600', letterSpacing: 1.36, marginBottom: 8, marginTop: 22 },
  usageHead: { alignItems: 'baseline', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  usageTitle: { color: colors.fg, flex: 1, fontSize: 15, fontWeight: '600' },
  usageReset: { color: colors.faint, fontSize: 12 },
  track: { backgroundColor: colors.surface2, borderRadius: 3, height: 6, marginTop: 12, overflow: 'hidden' },
  trackFill: { backgroundColor: colors.accent, height: 6 },
  usageNote: { color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, ...shadow.card },
  rowIcon: { alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.tile, height: 36, justifyContent: 'center', width: 36 },
  rowTitle: { color: colors.fg, fontSize: 13.5, fontWeight: '600' },
  rowSub: { color: colors.faint, fontSize: 12, marginTop: 2 },
  connection: { alignItems: 'center', flexDirection: 'row', gap: 10, padding: 14 },
  disclaimer: { color: colors.faint, fontSize: 11.5, lineHeight: 16, marginTop: 28 },
  version: { color: colors.faint, fontSize: 11, marginTop: 10 },
})
