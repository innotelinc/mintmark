import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'

import {
  ApiError,
  getApiBase,
  saveApiBase,
  useAppState,
  useClearGatewayKey,
  useSaveGatewayKey,
  useSetRequireKey,
} from '../api'
import { colors, displayFont, radius } from '../theme'
import { Badge, Button, Card, Field, Label } from '../ui'

export function Admin({ onBack }: { onBack: () => void }) {
  const { data: state } = useAppState()
  const client = useQueryClient()
  const save = useSaveGatewayKey()
  const clear = useClearGatewayKey()
  const requirement = useSetRequireKey()
  const [draft, setDraft] = useState('')
  const [server, setServer] = useState(getApiBase())
  const [serverDraft, setServerDraft] = useState(getApiBase())

  if (!state) return null
  const stored = state.gateway.keySource === 'stored'

  const submitKey = () => {
    const value = draft.trim()
    if (!value) return
    save.mutate(value, {
      onSuccess: () => setDraft(''),
      onError: (error) => Alert.alert('That key was not saved', error instanceof ApiError ? error.message : 'Try again in a moment.'),
    })
  }

  const submitServer = async () => {
    const next = await saveApiBase(serverDraft)
    setServer(next || getApiBase())
    setServerDraft(next)
    await client.invalidateQueries()
    Alert.alert('Server updated', next || 'No server set.')
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={styles.back}>
        <Ionicons name="chevron-back" size={18} color={colors.muted} />
        <Text style={styles.backText}>Settings</Text>
      </Pressable>

      <Text style={styles.title}>Admin</Text>
      <Text style={styles.lede}>This app has no sign-in inside the app: anyone holding it can appraise coins. The gateway key stays on the server.</Text>

      <Text style={styles.sectionLabel}>GATEWAY KEY</Text>
      <Card>
        <View style={styles.keyHead}>
          <View style={styles.rowIcon}>
            <Ionicons name="key-outline" size={17} color={colors.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle}>Mintmark gateway</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {state.gateway.keySource && state.gateway.keyHint
                ? `${state.gateway.keySource === 'stored' ? 'Stored in the app' : 'From the server'} · ${state.gateway.keyHint}`
                : 'No key configured'}
            </Text>
          </View>
          <Badge tone={state.capabilities.vision ? 'success' : 'warning'}>{state.capabilities.vision ? 'Connected' : 'Not set'}</Badge>
        </View>

        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={stored ? 'Replace the stored key' : 'sk-…'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{ marginTop: 12 }}
        />
        <Button variant="primary" onPress={submitKey} loading={save.isPending} disabled={!draft.trim()} style={{ marginTop: 8 }}>
          Save key
        </Button>
        <Text style={styles.help}>Checked against the gateway before it is stored. It is never sent back to this app.</Text>

        {stored ? (
          <Button
            variant="danger"
            onPress={() =>
              clear.mutate(undefined, {
                onError: () => Alert.alert('Could not remove the key'),
              })
            }
            loading={clear.isPending}
            style={{ marginTop: 8 }}
          >
            Remove stored key
          </Button>
        ) : null}
      </Card>

      <Text style={styles.sectionLabel}>ACCESS</Text>
      <Card style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Require a gateway key</Text>
          <Text style={styles.rowSub}>
            {state.capabilities.requireKey
              ? 'Appraisals are blocked, with a setup notice, until a key is saved.'
              : 'Off: anyone can press Appraise. Without a key the gateway call fails with its own message.'}
          </Text>
        </View>
        <Switch
          value={state.capabilities.requireKey}
          onValueChange={(value) => requirement.mutate(value, { onError: () => Alert.alert('Could not change that setting') })}
          trackColor={{ true: colors.accent, false: colors.lineStrong }}
        />
      </Card>

      <Text style={styles.sectionLabel}>SERVER</Text>
      <Card>
        <Label>API base URL</Label>
        <Field
          value={serverDraft}
          onChangeText={setServerDraft}
          placeholder="https://mintmark.example.workers.dev"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ marginTop: 6 }}
        />
        <Button onPress={() => void submitServer()} style={{ marginTop: 8 }} disabled={serverDraft.trim() === server}>
          Use this server
        </Button>
        <Text style={styles.help}>
          Where this build sends its requests. Set at build time with EXPO_PUBLIC_API_URL, or overridden here for beta testing.
        </Text>
      </Card>

      <Text style={styles.sectionLabel}>MODEL</Text>
      <Card style={{ gap: 10, padding: 0 }}>
        <View style={styles.modelRow}>
          <Text style={styles.modelLabel}>Model</Text>
          <Text style={styles.modelValue}>{state.gateway.model}</Text>
        </View>
        <View style={[styles.modelRow, { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={styles.modelLabel}>Gateway</Text>
          <Text style={styles.modelValue}>{state.gateway.baseUrl}</Text>
        </View>
      </Card>
      <Text style={styles.help}>The model is pinned on the server with MINTMARK_MODEL.</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  back: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  backText: { color: colors.muted, fontSize: 13 },
  title: { color: colors.fg, fontFamily: displayFont, fontSize: 28, letterSpacing: -0.4, marginTop: 8 },
  lede: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  sectionLabel: { color: colors.faint, fontSize: 10.5, fontWeight: '600', letterSpacing: 1.36, marginBottom: 8, marginTop: 22 },
  keyHead: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  rowIcon: { alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.tile, height: 36, justifyContent: 'center', width: 36 },
  rowTitle: { color: colors.fg, fontSize: 13.5, fontWeight: '600' },
  rowSub: { color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 2 },
  help: { color: colors.faint, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  modelRow: { flexDirection: 'row', gap: 12, padding: 14 },
  modelLabel: { color: colors.faint, fontSize: 12, width: 68 },
  modelValue: { color: colors.fg, flex: 1, fontFamily: 'Menlo', fontSize: 12 },
})
