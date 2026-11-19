import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeaderAction, ScreenHeader } from '../src/components/ScreenHeader';
import { Button, MessageState, RowSkeleton } from '../src/components/States';
import { VideoRow } from '../src/components/VideoCard';
import { formatBytes, formatShortDate } from '../src/core/format';
import { listDownloads, type DownloadEntry } from '../src/db/repo';
import { useDownloadState } from '../src/hooks/useDownloadState';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { openVideo } from '../src/lib/navigation';
import { downloads } from '../src/services/downloads';
import { freeDiskSpace } from '../src/services/files';
import { useApp } from '../src/state/AppContext';
import { colors, hitSlop, pct, radius, space, type } from '../src/theme';

export default function LibraryScreen() {
  const list = useLiveQuery(listDownloads, ['downloads']);
  const [free, setFree] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void freeDiskSpace().then(setFree);
  }, [list.data]);

  const items = list.data ?? [];
  const done = useMemo(() => items.filter((d) => d.status === 'done'), [items]);
  const used = useMemo(() => done.reduce((n, d) => n + (d.sizeBytes ?? 0), 0), [done]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const confirmDelete = (ids: string[], label: string) => {
    const bytes = items.filter((d) => ids.includes(d.video.id)).reduce((n, d) => n + (d.sizeBytes ?? 0), 0);
    Alert.alert(label, `${ids.length} vidéo${ids.length > 1 ? 's' : ''} · ${formatBytes(bytes)} libérés. Les vidéos resteront dans votre historique.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void downloads.remove(ids).then(exitSelection);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Vidéos enregistrées"
        right={
          items.length > 0 ? (
            selecting ? (
              <HeaderAction label="Terminé" onPress={exitSelection} />
            ) : (
              <HeaderAction label="Sélectionner" onPress={() => setSelecting(true)} />
            )
          ) : undefined
        }
      />

      {list.loading && !list.data ? (
        <View style={styles.pad}>
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.video.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={items.length > 0 ? <StorageCard used={used} count={done.length} free={free} /> : null}
          renderItem={({ item }) => (
            <DownloadRow
              entry={item}
              selecting={selecting}
              selected={selected.has(item.video.id)}
              onToggle={() => toggle(item.video.id)}
              onLongPress={() => {
                setSelecting(true);
                toggle(item.video.id);
              }}
              onDelete={() => confirmDelete([item.video.id], 'Supprimer cette vidéo ?')}
            />
          )}
          ListEmptyComponent={
            <MessageState
              icon="cloud-download-outline"
              title="Aucune vidéo enregistrée"
              message="Touchez « Télécharger » sous une vidéo pour la regarder plus tard, même sans connexion."
            />
          }
        />
      )}

      {selecting && (
        <View style={styles.selectionBar}>
          <Pressable
            onPress={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((d) => d.video.id)))}
            hitSlop={hitSlop}
          >
            <Text style={styles.selectAll}>{selected.size === items.length ? 'Tout désélectionner' : 'Tout sélectionner'}</Text>
          </Pressable>
          <Button
            label={selected.size > 0 ? `Supprimer (${selected.size})` : 'Supprimer'}
            icon="trash-outline"
            variant="danger"
            disabled={selected.size === 0}
            onPress={() => confirmDelete([...selected], selected.size === items.length ? 'Tout supprimer ?' : 'Supprimer la sélection ?')}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function StorageCard({ used, count, free }: { used: number; count: number; free: number | null }) {
  const total = free != null ? used + free : null;
  return (
    <View style={styles.storage}>
      <View style={styles.storageTop}>
        <Ionicons name="folder-open-outline" size={18} color={colors.accent} />
        <Text style={[type.title, { flex: 1 }]}>
          {formatBytes(used)} <Text style={type.meta}>utilisés par {count} vidéo{count > 1 ? 's' : ''}</Text>
        </Text>
      </View>
      {total != null && total > 0 && (
        <>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: pct(Math.max(0.01, used / total)) }]} />
          </View>
          <Text style={type.meta}>{formatBytes(free)} disponibles sur le téléphone</Text>
        </>
      )}
    </View>
  );
}

function DownloadRow({
  entry,
  selecting,
  selected,
  onToggle,
  onLongPress,
  onDelete,
}: {
  entry: DownloadEntry;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  onLongPress: () => void;
  onDelete: () => void;
}) {
  const { source, settings } = useApp();
  const { progress, active } = useDownloadState(entry.video.id);
  const isDone = entry.status === 'done';

  let subtitle: string;
  let tag: string | undefined;
  if (active) {
    subtitle = `Téléchargement… ${Math.round(progress * 100)} %`;
  } else if (entry.status === 'error') {
    subtitle = entry.error ?? 'Échec du téléchargement';
    tag = 'Toucher pour réessayer';
  } else {
    subtitle = [entry.kind === 'audio' ? 'Audio' : null, formatBytes(entry.sizeBytes), entry.quality, entry.completedAt ? formatShortDate(entry.completedAt) : null]
      .filter(Boolean)
      .join(' · ');
    tag = entry.kind === 'audio' ? 'Audio hors ligne' : 'Disponible hors ligne';
  }

  const onPress = () => {
    if (selecting) return onToggle();
    if (isDone) return openVideo(entry.video);
    if (entry.status === 'error' && source) void downloads.start(entry.video, source, settings.downloadMaxHeight, entry.kind);
  };

  return (
    <VideoRow
      video={entry.video}
      localThumb={entry.thumbUri}
      onPress={onPress}
      onLongPress={onLongPress}
      offline={isDone}
      selected={selected}
      subtitle={subtitle}
      tag={tag}
      progress={active ? progress : undefined}
      right={
        selecting ? (
          <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.accent : colors.textFaint} style={{ paddingTop: 2 }} />
        ) : (
          <Pressable onPress={active ? () => void downloads.cancel(entry.video.id) : onDelete} hitSlop={hitSlop} accessibilityLabel={active ? 'Annuler' : 'Supprimer'}>
            <Ionicons name={active ? 'close' : 'trash-outline'} size={19} color={colors.textFaint} />
          </Pressable>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.lg },
  list: { paddingHorizontal: space.lg, paddingBottom: 120 },
  storage: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, gap: space.sm, marginBottom: space.md, marginTop: space.xs },
  storageTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.accent },
  selectionBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    paddingLeft: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  selectAll: { color: colors.text, fontWeight: '600' },
});
