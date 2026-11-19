import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatViews, publishedLabel } from '../core/format';
import type { VideoSummary } from '../core/types';
import { colors, radius, space, type } from '../theme';
import { PressableScale } from './PressableScale';
import { Thumbnail } from './Thumbnail';

interface CardProps {
  video: VideoSummary;
  onPress: (v: VideoSummary) => void;
  onLongPress?: (v: VideoSummary) => void;
  progress?: number;
  offline?: boolean;
}

export function metaLine(v: VideoSummary): string {
  return [formatViews(v.viewCount), publishedLabel(v.publishedAt, v.publishedText)].filter(Boolean).join(' · ');
}

/** Grande carte : miniature pleine largeur, titre, chaîne, durée, date. */
export const VideoCard = memo(function VideoCard({ video, onPress, onLongPress, progress, offline }: CardProps) {
  const meta = metaLine(video);
  return (
    <PressableScale
      onPress={() => onPress(video)}
      onLongPress={onLongPress ? () => onLongPress(video) : undefined}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${video.title}, ${video.channelName}`}
    >
      <Thumbnail
        videoId={video.id}
        uri={video.thumbnail}
        durationSec={video.durationSec}
        isLive={video.isLive}
        progress={progress}
        offline={offline}
        rounded={radius.lg}
      />
      <View style={styles.text}>
        <Text style={type.title} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[type.meta, styles.channel]} numberOfLines={1}>
          {video.channelName}
        </Text>
        {!!meta && (
          <Text style={type.meta} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
    </PressableScale>
  );
});

interface RowProps extends CardProps {
  /** Petite étiquette sous le titre (« Même chaîne », « 1,2 Go »…). */
  tag?: string;
  subtitle?: string;
  right?: ReactNode;
  selected?: boolean;
  localThumb?: string | null;
}

/** Ligne compacte : miniature à gauche (similaires, historique, bibliothèque). */
export const VideoRow = memo(function VideoRow({ video, onPress, onLongPress, progress, offline, tag, subtitle, right, selected, localThumb }: RowProps) {
  return (
    <PressableScale
      onPress={() => onPress(video)}
      onLongPress={onLongPress ? () => onLongPress(video) : undefined}
      style={[styles.row, selected && styles.rowSelected]}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${video.title}, ${video.channelName}`}
    >
      <Thumbnail
        videoId={video.id}
        uri={video.thumbnail}
        localUri={localThumb}
        durationSec={video.durationSec}
        isLive={video.isLive}
        progress={progress}
        offline={offline}
        style={styles.rowThumb}
        rounded={radius.sm}
        compact
      />
      <View style={styles.rowText}>
        <Text style={[type.title, styles.rowTitle]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={type.meta} numberOfLines={1}>
          {video.channelName}
        </Text>
        {!!(subtitle ?? metaLine(video)) && (
          <Text style={type.meta} numberOfLines={1}>
            {subtitle ?? metaLine(video)}
          </Text>
        )}
        {!!tag && <Text style={styles.tag}>{tag}</Text>}
      </View>
      {right}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: { marginBottom: space.xl },
  text: { paddingTop: space.md, paddingHorizontal: 2, gap: 3 },
  channel: { color: colors.text, opacity: 0.8 },
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, alignItems: 'flex-start', borderRadius: radius.md },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowThumb: { width: 150 },
  rowText: { flex: 1, gap: 2, paddingTop: 1 },
  rowTitle: { fontSize: 14, lineHeight: 18 },
  tag: { marginTop: 3, alignSelf: 'flex-start', fontSize: 11, fontWeight: '600', color: colors.accent },
});
