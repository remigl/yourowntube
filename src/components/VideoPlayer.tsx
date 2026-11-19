import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration } from '../core/format';
import { clampSeek } from '../core/playback';
import { colors, hitSlop, radius, space } from '../theme';
import { Scrubber } from './Scrubber';

const SEEK_STEP = 10;
const HIDE_AFTER_MS = 3000;
const KEEP_AWAKE_TAG = 'yourowntube-player';

export interface VideoPlayerProps {
  uri: string;
  contentType?: 'hls' | 'progressive';
  title: string;
  channel: string;
  artwork?: string;
  /** Position de reprise en secondes. */
  startAt: number;
  isLocal: boolean;
  backgroundPlayback: boolean;
  /** Rapport largeur / hauteur de la vidéo, si connu. */
  aspect?: number;
  fullscreen: boolean;
  onFullscreenChange: (fs: boolean) => void;
  /** Appelé régulièrement (≈ 5 s), à la pause, à la fin et à la fermeture. */
  onProgress: (positionSec: number, durationSec: number | null) => void;
  onRetry: () => void;
  onBack: () => void;
}

/**
 * Lecteur intégré basé sur expo-video avec contrôles personnalisés :
 * lecture/pause, ±10 s (boutons et double-tap), barre de progression,
 * volume, plein écran, reprise, lecture en arrière-plan.
 */
