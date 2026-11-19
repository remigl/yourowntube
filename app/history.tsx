import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeaderAction, ScreenHeader } from '../src/components/ScreenHeader';
import { MessageState, RowSkeleton } from '../src/components/States';
import { VideoRow } from '../src/components/VideoCard';
import { formatDuration, formatShortDate, progressRatio } from '../src/core/format';
import { resumePosition } from '../src/core/playback';
import {
  clearSearches,
  clearWatchHistory,
  deleteSearch,
  deleteWatchEntry,
  listSearches,
  listWatchHistory,
  type SearchEntry,
  type WatchEntry,
} from '../src/db/repo';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { openVideo, searchFor } from '../src/lib/navigation';
import { colors, hitSlop, radius, space, type } from '../src/theme';

type Tab = 'videos' | 'searches';

function dayLabel(ts: number, now = new Date()): string {
  const d = new Date(ts);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
  return formatShortDate(ts);
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function groupByDay<T>(items: T[], at: (t: T) => number) {
  const groups: { title: string; data: T[] }[] = [];
  for (const it of items) {
    const title = dayLabel(at(it));
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.data.push(it);
    else groups.push({ title, data: [it] });
  }
  return groups;
}

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('videos');
  const videos = useLiveQuery(() => listWatchHistory({ limit: 1000 }), ['history']);
  const searches = useLiveQuery(() => listSearches(200), ['searches']);

  const clearAll = () => {
    const what = tab === 'videos' ? 'l’historique des vidéos regardées' : 'l’historique des recherches';
    Alert.alert('Tout effacer ?', `Cela supprimera ${what} de ce téléphone.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => void (tab === 'videos' ? clearWatchHistory() : clearSearches()) },
    ]);
  };

  const hasData = tab === 'videos' ? (videos.data?.length ?? 0) > 0 : (searches.data?.length ?? 0) > 0;
  const videoSections = useMemo(() => groupByDay(videos.data ?? [], (e) => e.watchedAt), [videos.data]);
  const searchSections = useMemo(() => groupByDay(searches.data ?? [], (e) => e.searchedAt), [searches.data]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Historique" right={hasData ? <HeaderAction label="Tout effacer" tone="danger" onPress={clearAll} /> : undefined} />

      <View style={styles.segment}>
        {(
          [
            ['videos', 'Vidéos regardées'],
            ['searches', 'Recherches'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.segBtn, tab === key && styles.segActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.segText, tab === key && styles.segTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'videos' ? (
        videos.loading && !videos.data ? (
          <View style={styles.pad}>
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : (
          <SectionList<WatchEntry>
            sections={videoSections}
            keyExtractor={(e) => e.video.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
            renderItem={({ item }) => <WatchRow entry={item} />}
            ListEmptyComponent={<MessageState icon="time-outline" title="Aucune vidéo regardée" message="Les vidéos que vous regardez apparaîtront ici, avec votre progression." />}
          />
        )
      ) : (
        <SectionList<SearchEntry>
          sections={searchSections}
          keyExtractor={(e) => e.query}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.searchRow, pressed && { backgroundColor: colors.surfacePressed }]} onPress={() => searchFor(item.query)}>
              <Ionicons name="search" size={17} color={colors.textFaint} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {item.query}
              </Text>
              <Text style={type.meta}>{timeLabel(item.searchedAt)}</Text>
              <Pressable onPress={() => void deleteSearch(item.query)} hitSlop={hitSlop} accessibilityLabel={`Supprimer ${item.query}`}>
                <Ionicons name="close" size={18} color={colors.textFaint} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={<MessageState icon="search-outline" title="Aucune recherche" message="Vos recherches récentes apparaîtront ici." />}
        />
      )}
    </SafeAreaView>
  );
}

function WatchRow({ entry }: { entry: WatchEntry }) {
  const resumeAt = resumePosition(entry.positionSec, entry.durationSec);
  const status = entry.completed
    ? 'Terminée'
    : resumeAt > 0
      ? `Reprendre à ${formatDuration(resumeAt)}`
      : 'Commencée';
  return (
    <VideoRow
      video={entry.video}
      onPress={(v) => openVideo(v)}
      progress={entry.completed ? 1 : progressRatio(entry.positionSec, entry.durationSec)}
      subtitle={`${status} · ${timeLabel(entry.watchedAt)}`}
      right={
        <Pressable
          onPress={() => void deleteWatchEntry(entry.video.id)}
          hitSlop={hitSlop}
          style={styles.remove}
          accessibilityLabel="Supprimer de l’historique"
        >
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.lg },
  segment: { flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.sm, padding: 3, borderRadius: radius.pill, backgroundColor: colors.surface },
  segBtn: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segActive: { backgroundColor: colors.surfaceAlt },
  segText: { color: colors.textDim, fontWeight: '600', fontSize: 13.5 },
  segTextActive: { color: colors.text },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 },
  day: { ...type.caption, textTransform: 'uppercase', marginTop: space.lg, marginBottom: space.xs },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.sm },
  remove: { padding: 4, paddingTop: 2 },
});
