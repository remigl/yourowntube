import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DownloadButton } from '../../src/components/DownloadButton';
import { Button, MessageState, RowSkeleton } from '../../src/components/States';
import { Thumbnail } from '../../src/components/Thumbnail';
import { VideoRow } from '../../src/components/VideoCard';
import { VideoPlayer } from '../../src/components/VideoPlayer';
import { AppError, describeError, errorCode, type AppErrorCode } from '../../src/core/errors';
import { formatDuration, formatShortDate, formatViews, publishedLabel } from '../../src/core/format';
import { choosePlaybackOrigin, resumePosition } from '../../src/core/playback';
import { isShort } from '../../src/core/shorts';
import { findSimilar, REASON_LABELS } from '../../src/core/similar';
import type { SimilarVideo, VideoDetails, VideoSummary } from '../../src/core/types';
import { getCachedVideo, getProgress, listDownloads, recordProgress, upsertVideo } from '../../src/db/repo';
import { openVideo } from '../../src/lib/navigation';
import { recallVideo } from '../../src/lib/videoCache';
import { downloads } from '../../src/services/downloads';
import { writeDashManifest } from '../../src/services/files';
import { useApp } from '../../src/state/AppContext';
import { colors, hitSlop, radius, space, type } from '../../src/theme';

type PlayState =
  | { kind: 'loading' }
  | { kind: 'ready'; streams: PlayStream[]; index: number; isLocal: boolean; startAt: number; aspect?: number }
  | { kind: 'error'; code: AppErrorCode; message: string }
  | { kind: 'short' };

interface PlayStream {
  uri: string;
  headers?: Record<string, string>;
  contentType: 'hls' | 'progressive' | 'dash';
  label: string;
}

const KIND_LABEL = { progressive: 'MP4', hls: 'HLS', dash: 'DASH' } as const;

interface SimilarState {
  loading: boolean;
  items: SimilarVideo[];
  offlineItems: VideoSummary[];
  error: string | null;
}

export default function Watch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Clé = identifiant : ouvrir une vidéo similaire repart d'un état propre.
  return <WatchContent key={id} id={id} />;
}

