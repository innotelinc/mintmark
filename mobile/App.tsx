import { Ionicons } from '@expo/vector-icons'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
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
  const top = stack[stack.length - 1]
  const push = (route: Route) => setStack((current) => [...current, route])
  const back = () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
  const tab = (name: Tab) => setStack([{ name }])
  const showTabs = top.name === 'capture' || top.name === 'collection' || top.name === 'settings'

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
