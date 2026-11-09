import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'

import { saveApiBase } from '../api'
import { colors, displayFont } from '../theme'
import { Button, Card, Field, Label } from '../ui'

/**
 * Shown when the build has no server baked in (EXPO_PUBLIC_API_URL was empty)
 * and the tester has not set one. Without a server there is nothing to appraise,
 * so this comes before the app instead of failing on every request.
 */
export function ServerSetup({ onSaved }: { onSaved: (base: string) => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!value.trim()) return
    setBusy(true)
    const saved = await saveApiBase(value)
    setBusy(false)
    if (saved) onSaved(saved)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Label>Mintmark</Label>
        <Text style={styles.title}>Connect the server</Text>
        <Text style={styles.lede}>
          Mintmark appraises coins on a small server that holds the gateway key. This build was made without one, so enter the address of your deployed Mintmark server to
          continue.
        </Text>

        <Card style={{ marginTop: 20 }}>
          <Label>Server address</Label>
          <Field
            value={value}
            onChangeText={setValue}
            placeholder="https://mintmark.example.workers.dev"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            style={{ marginTop: 6 }}
          />
          <Button variant="primary" onPress={() => void submit()} loading={busy} disabled={!value.trim()} style={{ marginTop: 10 }}>
            Connect
          </Button>
          <Text style={styles.help}>It is kept on this device. Deploy the Worker, then paste its address here or rebuild with EXPO_PUBLIC_API_URL.</Text>
        </Card>

        <View style={styles.foot} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { padding: 24, paddingTop: 72 },
  title: { color: colors.fg, fontFamily: displayFont, fontSize: 30, letterSpacing: -0.5, marginTop: 8 },
  lede: { color: colors.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  help: { color: colors.faint, fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  foot: { height: 80 },
})
