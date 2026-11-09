import { Ionicons } from '@expo/vector-icons'
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { useAppraisals } from '../api'
import { moneyRange } from '../format'
import { colors, displayFont, radius, shadow } from '../theme'
import { Card, Label, Spinner } from '../ui'

export function Collection({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { data, isLoading, error, refetch } = useAppraisals()
  const items = data?.items ?? []

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Label>Collection</Label>
          <Text style={styles.title}>Your coins</Text>
        </View>
        <Pressable onPress={onNew} style={styles.newButton} accessibilityLabel="New appraisal">
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load the collection</Text>
          <Text style={styles.emptyBody}>{error instanceof Error ? error.message : 'Try again in a moment.'}</Text>
          <Pressable onPress={() => void refetch()} style={{ marginTop: 12 }}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.disc}>
            <Ionicons name="albums-outline" size={24} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No appraisals yet</Text>
          <Text style={styles.emptyBody}>Photograph a coin and it will be kept here, with its value range and the photo you took.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => onOpen(item.id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
              <Card style={styles.rowCard}>
                {item.thumb ? <Image source={{ uri: item.thumb }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.identified ? item.name || 'Coin' : 'Not identified'}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.identified ? `${item.subtitle || 'Coin'} · ${moneyRange(item.valueLow, item.valueHigh, item.currency, true)}` : 'No value'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.faint} />
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  header: { alignItems: 'flex-end', flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 16 },
  title: { color: colors.fg, fontFamily: displayFont, fontSize: 28, letterSpacing: -0.4, marginTop: 4 },
  newButton: {
    alignItems: 'center',
    backgroundColor: colors.fg,
    borderRadius: radius.control,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  center: { alignItems: 'center', flex: 1, gap: 6, justifyContent: 'center', padding: 32 },
  disc: { alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 999, height: 56, justifyContent: 'center', marginBottom: 6, width: 56 },
  emptyTitle: { color: colors.fg, fontSize: 15, fontWeight: '600' },
  emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  link: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  list: { gap: 8, padding: 16, paddingBottom: 32 },
  row: { borderRadius: radius.card },
  rowCard: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 10, ...shadow.card },
  thumb: { backgroundColor: colors.coinTable, borderRadius: 999, height: 44, width: 44 },
  thumbEmpty: { backgroundColor: colors.surface2 },
  rowTitle: { color: colors.fg, fontSize: 13.5, fontWeight: '600' },
  rowSub: { color: colors.faint, fontSize: 12, marginTop: 2 },
})
