import { Ionicons } from '@expo/vector-icons'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, NativeModules, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { getApiBase, loadApiBase } from './src/api'
import { Admin } from './src/screens/Admin'
import { AppraisalScreen } from './src/screens/AppraisalScreen'
import { Capture } from './src/screens/Capture'
import { Collection } from './src/screens/Collection'
import { ServerSetup } from './src/screens/ServerSetup'
import { Settings } from './src/screens/Settings'
import { colors } from './src/theme'

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } })

/**
 * A build made for App Store screenshots walks its own screens on a timer, so a
 * simulator can photograph each one without tapping. Opening a route through the
 * URL scheme would be the obvious way, but iOS puts an "Open in Mintmark?"
 * confirmation in front of it, which the capture cannot dismiss. Unset in every
 * build that ships: EXPO_PUBLIC_MINTMARK_CAPTURE is only set by the workflow.
 */
const CAPTURE_MODE = process.env.EXPO_PUBLIC_MINTMARK_CAPTURE === '1'

/**
 * `xcrun simctl launch <udid> us.inotel.mintmark -MMScreen collection` puts that
 * pair in the app's defaults, which is the only way to start the app on a chosen
 * screen without a person tapping and without iOS asking "Open in Mintmark?".
 * Absent in every normal launch, so the app opens where it always does.
 */
function launchArguments(): { screen?: string; appraisal?: string } {
  try {
    const defaults = NativeModules.SettingsManager?.settings
    const screen = defaults?.MMScreen
    const appraisal = defaults?.MMAppraisal
    return {
      screen: typeof screen === 'string' ? screen : undefined,
      appraisal: typeof appraisal === 'string' ? appraisal : undefined,
    }
  } catch {
    return {}
  }
}

type Tab = 'capture' | 'collection' | 'settings'
type Route = { name: Tab } | { name: 'admin' } | { name: 'appraisal'; id: string }

export default function App() {
  const [ready, setReady] = useState(false)
  const [server, setServer] = useState('')

  useEffect(() => {
    void loadApiBase().then((value) => {
      setServer(value)
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.boot}>
          <ActivityIndicator color={colors.faint} />
        </View>
      </SafeAreaProvider>
    )
  }

  if (!server) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ServerSetup onSaved={(base) => setServer(base)} />
      </SafeAreaProvider>
    )
  }

  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Root />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}

function Root() {
  const [stack, setStack] = useState<Route[]>(() => {
    const { screen, appraisal } = launchArguments()
    if (screen === 'collection' || screen === 'settings' || screen === 'capture') return [{ name: screen }]
    if (screen === 'appraisal' && appraisal) return [{ name: 'capture' }, { name: 'appraisal', id: appraisal }]
    return [{ name: 'capture' }]
  })
  const top = stack[stack.length - 1]
  const push = (route: Route) => setStack((current) => [...current, route])
  const back = () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
  const tab = (name: Tab) => setStack([{ name }])
  const showTabs = top.name === 'capture' || top.name === 'collection' || top.name === 'settings'

  // Fallback for a capture build launched without arguments: walk the screens so
  // a plain `simctl launch` still produces more than one image. A headless
  // simulator coalesces these timers, which is why the workflow passes the screen
  // in as a launch argument instead.
  useEffect(() => {
    if (!CAPTURE_MODE || launchArguments().screen) return
    const chapters: Route[][] = [
      [{ name: 'capture' }],
      [{ name: 'collection' }],
      [{ name: 'settings' }],
    ]
    const timers = chapters.map((next, index) => setTimeout(() => setStack(next), index * 20_000))
    return () => timers.forEach(clearTimeout)
  }, [])

  // The scheme in app.json makes these addresses open the app at a route, which
  // is how a simulator (or a link in a message) can jump straight to a screen:
  // mintmark://capture, mintmark://collection, mintmark://settings,
  // mintmark://appraisal/<id>.
  useEffect(() => {
    const apply = (url: string | null | undefined) => {
      if (!url) return
      const route = url.replace(/^mintmark:\/\//, '').replace(/\/+$/, '')
      if (route === 'capture' || route === 'collection' || route === 'settings') {
        setStack([{ name: route }])
        return
      }
      const appraisal = /^appraisal\/(.+)$/.exec(route)
      if (appraisal) setStack([{ name: 'capture' }, { name: 'appraisal', id: decodeURIComponent(appraisal[1]) }])
    }
    void Linking.getInitialURL().then(apply)
    const subscription = Linking.addEventListener('url', (event) => apply(event.url))
    return () => subscription.remove()
  }, [])

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        {top.name === 'capture' && <Capture onOpen={(id) => push({ name: 'appraisal', id })} onOpenAdmin={() => push({ name: 'admin' })} />}
        {top.name === 'collection' && <Collection onOpen={(id) => push({ name: 'appraisal', id })} onNew={() => tab('capture')} />}
        {top.name === 'settings' && <Settings onOpenAdmin={() => push({ name: 'admin' })} />}
        {top.name === 'admin' && <Admin onBack={back} />}
        {top.name === 'appraisal' && <AppraisalScreen id={top.id} onBack={back} />}
      </View>
      {showTabs && <TabBar active={top.name as Tab} onChange={tab} />}
    </SafeAreaView>
  )
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets()
  const tabs: { name: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
    { name: 'capture', label: 'Appraise', icon: 'camera-outline', activeIcon: 'camera' },
    { name: 'collection', label: 'Collection', icon: 'albums-outline', activeIcon: 'albums' },
    { name: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
  ]
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((item) => {
        const isActive = item.name === active
        return (
          <Pressable key={item.name} onPress={() => onChange(item.name)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: isActive }}>
            <Ionicons name={isActive ? item.activeIcon : item.icon} size={21} color={isActive ? colors.accent : colors.faint} />
            <Text style={[styles.tabLabel, isActive && { color: colors.accent }]}>{item.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  boot: { alignItems: 'center', backgroundColor: colors.bg, flex: 1, justifyContent: 'center' },
  safe: { backgroundColor: colors.bg, flex: 1 },
  body: { flex: 1 },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingTop: 8,
  },
  tab: { alignItems: 'center', flex: 1, gap: 3, paddingVertical: 4 },
  tabLabel: { color: colors.faint, fontSize: 10.5, fontWeight: '600' },
})
