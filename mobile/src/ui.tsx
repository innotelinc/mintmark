// The web app's controls (src/app/components/ui.tsx) as native primitives:
// same heights, same warm palette, same 13.5px copy.
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'

import { colors, displayFont, radius, shadow } from './theme'

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Text style={[styles.label, style as never]}>{children}</Text>
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function Card({ children, style, tone = 'surface' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'surface' | 'flat' | 'warning' }) {
  return <View style={[styles.card, tone === 'flat' && styles.cardFlat, tone === 'warning' && styles.cardWarning, style]}>{children}</View>
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  children,
  onPress,
  variant = 'secondary',
  disabled,
  loading,
  style,
}: {
  children: ReactNode
  onPress?: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.fg} /> : null}
      <Text
        style={[
          styles.buttonText,
          (variant === 'primary' || variant === 'danger') && styles.buttonTextOnDark,
          variant === 'ghost' && styles.buttonTextGhost,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'success' && { backgroundColor: colors.successSoft },
        tone === 'warning' && { backgroundColor: colors.warningSoft },
        tone === 'danger' && { backgroundColor: colors.dangerSoft },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'success' && { color: colors.success },
          tone === 'warning' && { color: colors.warning },
          tone === 'danger' && { color: colors.danger },
        ]}
      >
        {children}
      </Text>
    </View>
  )
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} style={[styles.field, props.style]} {...props} />
}

export function Spinner() {
  return <ActivityIndicator color={colors.faint} />
}

export function Divider() {
  return <View style={styles.divider} />
}

const styles = StyleSheet.create({
  label: {
    color: colors.faint,
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.36,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.fg,
    fontFamily: displayFont,
    fontSize: 28,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 16,
    ...shadow.card,
  },
  cardFlat: { backgroundColor: colors.surface2, shadowOpacity: 0, elevation: 0 },
  cardWarning: { backgroundColor: colors.warningSoft, borderColor: colors.lineStrong },
  button: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonPrimary: { backgroundColor: colors.fg, borderColor: colors.fg },
  buttonDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  buttonPressed: { opacity: 0.86 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.fg, fontSize: 13.5, fontWeight: '600' },
  buttonTextOnDark: { color: '#fff' },
  buttonTextGhost: { color: colors.muted },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { color: colors.muted, fontSize: 11.5, fontWeight: '600' },
  field: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.fg,
    fontSize: 13.5,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  divider: { backgroundColor: colors.line, height: StyleSheet.hairlineWidth, width: '100%' },
})
