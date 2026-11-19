import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBytes } from '../core/format';
import type { VideoSummary } from '../core/types';
import { useDownloadState } from '../hooks/useDownloadState';
import { downloads } from '../services/downloads';
import { useApp } from '../state/AppContext';
import { colors, pct as toPct, radius, space } from '../theme';

/** Bouton « Télécharger » à quatre états : absent, en cours, disponible, erreur. */
export function DownloadButton({ video }: { video: VideoSummary }) {
  const { source, online, settings } = useApp();
  const { entry, progress, active } = useDownloadState(video.id);

  const start = () => {
    if (!source) {
      Alert.alert('Source non configurée', 'Configurez une source dans les réglages pour télécharger.');
      return;
    }
    if (!online) {
      Alert.alert('Hors ligne', 'Une connexion est nécessaire pour télécharger cette vidéo.');
      return;
    }
    void downloads.start(video, source, settings.downloadMaxHeight);
  };

  if (active) {
    const pct = Math.round(progress * 100);
    return (
      <Pressable
        style={[styles.btn, styles.busy]}
        onPress={() =>
          Alert.alert('Annuler le téléchargement ?', undefined, [
            { text: 'Continuer', style: 'cancel' },
            { text: 'Annuler', style: 'destructive', onPress: () => void downloads.cancel(video.id) },
          ])
        }
        accessibilityLabel={`Téléchargement ${pct} %, appuyer pour annuler`}
      >
        <View style={[styles.fill, { width: toPct(Math.max(0.04, progress)) }]} />
        {pct === 0 ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="close" size={16} color={colors.accent} />}
        <Text style={[styles.label, { color: colors.accent }]}>{pct === 0 ? 'Préparation…' : `${pct} %`}</Text>
      </Pressable>
    );
  }

  if (entry?.status === 'done') {
    return (
      <Pressable
        style={[styles.btn, styles.done]}
        onPress={() =>
          Alert.alert('Disponible hors ligne', `${formatBytes(entry.sizeBytes)}${entry.quality ? ` · ${entry.quality}` : ''}`, [
            { text: 'Fermer', style: 'cancel' },
            { text: 'Supprimer le fichier', style: 'destructive', onPress: () => void downloads.remove([video.id]) },
          ])
        }
        accessibilityLabel="Disponible hors ligne"
      >
        <Ionicons name="cloud-done" size={16} color={colors.success} />
        <Text style={[styles.label, { color: colors.success }]}>Disponible hors ligne</Text>
        <Text style={styles.size}>{formatBytes(entry.sizeBytes)}</Text>
      </Pressable>
    );
  }

  if (entry?.status === 'error') {
    return (
      <Pressable style={[styles.btn, styles.error]} onPress={start} accessibilityLabel="Réessayer le téléchargement">
        <Ionicons name="refresh" size={16} color={colors.danger} />
        <Text style={[styles.label, { color: colors.danger }]} numberOfLines={1}>
          Échec — réessayer
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]} onPress={start} accessibilityLabel="Télécharger">
      <Ionicons name="download-outline" size={17} color={colors.text} />
      <Text style={styles.label}>Télécharger</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 38,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  busy: { backgroundColor: colors.accentSoft, minWidth: 130 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,107,61,0.18)' },
  done: { backgroundColor: colors.successSoft },
  error: { backgroundColor: colors.dangerSoft },
  label: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  size: { color: colors.textDim, fontSize: 12.5, fontWeight: '600' },
});
