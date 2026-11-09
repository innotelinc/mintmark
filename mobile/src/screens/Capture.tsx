import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { ApiError, useAppState, useCreateAppraisal } from '../api'
import { DAILY_APPRAISAL_LIMIT, MAX_NOTE_CHARS, VISION_MODEL_LABEL } from '../config'
import { preparePhoto, pickPhoto, type PreparedPhoto } from '../photo'
import { colors, displayFont, radius, shadow } from '../theme'
import { Button, Card, Field, Label } from '../ui'

const STAGES = ['Reading the date and lettering', 'Matching the design and mint mark', 'Weighing the grade against recent sales']

export function Capture({ onOpen, onOpenAdmin }: { onOpen: (id: string) => void; onOpenAdmin: () => void }) {
  const { data: state } = useAppState()
  const create = useCreateAppraisal()
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vision = state?.capabilities.vision ?? true
  const needsKey = (state?.capabilities.requireKey ?? true) && !vision
  const remaining = state ? Math.max(0, state.usage.limit - state.usage.used) : DAILY_APPRAISAL_LIMIT

  const choose = async (source: 'camera' | 'library') => {
    if (busy) return
    setError(null)
    try {
      const uri = await pickPhoto(source)
      if (uri) setPhoto(await preparePhoto(uri))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That photo could not be read.')
    }
  }

  const appraise = async () => {
    if (!photo || busy) return
    setError(null)
    setBusy(true)
    try {
      const { appraisal } = await create.mutateAsync({ image: photo.image, thumb: photo.thumb, note: note.trim() })
      setPhoto(null)
      setNote('')
      onOpen(appraisal.id)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'The appraisal failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Label>Coin appraisal</Label>
      <Text style={styles.headline}>Photograph a coin.{'\n'}Learn what it&apos;s worth.</Text>
      <Text style={styles.lede}>
        One clear photo of the front is enough. Mintmark identifies the coin, grades what it can see, and gives a collector-market value range.
      </Text>

      {needsKey && (
        <Pressable onPress={onOpenAdmin} style={styles.notice}>
          <Ionicons name="key-outline" size={16} color={colors.warning} />
          <Text style={styles.noticeText}>Appraisals need a Mintmark gateway key. Add one on the Admin screen.</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.warning} />
        </Pressable>
      )}

      {photo ? (
        <Card style={styles.photoCard}>
          <View style={styles.photoFrame}>
            <Image source={{ uri: photo.image }} style={styles.photo} resizeMode="contain" />
            <Pressable onPress={() => void choose('library')} disabled={busy} style={styles.replace}>
              <Ionicons name="refresh" size={13} color={colors.fg} />
              <Text style={styles.replaceText}>Replace</Text>
            </Pressable>
          </View>

          <Label>Anything you already know (optional)</Label>
          <Field
            value={note}
            onChangeText={setNote}
            maxLength={MAX_NOTE_CHARS}
            placeholder="Found in a tin of old change, 1965 quarter…"
            editable={!busy}
            style={{ marginTop: 6 }}
          />

          <Button variant="primary" onPress={() => void appraise()} loading={busy} disabled={needsKey} style={styles.appraise}>
            {busy ? 'Reading the coin…' : 'Appraise this coin'}
          </Button>
          <Text style={styles.hint}>
            {needsKey ? 'Add a gateway key to start appraising' : `About 10 seconds · ${remaining} of ${state?.usage.limit ?? DAILY_APPRAISAL_LIMIT} appraisals left today`}
          </Text>

          {busy && <Stages />}
        </Card>
      ) : (
        <View style={styles.dropzone}>
          <View style={styles.coinDisc}>
            <Ionicons name="ellipse-outline" size={30} color={colors.accent} />
          </View>
          <Text style={styles.dropTitle}>Photograph the front</Text>
          <Text style={styles.dropSub}>One coin, obverse up · fills the frame</Text>
          <View style={styles.row}>
            <Button variant="primary" onPress={() => void choose('camera')}>
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={[styles.buttonLabel, { color: '#fff' }]}>Take a picture</Text>
            </Button>
            <Button onPress={() => void choose('library')}>
              <Ionicons name="images-outline" size={16} color={colors.fg} />
              <Text style={styles.buttonLabel}>Choose a photo</Text>
            </Button>
          </View>
        </View>
      )}

      {error && (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Card tone="flat" style={{ marginTop: 16 }}>
        <Label>A photo that works</Label>
        {['Fill the frame with the coin, front side up.', 'Daylight or a bright lamp — flash glare hides detail.', 'A plain surface; nothing covering the design.', 'Sharp focus, so the date and mint mark are legible.'].map(
          (line) => (
            <Text key={line} style={styles.bullet}>
              · {line}
            </Text>
          ),
        )}
        <Text style={styles.footnote}>Estimates by the {VISION_MODEL_LABEL} from one photograph. Not a professional grading or an offer.</Text>
      </Card>
    </ScrollView>
  )
}

function Stages() {
  return (
    <View style={{ marginTop: 16, gap: 8 }}>
      {STAGES.map((stage, index) => (
        <View key={stage} style={styles.stageRow}>
          <ActivityIndicator size="small" color={index === 0 ? colors.accent : colors.faint} style={{ transform: [{ scale: 0.7 }] }} />
          <Text style={styles.stageText}>{stage}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  headline: { color: colors.fg, fontFamily: displayFont, fontSize: 34, letterSpacing: -0.7, lineHeight: 38, marginTop: 8 },
  lede: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 18, marginTop: 12 },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderColor: colors.lineStrong,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    padding: 12,
  },
  noticeText: { color: colors.muted, flex: 1, fontSize: 12.5, lineHeight: 18 },
  photoCard: { gap: 8 },
  photoFrame: {
    alignItems: 'center',
    backgroundColor: colors.coinTable,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 260,
    overflow: 'hidden',
  },
  photo: { height: 260, width: '100%' },
  replace: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radius.tile,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    right: 10,
    top: 10,
    ...shadow.card,
  },
  replaceText: { color: colors.fg, fontSize: 12.5, fontWeight: '600' },
  appraise: { height: 48, marginTop: 12 },
  hint: { color: colors.faint, fontSize: 12, marginTop: 8, textAlign: 'center' },
  dropzone: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radius.card,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 34,
  },
  coinDisc: {
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  dropTitle: { color: colors.fg, fontFamily: displayFont, fontSize: 20, marginTop: 6 },
  dropSub: { color: colors.muted, fontSize: 12.5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 },
  buttonLabel: { color: colors.fg, fontSize: 13.5, fontWeight: '600' },
  error: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(172,58,42,0.25)', borderRadius: radius.control, borderWidth: 1, marginTop: 12, padding: 12 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  bullet: { color: colors.muted, fontSize: 12.5, lineHeight: 20, marginTop: 6 },
  footnote: { borderTopColor: colors.line, borderTopWidth: 1, color: colors.faint, fontSize: 11.5, lineHeight: 16, marginTop: 12, paddingTop: 10 },
  stageRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  stageText: { color: colors.muted, fontSize: 12.5 },
})
