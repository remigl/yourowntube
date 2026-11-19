import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, space } from '../theme';

interface Props {
  label: string;
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  onLongPress?: () => void;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
}

export function Chip({ label, active, icon, onPress, onLongPress, trailingIcon }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.chip, active && styles.active, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? colors.accent : colors.textDim} />}
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
      {trailingIcon && <Ionicons name={trailingIcon} size={13} color={active ? colors.accent : colors.textFaint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: 240,
  },
  active: { backgroundColor: colors.accentSoft, borderColor: 'rgba(255,107,61,0.35)' },
  pressed: { backgroundColor: colors.surfacePressed },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  labelActive: { color: colors.accent },
});
