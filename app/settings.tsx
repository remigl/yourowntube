import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '../src/components/Chip';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Button } from '../src/components/States';
import { describeError } from '../src/core/errors';
import { normalizeInstance } from '../src/core/sources/http';
import { INSTANCE_HINTS, SOURCE_LABELS, type AppSettings } from '../src/core/settings';
import type { SourceKind } from '../src/core/types';
import { clearSearches, clearWatchHistory, pruneOrphanVideos } from '../src/db/repo';
import { useApp } from '../src/state/AppContext';
import { colors, radius, space, type } from '../src/theme';

const SOURCE_HINTS: Record<SourceKind, string> = {
  demo: 'Vidéos libres d’exemple, sans configuration. Idéal pour essayer l’application.',
  invidious: 'Recherche, lecture, téléchargement et recommandations via une instance Invidious.',
  piped: 'Recherche, lecture (HLS) et téléchargement via une instance Piped.',
  youtube: 'Recherche via l’API officielle (clé requise). Lecture via Invidious ou Piped.',
};

type TestState = { status: 'idle' } | { status: 'running' } | { status: 'ok' } | { status: 'error'; message: string };

export default function SettingsScreen() {
  const { settings, updateSettings, source, sourceError } = useApp();
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => setTest({ status: 'idle' }), [source]);

  const runTest = async () => {
    if (!source) {
      setTest({ status: 'error', message: sourceError?.message ?? 'Source non configurée.' });
      return;
    }
    setTest({ status: 'running' });
    try {
      await source.ping();
      setTest({ status: 'ok' });
    } catch (e) {
      setTest({ status: 'error', message: describeError(e) });
    }
  };

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void updateSettings({ [key]: value } as Partial<AppSettings>);

  const needsInvidious = settings.source === 'invidious' || (settings.source === 'youtube' && settings.youtubeStreamProvider === 'invidious');
  const needsPiped = settings.source === 'piped' || (settings.source === 'youtube' && settings.youtubeStreamProvider === 'piped');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Réglages" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title="Source des vidéos">
            {(Object.keys(SOURCE_LABELS) as SourceKind[]).map((k) => (
              <Pressable key={k} style={({ pressed }) => [styles.radio, pressed && styles.pressed]} onPress={() => set('source', k)} accessibilityRole="radio" accessibilityState={{ checked: settings.source === k }}>
                <Ionicons name={settings.source === k ? 'radio-button-on' : 'radio-button-off'} size={20} color={settings.source === k ? colors.accent : colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{SOURCE_LABELS[k]}</Text>
                  <Text style={type.meta}>{SOURCE_HINTS[k]}</Text>
                </View>
              </Pressable>
            ))}

            {settings.source === 'youtube' && (
              <>
                <Field
                  label="Clé API YouTube Data v3"
                  value={settings.youtubeApiKey}
                  placeholder="AIza…"
                  secure
                  onCommit={(v) => set('youtubeApiKey', v.trim())}
                  hint="Stockée dans le trousseau sécurisé du téléphone. Chaque recherche consomme 100 unités de quota (10 000 / jour par défaut)."
                />
                <Text style={[type.meta, styles.label]}>Lecture et téléchargement via</Text>
                <View style={styles.chips}>
                  <Chip label="Invidious" active={settings.youtubeStreamProvider === 'invidious'} onPress={() => set('youtubeStreamProvider', 'invidious')} />
                  <Chip label="Piped" active={settings.youtubeStreamProvider === 'piped'} onPress={() => set('youtubeStreamProvider', 'piped')} />
                </View>
              </>
            )}

            {needsInvidious && (
              <Field
                label="Instance Invidious"
                value={settings.invidiousInstance}
                placeholder={INSTANCE_HINTS.invidious}
                url
                onCommit={(v) => set('invidiousInstance', normalizeInstance(v))}
                hint="Adresse d’une instance publique ou auto-hébergée (liste sur docs.invidious.io/instances)."
              />
            )}
            {needsPiped && (
              <Field
                label="Instance Piped (API)"
                value={settings.pipedInstance}
                placeholder={INSTANCE_HINTS.piped}
                url
                onCommit={(v) => set('pipedInstance', normalizeInstance(v))}
                hint="Adresse de l’API, pas du site web (souvent « pipedapi.… »)."
              />
            )}

            <View style={styles.testRow}>
              <Button label="Tester la connexion" icon="pulse-outline" variant="ghost" onPress={() => void runTest()} disabled={test.status === 'running'} />
              {test.status === 'running' && <ActivityIndicator color={colors.accent} />}
              {test.status === 'ok' && (
                <Text style={[type.meta, { color: colors.success }]}>
                  <Ionicons name="checkmark-circle" size={13} /> Source opérationnelle
                </Text>
              )}
            </View>
            {test.status === 'error' && <Text style={[type.meta, { color: colors.danger }]}>{test.message}</Text>}
            {!!sourceError && test.status === 'idle' && <Text style={[type.meta, { color: colors.accent }]}>{sourceError.message}</Text>}
          </Section>

          <Section title="Lecture">
            <Toggle label="Lecture en arrière-plan" hint="Le son continue écran verrouillé ou dans une autre app, avec contrôles dans les notifications." value={settings.backgroundPlayback} onChange={(v) => set('backgroundPlayback', v)} />
            <Toggle label="Reprendre là où je me suis arrêté" value={settings.resumePlayback} onChange={(v) => set('resumePlayback', v)} />
          </Section>

          <Section title="Shorts">
            <Text style={type.meta}>
              Les Shorts sont toujours exclus (marqueur de la source, format vertical, #shorts). Toute vidéo plus courte que ce seuil est aussi écartée :
            </Text>
            <View style={styles.chips}>
              {[60, 90, 120, 180].map((s) => (
                <Chip key={s} label={s < 120 ? `${s} s` : `${s / 60} min`} active={settings.shortsThresholdSec === s} onPress={() => set('shortsThresholdSec', s)} />
              ))}
            </View>
          </Section>

          <Section title="Téléchargements">
            <Text style={type.meta}>Qualité maximale (selon ce que propose la source pour un fichier unique audio + vidéo) :</Text>
            <View style={styles.chips}>
              {[360, 480, 720, 1080].map((h) => (
                <Chip key={h} label={`${h}p`} active={settings.downloadMaxHeight === h} onPress={() => set('downloadMaxHeight', h)} />
              ))}
            </View>
          </Section>

          <Section title="Historique et confidentialité">
            <Toggle label="Enregistrer les recherches" value={settings.saveSearchHistory} onChange={(v) => set('saveSearchHistory', v)} />
            <Toggle label="Enregistrer les vidéos regardées" value={settings.saveWatchHistory} onChange={(v) => set('saveWatchHistory', v)} />
            <View style={styles.buttons}>
              <Button
                label="Effacer les recherches"
                variant="danger"
                onPress={() =>
                  Alert.alert('Effacer les recherches ?', undefined, [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Effacer', style: 'destructive', onPress: () => void clearSearches() },
                  ])
                }
              />
              <Button
                label="Effacer les vidéos regardées"
                variant="danger"
                onPress={() =>
                  Alert.alert('Effacer l’historique de visionnage ?', 'La progression de lecture sera aussi oubliée.', [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Effacer',
                      style: 'destructive',
                      onPress: () => void clearWatchHistory().then(pruneOrphanVideos),
                    },
                  ])
                }
              />
            </View>
            <Text style={type.meta}>Tout est stocké uniquement sur ce téléphone. Aucun compte, aucun suivi.</Text>
          </Section>

          <Text style={[type.caption, styles.version]}>YourOwnTube {Constants.expoConfig?.version ?? ''}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{label}</Text>
        {!!hint && <Text style={type.meta}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.surfaceAlt, true: colors.accent }} thumbColor="#fff" ios_backgroundColor={colors.surfaceAlt} />
    </View>
  );
}

