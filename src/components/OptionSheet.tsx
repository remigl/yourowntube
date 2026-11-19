import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space, type } from '../theme';

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  visible: boolean;
  title: string;
  options: SheetOption<T>[];
  selected?: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}

/** Feuille d'options en bas d'écran, légère et animée. */
export function OptionSheet<T extends string>({ visible, title, options, selected, onSelect, onClose }: Props<T>) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, slide]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + space.md },
          { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] },
        ]}
      >
        <View style={styles.handle} />
        <Text style={[type.h2, styles.title]}>{title}</Text>
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                onSelect(o.value);
                onClose();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, active && styles.activeText]}>{o.label}</Text>
                {!!o.hint && <Text style={type.meta}>{o.hint}</Text>}
              </View>
              {active && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </Pressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.md },
  title: { marginBottom: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.sm },
  pressed: { backgroundColor: colors.surfacePressed },
  activeText: { color: colors.accent, fontWeight: '600' },
});
