import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterBar } from '../src/components/FilterBar';
import { SearchBar } from '../src/components/SearchBar';
import { Banner, CardSkeleton, MessageState, SectionHeader } from '../src/components/States';
import { Chip } from '../src/components/Chip';
import { VideoCard, VideoRow } from '../src/components/VideoCard';
import { formatBytes, formatShortDate, progressRatio } from '../src/core/format';
import { normalizeText } from '../src/core/sources/demo';
import { DEFAULT_FILTERS, type SearchFilters } from '../src/core/types';
import { addSearch, clearSearches, type DownloadEntry, deleteSearch, downloadStats, listDownloads, listSearches, listWatchHistory } from '../src/db/repo';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { useSearch } from '../src/hooks/useSearch';
import { openVideo } from '../src/lib/navigation';
import { useApp } from '../src/state/AppContext';
import { colors, hitSlop, radius, space, type } from '../src/theme';

export default function Explorer() {
  const { source, sourceError, online, settings, shortsPolicy } = useApp();
  const params = useLocalSearchParams<{ q?: string; t?: string }>();
  const inputRef = useRef<TextInput>(null);

  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);

  const search = useSearch(source, query, filters, shortsPolicy, online);
  const searches = useLiveQuery(() => listSearches(30), ['searches']);
  const history = useLiveQuery(() => listWatchHistory({ limit: 500 }), ['history']);
  const saved = useLiveQuery(() => listDownloads(), ['downloads']);
  const stats = useLiveQuery(downloadStats, ['downloads']);

  const progressById = useMemo(() => {
    const m = new Map<string, number>();
    history.data?.forEach((h) => m.set(h.video.id, h.completed ? 1 : progressRatio(h.positionSec, h.durationSec)));
    return m;
  }, [history.data]);
  /** Recherche dans les enregistrements : aucune donnée réseau, marche hors ligne. */
  const localMatches = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return (saved.data ?? []).filter((d) => {
      if (d.status !== 'done') return false;
      const hay = normalizeText(`${d.video.title} ${d.video.channelName}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [query, saved.data]);

  /** Vidéos enregistrées : badge dans les résultats et miniature locale. */
  const savedById = useMemo(
    () => new Map((saved.data ?? []).filter((d) => d.status === 'done').map((d) => [d.video.id, d] as const)),
    [saved.data],
  );

  const submit = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      Keyboard.dismiss();
      setFocused(false);
      setInput(q);
      setQuery(q);
      if (settings.saveSearchHistory) void addSearch(q);
    },
    [settings.saveSearchHistory],
  );

  const resetSearch = useCallback(() => {
    setQuery('');
    setInput('');
    setFilters(DEFAULT_FILTERS);
    Keyboard.dismiss();
  }, []);

  // Recherche lancée depuis l'historique (paramètre q).
  useEffect(() => {
    if (params.q) submit(params.q);
    // `t` change à chaque navigation pour relancer la même requête.
  }, [params.q, params.t, submit]);

  // Retour Android : quitte d'abord les résultats / les suggestions.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (focused) {
        inputRef.current?.blur();
        setFocused(false);
        return true;
      }
      if (query) {
        resetSearch();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [focused, query, resetSearch]);

  const showSuggestions = focused && (input.trim() === '' || input.trim() !== query);
  const suggestions = useMemo(() => {
    const needle = input.trim().toLowerCase();
    const all = searches.data ?? [];
    return (needle ? all.filter((s) => s.query.toLowerCase().includes(needle)) : all).slice(0, 12);
  }, [input, searches.data]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* En-tête : marque + accès Historique / Enregistrées / Réglages */}
      <View style={styles.header}>
        <Pressable onPress={resetSearch} hitSlop={hitSlop} accessibilityLabel="Accueil" style={styles.brandRow}>
          <View style={styles.logo}>
            <Ionicons name="play" size={13} color="#fff" />
          </View>
          <Text style={type.brand}>
            YourOwn<Text style={{ color: colors.accent }}>Tube</Text>
          </Text>
        </Pressable>
        <View style={styles.headerIcons}>
          <HeaderIcon icon="time-outline" label="Historique" onPress={() => router.push('/history')} />
          <HeaderIcon icon="download-outline" label="Vidéos enregistrées" onPress={() => router.push('/library')} />
          <HeaderIcon icon="settings-outline" label="Réglages" onPress={() => router.push('/settings')} />
        </View>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          onSubmit={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={online ? 'Rechercher une vidéo' : 'Hors ligne — recherche indisponible'}
        />
      </View>

      {showSuggestions ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pad}>
          {suggestions.length === 0 ? (
            <Text style={[type.meta, styles.hint]}>
              {input.trim() ? 'Appuyez sur Entrée pour rechercher.' : 'Vos recherches récentes apparaîtront ici.'}
            </Text>
          ) : (
            suggestions.map((s) => (
              <Pressable
                key={s.query}
                style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surfacePressed }]}
                onPress={() => submit(s.query)}
              >
                <Ionicons name="time-outline" size={18} color={colors.textFaint} />
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {s.query}
                </Text>
                <Pressable onPress={() => void deleteSearch(s.query)} hitSlop={hitSlop} accessibilityLabel={`Supprimer ${s.query}`}>
                  <Ionicons name="close" size={18} color={colors.textFaint} />
                </Pressable>
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : query ? (
        <Results
          query={query}
          filters={filters}
          onFilters={setFilters}
          search={search}
          sourceError={sourceError?.message}
          progressById={progressById}
          savedById={savedById}
          localMatches={localMatches}
        />
      ) : (
        <Home
          online={online}
          sourceError={sourceError?.message}
          demo={source?.kind === 'demo'}
          searches={searches.data ?? []}
          history={history.data ?? []}
          saved={(saved.data ?? []).filter((d) => d.status === 'done')}
          stats={stats.data}
          onSearch={submit}
          onFocusSearch={() => inputRef.current?.focus()}
        />
      )}
    </SafeAreaView>
  );
}

function HeaderIcon({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={hitSlop} style={({ pressed }) => [styles.headerIcon, pressed && { backgroundColor: colors.surfaceAlt }]} accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

/* ─────────────────────────────── Résultats ─────────────────────────────── */

function Results({
  query,
  filters,
  onFilters,
  search,
  sourceError,
  progressById,
  savedById,
  localMatches,
}: {
  query: string;
  filters: SearchFilters;
  onFilters: (f: SearchFilters) => void;
  search: ReturnType<typeof useSearch>;
  sourceError?: string;
  progressById: Map<string, number>;
  savedById: Map<string, DownloadEntry>;
  localMatches: DownloadEntry[];
}) {
  const saved = localMatches.length > 0 && (
    <View style={styles.localBlock}>
      <Text style={styles.localTitle}>
        <Ionicons name="phone-portrait-outline" size={13} color={colors.success} /> Dans vos enregistrements
      </Text>
      {localMatches.map((d) => (
        <VideoRow
          key={d.video.id}
          video={d.video}
          localThumb={d.thumbUri}
          onPress={(v) => openVideo(v)}
          offline={d.kind === 'audio' ? 'audio' : true}
          tag={d.kind === 'audio' ? 'Audio enregistré · sans données' : 'Enregistrée · sans données'}
        />
      ))}
    </View>
  );
  const header = (
    <>
      <FilterBar value={filters} onChange={onFilters} />
      {saved}
    </>
  );

  if (sourceError && localMatches.length === 0) {
    return (
      <MessageState icon="server-outline" title="Source à configurer" message={sourceError} actionLabel="Ouvrir les réglages" onAction={() => router.push('/settings')} />
    );
  }

  if (search.loading) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={styles.pad}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      </View>
    );
  }

  if (search.error && search.items.length === 0 && search.error.code === 'offline' && localMatches.length > 0) {
    // Hors ligne mais des enregistrements correspondent : on les montre, sans alarme.
    return (
      <ScrollView>
        {header}
        <Text style={[type.meta, styles.offlineNote]}>Hors ligne : seuls vos enregistrements sont affichés.</Text>
      </ScrollView>
    );
  }

  if ((search.error || sourceError) && search.items.length === 0 && localMatches.length > 0 && !search.loading) {
    return (
      <ScrollView>
        {header}
        <Text style={[type.meta, styles.offlineNote]}>{search.error?.message ?? sourceError}</Text>
      </ScrollView>
    );
  }

  if (search.error && search.items.length === 0) {
    const offline = search.error.code === 'offline';
    const toSettings = search.error.code === 'blocked' || search.error.code === 'not_configured' || search.error.code === 'quota';
    return (
      <View style={{ flex: 1 }}>
        {header}
        <MessageState
          icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
          tone={offline ? 'neutral' : 'danger'}
          title={offline ? 'Hors ligne' : 'La recherche a échoué'}
          message={search.error.message}
          actionLabel={offline ? 'Mes vidéos enregistrées' : toSettings ? 'Changer de source' : 'Réessayer'}
          onAction={offline ? () => router.push('/library') : toSettings ? () => router.push('/settings') : search.refresh}
        >
          {toSettings && (
            <Pressable onPress={search.refresh} hitSlop={hitSlop}>
              <Text style={[type.meta, { color: colors.textDim, marginTop: space.sm }]}>Réessayer</Text>
            </Pressable>
          )}
        </MessageState>
      </View>
    );
  }

  return (
    <FlatList
      data={search.items}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.cardPad}>
          <VideoCard
            video={item}
            onPress={(v) => openVideo(v)}
            progress={progressById.get(item.id)}
            offline={savedById.get(item.id)?.kind === 'audio' ? 'audio' : savedById.has(item.id)}
            localThumb={savedById.get(item.id)?.thumbUri}
          />
        </View>
      )}
      onEndReached={search.hasMore ? search.loadMore : undefined}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={false} onRefresh={search.refresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
      keyboardDismissMode="on-drag"
      ListEmptyComponent={
        <MessageState icon="search-outline" title="Aucun résultat" message={`Rien trouvé pour « ${query} » avec ces filtres.`} />
      }
      ListFooterComponent={
        <View style={styles.footer}>
          {search.loadingMore && <ActivityIndicator color={colors.accent} />}
          {!!search.error && search.items.length > 0 && (
            <Pressable onPress={search.loadMore}>
              <Text style={[type.meta, { color: colors.danger }]}>{search.error.message} — Réessayer</Text>
            </Pressable>
          )}
          {search.hiddenShorts > 0 && (
            <Text style={type.caption}>
              {search.hiddenShorts} Short{search.hiddenShorts > 1 ? 's' : ''} masqué{search.hiddenShorts > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      }
      initialNumToRender={4}
      windowSize={7}
    />
  );
}

/* ─────────────────────────────── Accueil ─────────────────────────────── */

function Home({
  online,
  sourceError,
  demo,
  searches,
  history,
  saved,
  stats,
  onSearch,
  onFocusSearch,
}: {
  online: boolean;
  sourceError?: string;
  demo: boolean;
  searches: { query: string }[];
  history: Awaited<ReturnType<typeof listWatchHistory>>;
  saved: Awaited<ReturnType<typeof listDownloads>>;
  stats?: { count: number; totalBytes: number };
  onSearch: (q: string) => void;
  onFocusSearch: () => void;
}) {
  const inProgress = history.filter((h) => !h.completed && h.positionSec >= 5).slice(0, 10);
  const recentWatched = history.slice(0, 5);
  const empty = history.length === 0 && saved.length === 0 && searches.length === 0;

  return (
    <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: space.xxl * 2 }]} keyboardShouldPersistTaps="handled">
      <View style={{ gap: space.sm, marginTop: space.xs }}>
        {!online && <Banner icon="cloud-offline-outline" text="Hors ligne — vos vidéos enregistrées restent lisibles." actionLabel="Voir" onAction={() => router.push('/library')} />}
        {!!sourceError && <Banner icon="warning-outline" tone="warning" text={sourceError} actionLabel="Configurer" onAction={() => router.push('/settings')} />}
        {demo && !sourceError && (
          <Banner icon="flask-outline" text="Mode démonstration : vidéos libres d'exemple. Branchez une source YouTube dans les réglages." actionLabel="Réglages" onAction={() => router.push('/settings')} />
        )}
      </View>

      {empty && (
        <MessageState
          icon="play-circle-outline"
          title="Que voulez-vous regarder ?"
          message="Recherchez une vidéo. Pas de Shorts, pas de publicité, pas de distraction."
          actionLabel="Rechercher"
          onAction={onFocusSearch}
        >
          {demo && (
            <View style={[styles.chipsWrap, { justifyContent: 'center' }]}>
              {['animation', 'blender', 'voiture'].map((q) => (
                <Chip key={q} label={q} icon="search" onPress={() => onSearch(q)} />
              ))}
            </View>
          )}
        </MessageState>
      )}

      {inProgress.length > 0 && (
        <>
          <SectionHeader title="Reprendre" />
          <FlatList
            horizontal
            data={inProgress}
            keyExtractor={(h) => h.video.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.md }}
            renderItem={({ item }) => (
              <View style={styles.hCard}>
                <VideoCard video={item.video} onPress={(v) => openVideo(v)} progress={progressRatio(item.positionSec, item.durationSec)} />
              </View>
            )}
          />
        </>
      )}

      {searches.length > 0 && (
        <>
          <SectionHeader
            title="Recherches récentes"
            actionLabel="Effacer"
            onAction={() =>
              Alert.alert('Effacer les recherches récentes ?', undefined, [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Effacer', style: 'destructive', onPress: () => void clearSearches() },
              ])
            }
          />
          <View style={styles.chipsWrap}>
            {searches.slice(0, 10).map((s) => (
              <Chip key={s.query} label={s.query} icon="time-outline" onPress={() => onSearch(s.query)} onLongPress={() => void deleteSearch(s.query)} />
            ))}
          </View>
        </>
      )}

      {saved.length > 0 && (
        <>
          <SectionHeader
            title={`Vidéos enregistrées${stats ? ` · ${formatBytes(stats.totalBytes)}` : ''}`}
            actionLabel="Tout voir"
            onAction={() => router.push('/library')}
          />
          <FlatList
            horizontal
            data={saved.slice(0, 10)}
            keyExtractor={(d) => d.video.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.md }}
            renderItem={({ item }) => (
              <View style={styles.hCard}>
                <VideoCard video={{ ...item.video, thumbnail: item.thumbUri ?? item.video.thumbnail }} onPress={(v) => openVideo(v)} offline />
              </View>
            )}
          />
        </>
      )}

      {recentWatched.length > 0 && (
        <>
          <SectionHeader title="Historique" actionLabel="Tout voir" onAction={() => router.push('/history')} />
          {recentWatched.map((h) => (
            <VideoRow
              key={h.video.id}
              video={h.video}
              onPress={(v) => openVideo(v)}
              progress={h.completed ? 1 : progressRatio(h.positionSec, h.durationSec)}
              subtitle={`Vu le ${formatShortDate(h.watchedAt)}`}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  headerIcons: { flexDirection: 'row', gap: space.xs },
  headerIcon: { padding: 7, borderRadius: radius.pill },
  searchWrap: { paddingHorizontal: space.lg, paddingBottom: space.xs },
  pad: { paddingHorizontal: space.lg },
  hint: { marginTop: space.lg, textAlign: 'center' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.sm },
  listContent: { paddingBottom: space.xxl * 2 },
  cardPad: { paddingHorizontal: space.lg },
  footer: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-start' },
  hCard: { width: 260 },
  localBlock: { paddingHorizontal: space.lg, paddingBottom: space.md, marginBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  localTitle: { color: colors.success, fontSize: 12.5, fontWeight: '700', marginBottom: space.xs, marginTop: space.xs },
  offlineNote: { paddingHorizontal: space.lg, textAlign: 'center', marginTop: space.md },
});