/** Champ texte enregistré à la validation (pas à chaque frappe). */
function Field({ label, value, placeholder, hint, secure, url, onCommit }: { label: string; value: string; placeholder?: string; hint?: string; secure?: boolean; url?: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [reveal, setReveal] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <View style={styles.field}>
      <Text style={[type.meta, styles.label]}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          onEndEditing={commit}
          onSubmitEditing={commit}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure && !reveal}
          keyboardType={url ? 'url' : 'default'}
          keyboardAppearance="dark"
          selectionColor={colors.accent}
          returnKeyType="done"
        />
        {secure && (
          <Pressable onPress={() => setReveal((r) => !r)} hitSlop={8} accessibilityLabel={reveal ? 'Masquer' : 'Afficher'}>
            <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textDim} />
          </Pressable>
        )}
      </View>
      {!!hint && <Text style={[type.meta, { marginTop: space.xs }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 },
  section: { marginTop: space.lg },
  sectionTitle: { ...type.caption, textTransform: 'uppercase', marginBottom: space.sm, marginLeft: space.xs },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.md },
  radio: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.sm, borderRadius: radius.sm },
  pressed: { backgroundColor: colors.surfacePressed },
  label: { color: colors.text, fontWeight: '600', marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  field: {},
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: space.md, height: 44 },
  input: { flex: 1, color: colors.text, fontSize: 14.5, paddingVertical: 0 },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  buttons: { gap: space.sm, alignItems: 'flex-start' },
  version: { textAlign: 'center', marginTop: space.xl },
});
