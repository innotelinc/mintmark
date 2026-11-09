import { Ionicons } from '@expo/vector-icons'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useAppraisal, useDeleteAppraisal } from '../api'
import { dateLabel, moneyRange } from '../format'
import { colors, displayFont, radius, shadow } from '../theme'
import { Badge, Card, Label, Spinner } from '../ui'

export function AppraisalScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const page = useAppraisal(id)
  const remove = useDeleteAppraisal()

  const confirmDelete = () => {
    Alert.alert('Delete this appraisal?', 'The photo and its result are removed for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: onBack,
            onError: () => Alert.alert('Could not delete this appraisal', 'Try again in a moment.'),
          }),
      },
    ])
  }

  if (page.isLoading) {
    return (
      <View style={styles.center}>
        <Spinner />
      </View>
    )
  }

  if (page.error || !page.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>This appraisal is not here any more.</Text>
        <Pressable onPress={onBack} style={{ marginTop: 10 }}>
          <Text style={styles.link}>Appraise another coin</Text>
        </Pressable>
      </View>
    )
  }

  const appraisal = page.data.appraisal
  const subtitle =
    [appraisal.country, appraisal.denomination, appraisal.year && `${appraisal.year}${appraisal.mintMark ? ` · ${appraisal.mintMark}` : ''}`, appraisal.variety]
      .filter(Boolean)
      .join(' · ') || 'The photo did not show enough to place this coin.'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
          <Text style={styles.backText}>New appraisal</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} style={styles.backButton} accessibilityLabel="Delete">
          <Ionicons name="trash-outline" size={16} color={colors.muted} />
          <Text style={styles.backText}>Delete</Text>
        </Pressable>
      </View>

      <View style={styles.figure}>
        <Image source={{ uri: appraisal.image }} style={styles.photo} resizeMode="contain" />
        <View style={styles.figCaption}>
          <Label>Obverse</Label>
          <Text style={styles.date}>{dateLabel(appraisal.createdAt)}</Text>
        </View>
        {appraisal.note ? <Text style={styles.note}>“{appraisal.note}”</Text> : null}
      </View>

      <View style={styles.badges}>
        <Label>Appraisal</Label>
        <Confidence value={appraisal.confidence} identified={appraisal.identified} />
      </View>

      <Text style={styles.name}>{appraisal.identified ? appraisal.name || 'Unidentified coin' : 'Not identified'}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {appraisal.identified ? (
        <View style={styles.valueCard}>
          <Text style={styles.valueLabel}>Estimated collector value</Text>
          <Text style={styles.value}>{moneyRange(appraisal.valueLow, appraisal.valueHigh, appraisal.currency)}</Text>
          <View style={styles.valueMeta}>
            <View style={styles.currencyChip}>
              <Text style={styles.currencyText}>{appraisal.currency}</Text>
            </View>
            <Text style={styles.valueBasis}>{appraisal.valueBasis || 'Dealer to retail at this grade.'}</Text>
          </View>
        </View>
      ) : (
        <Card tone="warning" style={{ marginTop: 16 }}>
          <Text style={styles.noValueTitle}>We couldn&apos;t put a value on this one.</Text>
          <Text style={styles.noValueBody}>
            {appraisal.imageQuality || 'The photo did not show enough of the design. Try again with the coin filling the frame, flat and evenly lit.'}
          </Text>
        </Card>
      )}

      {appraisal.summary ? <Text style={styles.summary}>{appraisal.summary}</Text> : null}

      {appraisal.identified && (
        <Card style={{ marginTop: 20 }}>
          <View style={styles.conditionHead}>
            <Label>Condition</Label>
            <Text style={styles.conditionValue}>
              {appraisal.grade > 0 ? `${appraisal.gradeLabel || 'Graded'} · ${appraisal.grade}` : 'Not graded'}
            </Text>
          </View>
          <GradeScale grade={appraisal.grade} />
          {appraisal.condition ? <Text style={styles.conditionText}>{appraisal.condition}</Text> : null}
        </Card>
      )}

      <Specs appraisal={appraisal} />
      <Lists appraisal={appraisal} />

      {appraisal.imageQuality && appraisal.identified ? (
        <Text style={styles.aboutPhoto}>
          <Text style={{ fontWeight: '600', color: colors.fg }}>About the photo: </Text>
          {appraisal.imageQuality}
        </Text>
      ) : null}

      <Text style={styles.disclaimer}>
        An estimate from one photograph — not a professional grading, and not an offer to buy. Values move with the market and fall sharply for cleaning, damage or a fake.
        Photograph the reverse and the edge, and get a second opinion, before selling anything significant.
      </Text>
    </ScrollView>
  )
}

function Confidence({ value, identified }: { value: number; identified: boolean }) {
  if (!identified) return <Badge tone="warning">Low confidence</Badge>
  const percent = Math.round(value * 100)
  return (
    <Badge tone={percent >= 75 ? 'success' : percent >= 45 ? 'warning' : 'neutral'}>
      {percent >= 75 ? 'High' : percent >= 45 ? 'Moderate' : 'Low'} confidence · {percent}%
    </Badge>
  )
}