export function VideoPlayer(props: VideoPlayerProps) {
  const { uri, contentType, title, channel, artwork, startAt, isLocal, backgroundPlayback, aspect, fullscreen, onFullscreenChange, onProgress, onRetry, onBack } = props;
  const insets = useSafeAreaInsets();

  // Source figée au montage : expo-video recrée le lecteur si l'objet source
  // change, ce qui relancerait la vidéo quand les métadonnées arrivent.
  const [initialSource] = useState(() => ({
    uri,
    contentType: contentType ?? ('auto' as const),
    metadata: { title, artist: channel, artwork },
  }));
  const player = useVideoPlayer(initialSource, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = backgroundPlayback;
    p.showNowPlayingNotification = backgroundPlayback;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status, error: undefined });

  const [time, setTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [seekFlash, setSeekFlash] = useState<'back' | 'forward' | null>(null);

  const lastPos = useRef(0);
  const durRef = useRef<number | null>(null);
  const lastSave = useRef(0);
  const resumed = useRef(false);
  const progressCb = useRef(onProgress);
  progressCb.current = onProgress;

  /* ── Reprise à la position enregistrée, une fois la vidéo prête ── */
  useEffect(() => {
    if (status !== 'readyToPlay' || resumed.current) return;
    resumed.current = true;
    if (player.duration > 0) {
      durRef.current = player.duration;
      setDuration(player.duration);
    }
    if (startAt > 0) {
      player.currentTime = startAt;
      lastPos.current = startAt;
      setTime(startAt);
      setToast(`Reprise à ${formatDuration(startAt)}`);
    }
  }, [status, player, startAt]);

  useEventListener(player, 'timeUpdate', ({ currentTime, bufferedPosition }) => {
    lastPos.current = currentTime;
    setTime(currentTime);
    if (bufferedPosition >= 0) setBuffered(bufferedPosition);
    if (player.duration > 0 && player.duration !== durRef.current) {
      durRef.current = player.duration;
      setDuration(player.duration);
    }
    const now = Date.now();
    if (now - lastSave.current > 5000 && currentTime > 0) {
      lastSave.current = now;
      progressCb.current(currentTime, durRef.current);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    const d = durRef.current ?? lastPos.current;
    progressCb.current(d, durRef.current);
    setControlsVisible(true);
  });

  // Sauvegarde à la pause et à la fermeture de l'écran.
  useEffect(() => {
    if (!isPlaying && lastPos.current > 0) progressCb.current(lastPos.current, durRef.current);
  }, [isPlaying]);
  useEffect(
    () => () => {
      if (lastPos.current > 0) progressCb.current(lastPos.current, durRef.current);
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    },
    [],
  );

  // L'écran reste allumé pendant la lecture.
  useEffect(() => {
    if (isPlaying) void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, [isPlaying]);

  /* ── Contrôles : affichage, masquage automatique ── */
  const [controlsVisible, setControlsVisibleState] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setControlsVisible = useCallback(
    (v: boolean) => {
      setControlsVisibleState(v);
      Animated.timing(fade, { toValue: v ? 1 : 0, duration: 180, useNativeDriver: true }).start();
      if (!v) setShowVolume(false);
    },
    [fade],
  );

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (player.playing) setControlsVisible(false);
    }, HIDE_AFTER_MS);
  }, [player, setControlsVisible]);

  useEffect(() => {
    if (isPlaying && controlsVisible) scheduleHide();
    if (!isPlaying) setControlsVisible(true);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isPlaying, controlsVisible, scheduleHide, setControlsVisible]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Actions ── */
  const togglePlay = () => {
    if (player.playing) player.pause();
    else {
      if (durRef.current && lastPos.current >= durRef.current - 0.5) player.currentTime = 0;
      player.play();
    }
    scheduleHide();
  };

  const seekBy = (delta: number) => {
    const target = clampSeek(lastPos.current + delta, durRef.current);
    player.currentTime = target;
    lastPos.current = target;
    setTime(target);
    setSeekFlash(delta < 0 ? 'back' : 'forward');
    setTimeout(() => setSeekFlash(null), 450);
    scheduleHide();
  };

  const applyVolume = (v: number) => {
    setVolume(v);
    player.volume = v;
    if (v > 0 && muted) {
      setMuted(false);
      player.muted = false;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  /* ── Plein écran : rotation selon le format, retour Android ── */
  const isPortraitVideo = !!aspect && aspect < 1;
  useEffect(() => {
    if (fullscreen) {
      void ScreenOrientation.lockAsync(
        isPortraitVideo ? ScreenOrientation.OrientationLock.PORTRAIT_UP : ScreenOrientation.OrientationLock.LANDSCAPE,
      ).catch(() => undefined);
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onFullscreenChange(false);
        return true;
      });
      return () => sub.remove();
    }
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    return undefined;
  }, [fullscreen, isPortraitVideo, onFullscreenChange]);

  /* ── Tap simple : contrôles ; double-tap à gauche/droite : ±10 s ── */
  const width = useRef(1);
  const lastTap = useRef<{ t: number; side: 'l' | 'c' | 'r' } | null>(null);
  const singleTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSurfacePress = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    const side = x < width.current / 3 ? 'l' : x > (2 * width.current) / 3 ? 'r' : 'c';
    const now = Date.now();
    if (lastTap.current && now - lastTap.current.t < 280 && side !== 'c' && side === lastTap.current.side) {
      if (singleTap.current) clearTimeout(singleTap.current);
      lastTap.current = null;
      seekBy(side === 'l' ? -SEEK_STEP : SEEK_STEP);
      return;
    }
    lastTap.current = { t: now, side };
    if (singleTap.current) clearTimeout(singleTap.current);
    singleTap.current = setTimeout(() => setControlsVisible(!controlsVisible), side === 'c' ? 0 : 260);
  };

  const shownTime = scrub != null && duration ? scrub * duration : time;
  const ratio = duration ? Math.min(1, shownTime / duration) : 0;
  const loading = status === 'loading' || (status === 'idle' && !error);

  const containerStyle = fullscreen
    ? [styles.fullscreen]
    : [styles.inline, { aspectRatio: isPortraitVideo ? 1 : 16 / 9 }];

  return (
    <View
      style={containerStyle}
      onLayout={(e: LayoutChangeEvent) => {
        width.current = e.nativeEvent.layout.width;
      }}
    >
      <StatusBar hidden={fullscreen} style="light" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically={backgroundPlayback}
      />

      <Pressable style={StyleSheet.absoluteFill} onPress={onSurfacePress} accessibilityLabel="Afficher les contrôles" />

      {seekFlash && (
        <View pointerEvents="none" style={[styles.seekFlash, seekFlash === 'back' ? { left: '8%' } : { right: '8%' }]}>
          <MaterialIcons name={seekFlash === 'back' ? 'replay-10' : 'forward-10'} size={30} color="#fff" />
        </View>
      )}

      {loading && (
        <View pointerEvents="none" style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {status === 'error' && (
        <View style={[styles.center, styles.errorBox]}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
          <Text style={styles.errorText}>
            {isLocal ? 'Le fichier local est illisible.' : 'Lecture impossible. Le flux a peut-être expiré.'}
          </Text>
          <Pressable style={styles.retry} onPress={onRetry}>
            <Ionicons name="refresh" size={15} color="#fff" />
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      )}

      {!!toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Animated.View
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
        style={[StyleSheet.absoluteFill, { opacity: fade }]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} />

        {/* Haut : retour, titre, origine */}
        <View
          pointerEvents="box-none"
          style={[styles.top, fullscreen && { paddingTop: Math.max(insets.top, space.md), paddingHorizontal: Math.max(insets.left, space.lg) }]}
        >
          <Pressable
            onPress={fullscreen ? () => onFullscreenChange(false) : onBack}
            hitSlop={hitSlop}
            style={styles.iconBtn}
            accessibilityLabel={fullscreen ? 'Quitter le plein écran' : 'Retour'}
          >
            <Ionicons name={fullscreen ? 'chevron-down' : 'chevron-back'} size={24} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            {fullscreen && (
              <>
                <Text style={styles.topTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.topChannel} numberOfLines={1}>
                  {channel}
                </Text>
              </>
            )}
          </View>
          <View style={[styles.originBadge, isLocal && styles.originLocal]}>
            <Ionicons name={isLocal ? 'cloud-done' : 'wifi'} size={11} color="#fff" />
            <Text style={styles.originText}>{isLocal ? 'Local' : 'Streaming'}</Text>
          </View>
        </View>

        {/* Centre : -10 / lecture / +10 */}
        <View pointerEvents="box-none" style={styles.middle}>
          <Pressable onPress={() => seekBy(-SEEK_STEP)} hitSlop={hitSlop} style={styles.sideBtn} accessibilityLabel="Reculer de 10 secondes">
            <MaterialIcons name="replay-10" size={34} color="#fff" />
          </Pressable>
          <Pressable onPress={togglePlay} style={styles.playBtn} accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}>
            <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={44} color="#fff" />
          </Pressable>
          <Pressable onPress={() => seekBy(SEEK_STEP)} hitSlop={hitSlop} style={styles.sideBtn} accessibilityLabel="Avancer de 10 secondes">
            <MaterialIcons name="forward-10" size={34} color="#fff" />
          </Pressable>
        </View>

        {/* Bas : temps, progression, volume, plein écran */}
        <View
          pointerEvents="box-none"
          style={[styles.bottom, fullscreen && { paddingBottom: Math.max(insets.bottom, space.md), paddingHorizontal: Math.max(insets.left, insets.right, space.lg) }]}
        >
          {showVolume && (
            <View style={styles.volumeRow}>
              <MaterialIcons name="volume-down" size={18} color="#fff" />
              <View style={{ flex: 1 }}>
                <Scrubber value={muted ? 0 : volume} onChange={applyVolume} onComplete={applyVolume} color="#fff" accessibilityLabel="Volume" />
              </View>
              <MaterialIcons name="volume-up" size={18} color="#fff" />
            </View>
          )}
          <View style={styles.bottomRow}>
            <Text style={styles.time}>
              {formatDuration(shownTime)} <Text style={styles.timeDim}>/ {formatDuration(duration)}</Text>
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => setShowVolume((v) => !v)}
              onLongPress={toggleMute}
              hitSlop={hitSlop}
              style={styles.iconBtn}
              accessibilityLabel="Volume (appui long : couper le son)"
            >
              <MaterialIcons name={muted || volume === 0 ? 'volume-off' : volume < 0.5 ? 'volume-down' : 'volume-up'} size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => onFullscreenChange(!fullscreen)}
              hitSlop={hitSlop}
              style={styles.iconBtn}
              accessibilityLabel={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            >
              <MaterialIcons name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} size={26} color="#fff" />
            </Pressable>
          </View>
          <Scrubber
            value={ratio}
            buffered={duration ? Math.min(1, buffered / duration) : undefined}
            onSlidingStart={() => {
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
            onChange={setScrub}
            onComplete={(r) => {
              setScrub(null);
              if (duration) {
                const target = clampSeek(r * duration, duration);
                player.currentTime = target;
                lastPos.current = target;
                setTime(target);
              }
              scheduleHide();
            }}
            accessibilityLabel="Progression de la lecture"
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { width: '100%', backgroundColor: '#000' },
  fullscreen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 100, elevation: 100 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  dim: { backgroundColor: 'rgba(0,0,0,0.38)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingTop: space.sm },
  topTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  topChannel: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5 },
  iconBtn: { padding: 6 },
  originBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginRight: space.sm,
  },
  originLocal: { backgroundColor: 'rgba(76,195,138,0.85)' },
  originText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  middle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxl + space.md },
  sideBtn: { padding: 6 },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bottom: { paddingHorizontal: space.md, paddingBottom: 2 },
  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  time: { color: '#fff', fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeDim: { color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-end',
    width: 220,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    marginBottom: space.xs,
  },
  seekFlash: {
    position: 'absolute',
    top: '50%',
    marginTop: -34,
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  errorBox: { backgroundColor: 'rgba(0,0,0,0.7)', gap: space.sm, paddingHorizontal: space.xl },
  errorText: { color: '#fff', textAlign: 'center', fontSize: 14 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginTop: space.sm,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 64,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  toastText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
});