function WatchContent({ id }: { id: string }) {
  const { source, sourceError, online, settings, shortsPolicy } = useApp();
  const insets = useSafeAreaInsets();

  const [summary, setSummary] = useState<VideoSummary | undefined>(() => recallVideo(id));
  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [play, setPlay] = useState<PlayState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [similar, setSimilar] = useState<SimilarState>({ loading: true, items: [], offlineItems: [], error: null });
  const [descOpen, setDescOpen] = useState(false);

  const summaryRef = useRef(summary);
  summaryRef.current = summary;

  /* ── Métadonnées : cache mémoire → base locale ── */
  useEffect(() => {
    if (summaryRef.current) {
      void upsertVideo(summaryRef.current, source?.kind);
      return;
    }
    void getCachedVideo(id).then((v) => {
      if (v) setSummary((s) => s ?? v);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ── Choix de la lecture : fichier local en priorité, sinon streaming ── */
  useEffect(() => {
    let alive = true;
    setPlay({ kind: 'loading' });
    (async () => {
      try {
        const [progress, local] = await Promise.all([
          settings.resumePlayback ? getProgress(id) : Promise.resolve(null),
          downloads.localFileFor(id),
        ]);
        const origin = choosePlaybackOrigin(!!local, online);
        const known = summaryRef.current ?? local?.video;
        const startAt = resumePosition(progress?.positionSec, progress?.durationSec ?? known?.durationSec);

        if (origin === 'local' && local?.fileUri) {
          if (!summaryRef.current) setSummary(local.video);
          const w = local.video.width;
          const h = local.video.height;
          if (alive) {
            setPlay({
              kind: 'ready',
              streams: [{ uri: local.fileUri, contentType: 'progressive', label: 'local' }],
              index: 0,
              isLocal: true,
              startAt,
              aspect: w && h ? w / h : undefined,
            });
          }
          return;
        }
        if (origin === 'unavailable_offline') {
          throw new AppError('offline', 'Vous êtes hors ligne et cette vidéo n’est pas téléchargée.');
        }
        if (!source) throw sourceError ?? new AppError('not_configured', 'Aucune source configurée.');

        const info = await source.getPlayback(id);
        if (!alive) return;
        const candidate = {
          ...(known ?? { title: '', durationSec: null }),
          width: info.width ?? known?.width,
          height: info.height ?? known?.height,
        };
        if (isShort(candidate, shortsPolicy)) {
          setPlay({ kind: 'short' });
          return;
        }
        // iOS (AVPlayer) ne lit pas le DASH.
        const usable = info.candidates.filter((c) => c.kind !== 'dash' || Platform.OS === 'android');
        const streams: PlayStream[] = [];
        for (const c of usable) {
          // Manifeste DASH généré sur le téléphone : on l'écrit dans un fichier lisible par le lecteur.
          const uri = c.manifest ? await writeDashManifest(id, c.manifest).catch(() => '') : c.url;
          if (!uri) continue;
          const label = c.kind === 'progressive' ? `${KIND_LABEL[c.kind]} ${c.quality}` : `${KIND_LABEL[c.kind]}${c.quality === 'HD' ? ' HD' : ''}`;
          streams.push({ uri, contentType: c.kind, headers: c.headers, label });
        }
        if (streams.length === 0) throw new AppError('no_stream', 'Aucun flux lisible sur cet appareil pour cette vidéo.');
        setPlay({
          kind: 'ready',
          streams,
          index: 0,
          isLocal: false,
          startAt,
          aspect: info.width && info.height ? info.width / info.height : undefined,
        });
      } catch (e) {
        if (alive) setPlay({ kind: 'error', code: errorCode(e), message: describeError(e) });
      }
    })();
    return () => {
      alive = false;
    };
    // Volontairement sans `online` : une coupure ne doit pas relancer le lecteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt, source]);

  /* ── Détails et vidéos similaires ── */
  useEffect(() => {
    let alive = true;
    setSimilar({ loading: true, items: [], offlineItems: [], error: null });
    if (!source || !online) {
      // Hors ligne : on propose les autres vidéos enregistrées.
      void listDownloads().then((all) => {
        if (!alive) return;
        const offlineItems = all.filter((d) => d.status === 'done' && d.video.id !== id).map((d) => ({ ...d.video, thumbnail: d.thumbUri ?? d.video.thumbnail }));
        setSimilar({ loading: false, items: [], offlineItems, error: null });
      });
      return () => {
        alive = false;
      };
    }
    (async () => {
      try {
        const d = await source.getDetails(id);
        if (!alive) return;
        if (isShort(d, shortsPolicy)) {
          setPlay({ kind: 'short' });
          setSimilar({ loading: false, items: [], offlineItems: [], error: null });
          return;
        }
        setDetails(d);
        setSummary((s) => ({ ...(s ?? d), ...stripDetails(d), width: d.width ?? s?.width, height: d.height ?? s?.height }));
        void upsertVideo(d, source.kind);
        const res = await findSimilar(source, d, shortsPolicy);
        if (!alive) return;
        setSimilar({
          loading: false,
          items: res.items,
          offlineItems: [],
          error: res.items.length === 0 && res.failures > 0 ? 'Impossible de charger les vidéos similaires.' : null,
        });
      } catch (e) {
        if (alive) setSimilar({ loading: false, items: [], offlineItems: [], error: describeError(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, source, online, shortsPolicy]);

  const lastPos = useRef(0);

  /** Flux en échec : on passe au suivant en gardant la position. */
  const playRef = useRef(play);
  playRef.current = play;
  const onStreamError = useCallback((): boolean => {
    const p = playRef.current;
    if (p.kind !== 'ready' || p.index + 1 >= p.streams.length) return false;
    setPlay({ ...p, index: p.index + 1, startAt: lastPos.current > 0 ? lastPos.current : p.startAt });
    return true;
  }, []);

  const onProgress = useCallback(
    (pos: number, dur: number | null) => {
      lastPos.current = pos;
      if (!settings.saveWatchHistory) return;
      const s = summaryRef.current;
      // L'historique a besoin des métadonnées : on les assure avant d'écrire la progression.
      const ensure = s ? upsertVideo(s, source?.kind) : Promise.resolve();
      void ensure.then(() => recordProgress(id, pos, dur)).catch(() => undefined);
    },
    [id, settings.saveWatchHistory, source?.kind],
  );

  const goBack = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  const title = summary?.title ?? '';
  const channel = summary?.channelName ?? '';

  return (
    <View style={styles.root}>
      {!fullscreen && <View style={{ height: insets.top, backgroundColor: '#000' }} />}

      {play.kind === 'ready' ? (
        <VideoPlayer
          key={`${id}-${attempt}-${play.index}`}
          uri={play.streams[play.index].uri}
          contentType={play.streams[play.index].contentType}
          headers={play.streams[play.index].headers}
          onStreamError={onStreamError}
          errorText={
            play.streams.length > 1
              ? `Lecture impossible : aucun des ${play.streams.length} flux proposés (${play.streams.map((s) => s.label).join(', ')}) n’a pu être lu.${source?.kind === 'device' ? '' : ' Essayez une autre instance.'}`
              : source?.kind === 'device' ? 'Lecture impossible : le flux proposé par YouTube n’a pas pu être lu.' : 'Lecture impossible : le flux proposé par l’instance n’a pas pu être lu. Essayez une autre instance.'
          }
          title={title}
          channel={channel}
          artwork={summary?.thumbnail}
          startAt={play.startAt}
          isLocal={play.isLocal}
          backgroundPlayback={settings.backgroundPlayback}
          aspect={play.aspect}
          fullscreen={fullscreen}
          onFullscreenChange={setFullscreen}
          onProgress={onProgress}
          onRetry={() => setAttempt((n) => n + 1)}
          onBack={goBack}
        />
      ) : (
        <PlayerPlaceholder state={play} video={summary} onRetry={() => setAttempt((n) => n + 1)} onBack={goBack} />
      )}

      {play.kind === 'short' ? (
        <MessageState
          icon="ban-outline"
          title="Les Shorts ne sont pas pris en charge"
          message="YourOwnTube est réservé aux vidéos classiques."
          actionLabel="Retour"
          onAction={goBack}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}>
          {summary ? (
            <>
              <Text style={styles.title}>{summary.title}</Text>
              <Text style={[type.meta, styles.meta]}>
                {[formatViews(summary.viewCount), publishedLabel(summary.publishedAt, summary.publishedText), summary.durationSec ? formatDuration(summary.durationSec) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <View style={styles.channelRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(summary.channelName[0] ?? '?').toUpperCase()}</Text>
                </View>
                <Text style={[type.title, { flex: 1 }]} numberOfLines={1}>
                  {summary.channelName}
                </Text>
              </View>
              <View style={styles.actions}>
                <DownloadButton video={summary} />
                {play.kind === 'ready' && (
                  <View style={[styles.origin, play.isLocal && { backgroundColor: colors.successSoft }]}>
                    <Ionicons name={play.isLocal ? 'phone-portrait-outline' : 'wifi'} size={14} color={play.isLocal ? colors.success : colors.textDim} />
                    <Text style={[styles.originText, play.isLocal && { color: colors.success }]}>
                      {play.isLocal ? 'Lecture locale' : 'Streaming'}
                    </Text>
                  </View>
                )}
              </View>
              {!!details?.description && (
                <Pressable onPress={() => setDescOpen((o) => !o)} style={styles.desc}>
                  <Text style={type.body} numberOfLines={descOpen ? undefined : 3}>
                    {details.description}
                  </Text>
                  <Text style={styles.more}>{descOpen ? 'Moins' : 'Plus'}</Text>
                </Pressable>
              )}
              {summary.publishedAt && descOpen && <Text style={[type.meta, { marginTop: space.xs }]}>Publiée le {formatShortDate(summary.publishedAt)}</Text>}
            </>
          ) : (
            <View style={{ gap: space.sm }}>
              <RowSkeleton />
            </View>
          )}

          <SimilarSection state={similar} online={online} />
        </ScrollView>
      )}
    </View>
  );
}

function stripDetails(d: VideoDetails): VideoSummary {
  const { description: _d, related: _r, ...rest } = d;
  return rest;
}

function PlayerPlaceholder({ state, video, onRetry, onBack }: { state: PlayState; video?: VideoSummary; onRetry: () => void; onBack: () => void }) {
  return (
    <View style={styles.placeholder}>
      {video && <Thumbnail videoId={video.id} uri={video.thumbnail} rounded={0} style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
      <Pressable onPress={onBack} hitSlop={hitSlop} style={styles.placeholderBack} accessibilityLabel="Retour">
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>
      {state.kind === 'loading' && <ActivityIndicator size="large" color="#fff" />}
      {state.kind === 'error' && (
        <View style={styles.placeholderError}>
          <Ionicons name={state.code === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'} size={28} color={state.code === 'offline' ? '#fff' : colors.danger} />
          <Text style={styles.placeholderText}>{state.message}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Réessayer" icon="refresh" onPress={onRetry} />
            {state.code === 'not_configured' && <Button label="Réglages" variant="ghost" onPress={() => router.push('/settings')} />}
          </View>
        </View>
      )}
      {state.kind === 'short' && <Ionicons name="ban-outline" size={36} color="#fff" />}
    </View>
  );
}

function SimilarSection({ state, online }: { state: SimilarState; online: boolean }) {
  if (state.loading) {
    return (
      <View style={styles.similar}>
        <Text style={[type.h2, styles.similarTitle]}>Vidéos similaires</Text>
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </View>
    );
  }

  if (!online) {
    return (
      <View style={styles.similar}>
        <Text style={[type.h2, styles.similarTitle]}>Disponibles hors ligne</Text>
        {state.offlineItems.length === 0 ? (
          <Text style={type.meta}>Les vidéos similaires reviendront dès que vous serez en ligne.</Text>
        ) : (
          state.offlineItems.map((v) => <VideoRow key={v.id} video={v} onPress={(x) => openVideo(x, true)} offline />)
        )}
      </View>
    );
  }

  return (
    <View style={styles.similar}>
      <Text style={[type.h2, styles.similarTitle]}>Vidéos similaires</Text>
      {state.error && <Text style={type.meta}>{state.error}</Text>}
      {!state.error && state.items.length === 0 && <Text style={type.meta}>Aucune vidéo similaire trouvée.</Text>}
      {state.items.map((v) => (
        <VideoRow key={v.id} video={v} tag={REASON_LABELS[v.reason]} onPress={(x) => openVideo(x, true)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: space.lg, paddingTop: space.lg },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 24, letterSpacing: -0.3 },
  meta: { marginTop: space.xs },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  origin: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  originText: { color: colors.textDim, fontSize: 12.5, fontWeight: '600' },
  desc: { marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface },
  more: { color: colors.textDim, fontWeight: '700', fontSize: 12.5, marginTop: space.xs },
  similar: { marginTop: space.xl, gap: 2 },
  similarTitle: { marginBottom: space.sm },
  placeholder: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  placeholderBack: { position: 'absolute', top: space.sm, left: space.sm, padding: 6 },
  placeholderError: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl },
  placeholderText: { color: '#fff', textAlign: 'center', fontSize: 14 },
});