function GradeScale({ grade }: { grade: number }) {
  const pct = Math.min(100, Math.max(0, ((grade - 1) / 69) * 100))
  return (
    <View style={{ marginTop: 14 }}>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${grade > 0 ? pct : 0}%` }]} />
        {grade > 0 ? <View style={[styles.knob, { left: `${pct}%` }]} /> : null}
      </View>
      <View style={styles.marks}>
        {['P', 'F', 'VF', 'XF', 'AU', 'MS', '70'].map((mark, index) => {
          const at = [1, 12, 20, 40, 50, 60, 70][index]
          return (
            <Text key={mark} style={[styles.mark, { left: `${((at - 1) / 69) * 100}%` }, Math.abs(at - grade) < 4 && { color: colors.accent, fontWeight: '700' }]}>
              {mark}
            </Text>
          )
        })}
      </View>
    </View>
  )
}

function Specs({ appraisal }: { appraisal: { country: string; denomination: string; year: string; mintMark: string; variety: string; composition: string; rarity: string } }) {
  const rows: [string, string][] = [
    ['Country', appraisal.country],
    ['Denomination', appraisal.denomination],
    ['Year', appraisal.year],
    ['Mint mark', appraisal.mintMark || 'None visible'],
    ['Variety', appraisal.variety],
    ['Composition', appraisal.composition],
    ['Rarity', appraisal.rarity],
  ]
  const shown = rows.filter(([, value]) => Boolean(value))
  if (!shown.length) return null
  return (
    <View style={styles.specs}>
      {shown.map(([label, value]) => (
        <View key={label} style={styles.spec}>
          <Label>{label}</Label>
          <Text style={styles.specValue}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

function Lists({ appraisal }: { appraisal: { drivers: string[]; checks: string[]; redFlags: string[] } }) {
  const sections = [
    { title: 'What drives the value', items: appraisal.drivers, warning: false },
    { title: 'Worth checking', items: appraisal.checks, warning: false },
    { title: 'Watch for', items: appraisal.redFlags, warning: true },
  ].filter((section) => section.items.length > 0)
  if (!sections.length) return null
  return (
    <View style={{ gap: 12, marginTop: 20 }}>
      {sections.map((section) => (
        <Card key={section.title} tone={section.warning ? 'warning' : 'surface'}>
          <Label>{section.title}</Label>
          {section.items.map((item) => (
            <View key={item} style={styles.listRow}>
              <View style={[styles.dot, { backgroundColor: section.warning ? colors.warning : colors.accent }]} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { alignItems: 'center', backgroundColor: colors.bg, flex: 1, justifyContent: 'center', padding: 24 },
  emptyTitle: { color: colors.fg, fontSize: 15, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: colors.muted, fontSize: 13 },
  figure: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 22, borderWidth: 1, padding: 10, ...shadow.card },
  photo: { backgroundColor: colors.coinTable, borderRadius: 16, height: 260, width: '100%' },
  figCaption: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 8 },
  date: { color: colors.faint, fontSize: 11 },
  note: { color: colors.muted, fontSize: 12.5, lineHeight: 18, paddingBottom: 4, paddingHorizontal: 4 },
  badges: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 20 },
  name: { color: colors.fg, fontFamily: displayFont, fontSize: 28, letterSpacing: -0.5, lineHeight: 33, marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  valueCard: { backgroundColor: colors.fg, borderRadius: radius.card, marginTop: 16, overflow: 'hidden', padding: 18 },
  valueLabel: { color: colors.onInkLabel, fontSize: 10.5, fontWeight: '600', letterSpacing: 1.36, textTransform: 'uppercase' },
  value: { color: colors.onInk, fontFamily: displayFont, fontSize: 36, letterSpacing: -0.5, marginTop: 6 },
  valueMeta: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  currencyChip: { borderColor: '#4a4231', borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  currencyText: { color: '#e4d8ba', fontSize: 11.5, fontWeight: '600' },
  valueBasis: { color: colors.onInkMuted, flex: 1, fontSize: 12, lineHeight: 17 },
  noValueTitle: { color: colors.fg, fontSize: 14, fontWeight: '600' },
  noValueBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  summary: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 16 },
  conditionHead: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  conditionValue: { color: colors.fg, fontFamily: displayFont, fontSize: 15 },
  conditionText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  track: { backgroundColor: colors.surface2, borderRadius: 4, height: 8, justifyContent: 'center' },
  trackFill: { backgroundColor: 'rgba(150,104,31,0.3)', borderRadius: 4, height: 8 },
  knob: { backgroundColor: colors.accent, borderRadius: 6, height: 12, marginLeft: -6, position: 'absolute', width: 12 },
  marks: { height: 18, marginTop: 6 },
  mark: { color: colors.faint, fontSize: 10, position: 'absolute', transform: [{ translateX: -5 }] },
  specs: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, paddingTop: 16, rowGap: 14 },
  spec: { width: '50%' },
  specValue: { color: colors.fg, fontSize: 13.5, lineHeight: 18, marginTop: 3, paddingRight: 8 },
  listRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 8 },
  dot: { borderRadius: 2, height: 4, marginTop: 8, width: 4 },
  listText: { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 19 },
  aboutPhoto: { backgroundColor: colors.surface2, borderRadius: radius.control, color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 20, padding: 12 },
  disclaimer: { borderTopColor: colors.line, borderTopWidth: 1, color: colors.faint, fontSize: 11.5, lineHeight: 16, marginTop: 24, paddingTop: 14 },
})
