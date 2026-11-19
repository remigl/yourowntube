import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, hitSlop, space, type } from '../theme';

export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        hitSlop={hitSlop}
        style={styles.back}
        accessibilityLabel="Retour"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={[type.h1, styles.title]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

export function HeaderAction({ label, onPress, tone = 'accent' }: { label: string; onPress: () => void; tone?: 'accent' | 'danger' }) {
  return (
    <Pressable onPress={onPress} hitSlop={hitSlop} accessibilityRole="button">
      <Text style={[styles.action, { color: tone === 'danger' ? colors.danger : colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 52 },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 22 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { fontSize: 14, fontWeight: '700' },
});
