// The web app's tokens (src/styles.css) again, in React Native terms: warm
// paper, ink and brass, a coin cabinet rather than a dashboard.
import { Platform } from 'react-native'

export const colors = {
  bg: '#f5f1e8',
  surface: '#fffdf8',
  surface2: '#ece6d9',
  raised: '#e3dbc9',
  line: '#e6dfd1',
  lineStrong: '#d2c9b6',
  fg: '#1a1712',
  muted: '#6d675c',
  faint: '#9b9384',
  accent: '#96681f',
  accentSoft: '#f6ecda',
  success: '#2c6b4b',
  successSoft: '#e4efe6',
  warning: '#9c6a1a',
  warningSoft: '#f8eeda',
  danger: '#ac3a2a',
  dangerSoft: '#f9e6e1',
  paper: '#fdf9ef',
  coinTable: '#f1e9d8',
  onInk: '#f5eeda',
  onInkMuted: '#c4b795',
  onInkLabel: '#b6a988',
  valueGlow: '#7a5a20',
} as const

export const radius = { tile: 12, control: 14, card: 20, sheet: 24 } as const

/** Iowan Old Style ships with iOS; Georgia is the Android-ish fallback. */
export const displayFont = Platform.select({ ios: 'Iowan Old Style', default: 'serif' })

export const shadow = {
  card: {
    shadowColor: '#1a1712',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pop: {
    shadowColor: '#1a1712',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const
