import { Ionicons } from '@expo/vector-icons'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { File, Paths } from 'expo-file-system'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
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
const CAPTURE_FILE = 'capture-screen.json'

/**
 * A build made for App Store screenshots follows a small file in its own Documents
 * folder, which the screenshot workflow writes on the simulator's disk. That is the
 * only channel that needs no person tapping: the URL scheme puts an "Open in
 * Mintmark?" dialog over the app, and a relaunch does not reliably carry launch
 * arguments. Absent in every shipping build.
 */
function useCaptureScript(apply: (stack: Route[]) => void) {
  useEffect(() => {
    if (!CAPTURE_MODE) return
    let stopped = false
    let last = ''
    const poll = async () => {
      try {
        const file = new File(Paths.document, CAPTURE_FILE)
        if (!file.exists) return
        const text = await file.text()
        if (stopped || text === last) return
        const spec = JSON.parse(text) as { screen?: string; appraisal?: string }
        last = text
        if (spec.screen === 'capture' || spec.screen === 'collection' || spec.screen === 'settings') {
          apply([{ name: spec.screen }])
        } else if (spec.screen === 'appraisal' && spec.appraisal) {
          apply([{ name: 'capture' }, { name: 'appraisal', id: spec.appraisal }])
        }
      } catch {
        // Absent until the workflow writes it, and possibly caught mid-write.
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 1_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [apply])
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
  const [stack, setStack] = useState<Route[]>([{ name: 'capture' }])
  useCaptureScript(setStack)
  const top = stack[stack.length - 1]
  const push = (route: Route) => setStack((current) => [...current, route])
  const back = () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
  const tab = (name: Tab) => setStack([{ name }])
  const showTabs = top.name === 'capture' || top.name === 'collection' || top.name === 'settings'

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
