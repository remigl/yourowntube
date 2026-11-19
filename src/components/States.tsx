import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '../theme';

/** Bloc gris pulsé pendant le chargement. */
export function Skeleton({ style }: { style?: object }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[styles.skeleton, style, { opacity: pulse }]} />;
}

export function CardSkeleton() {
  return (
    <View style={{ marginBottom: space.xl }}>
      <Skeleton style={{ aspectRatio: 16 / 9, borderRadius: radius.lg }} />
      <Skeleton style={{ height: 14, width: '85%', marginTop: space.md }} />
      <Skeleton style={{ height: 12, width: '45%', marginTop: space.sm }} />
    </View>
  );
}

export function RowSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm }}>
      <Skeleton style={{ width: 150, aspectRatio: 16 / 9, borderRadius: radius.sm }} />
      <View style={{ flex: 1, gap: space.sm, paddingTop: 2 }}>
        <Skeleton style={{ height: 13, width: '90%' }} />
        <Skeleton style={{ height: 13, width: '60%' }} />
        <Skeleton style={{ height: 11, width: '40%' }} />
      </View>
    </View>
  );
}

interface MessageProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'danger';
  children?: ReactNode;
}

/** État vide, erreur ou hors ligne : icône, texte, action éventuelle. */
export function MessageState({ icon, title, message, actionLabel, onAction, tone = 'neutral', children }: MessageProps) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [fade]);
  return (
    <Animated.View style={[styles.message, { opacity: fade }]}>
      <View style={[styles.iconWrap, tone === 'danger' && { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name={icon} size={26} color={tone === 'danger' ? colors.danger : colors.textDim} />
      </View>
      <Text style={[type.h2, styles.center]}>{title}</Text>
      {!!message && <Text style={[type.meta, styles.center, styles.msg]}>{message}</Text>}
      {!!actionLabel && onAction && <Button label={actionLabel} onPress={onAction} />}
      {children}
    </Animated.View>
  );
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'ghost' && { backgroundColor: colors.surfaceAlt },
        variant === 'danger' && { backgroundColor: colors.dangerSoft },
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
      accessibilityRole="button"
    >
      {icon && <Ionicons name={icon} size={16} color={fg} />}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Banner({
  icon,
  text,
  actionLabel,
  onAction,
  tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'warning' | 'success';
}) {
  const color = tone === 'warning' ? colors.accent : tone === 'success' ? colors.success : colors.textDim;
  const bg = tone === 'warning' ? colors.accentSoft : tone === 'success' ? colors.successSoft : colors.surfaceAlt;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[type.meta, { flex: 1, color: colors.text }]}>{text}</Text>
      {!!actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.bannerAction, { color }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={type.h2}>{title}</Text>
      {!!actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: colors.surfaceAlt, borderRadius: radius.xs },
  message: { alignItems: 'center', paddingVertical: space.xxl * 1.5, paddingHorizontal: space.xl, gap: space.sm },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  center: { textAlign: 'center' },
  msg: { maxWidth: 320, marginBottom: space.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg + 2,
    height: 42,
    borderRadius: radius.pill,
  },
  buttonText: { fontSize: 14, fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  bannerAction: { fontSize: 13, fontWeight: '700' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md },
  sectionAction: { color: colors.accent, fontSize: 13.5, fontWeight: '600' },
});
