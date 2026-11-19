import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatDuration } from '../core/format';
import { thumbnailCandidates } from '../core/thumbnails';
import { colors, pct, radius } from '../theme';

interface Props {
  videoId: string;
  uri?: string;
  /** Miniature enregistrée localement (vidéos hors ligne). Prioritaire. */
  localUri?: string | null;
  durationSec?: number | null;
  isLive?: boolean;
  /** Progression de lecture 0–1 (barre en bas de la miniature). */
  progress?: number;
  offline?: boolean;
  style?: StyleProp<ViewStyle>;
  rounded?: number;
  compact?: boolean;
}

export function Thumbnail({ videoId, uri, localUri, durationSec, isLive, progress, offline, style, rounded = radius.md, compact }: Props) {
  const candidates = useMemo(
    () => [...(localUri ? [localUri] : []), ...thumbnailCandidates(videoId, uri)],
    [videoId, uri, localUri],
  );
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [candidates]);
  const current = candidates[Math.min(index, candidates.length - 1)];

  return (
    <View style={[styles.box, { borderRadius: rounded }, style]}>
      {current ? (
        <Image
          source={{ uri: current }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          recyclingKey={`${videoId}-${index}`}
          onError={() => setIndex((i) => (i < candidates.length - 1 ? i + 1 : i))}
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="film-outline" size={compact ? 18 : 28} color={colors.textFaint} />
        </View>
      )}

      {offline && (
        <View style={[styles.badge, styles.offline]}>
          <Ionicons name="cloud-done" size={11} color="#fff" />
          {!compact && <Text style={styles.badgeText}>Hors ligne</Text>}
        </View>
      )}

      {(isLive || durationSec != null) && (
        <View style={[styles.badge, styles.duration, isLive && styles.live]}>
          <Text style={styles.badgeText}>{isLive ? 'DIRECT' : formatDuration(durationSec)}</Text>
        </View>
      )}

      {progress != null && progress > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: pct(Math.max(0.03, progress)) }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { aspectRatio: 16 / 9, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  placeholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: colors.scrim,
  },
  duration: { right: 6, bottom: 8 },
  live: { backgroundColor: colors.danger },
  offline: { left: 6, top: 6, backgroundColor: 'rgba(76,195,138,0.9)' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill: { height: 3, backgroundColor: colors.accent },
});
