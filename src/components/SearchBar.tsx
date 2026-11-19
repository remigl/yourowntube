import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, hitSlop, radius, space } from '../theme';

interface Props {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: (t: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  editable?: boolean;
  placeholder?: string;
}

export const SearchBar = forwardRef<TextInput, Props>(function SearchBar(
  { value, onChangeText, onSubmit, onFocus, onBlur, editable = true, placeholder = 'Rechercher une vidéo' },
  ref,
) {
  return (
    <View style={[styles.wrap, !editable && styles.disabled]}>
      <Ionicons name="search" size={18} color={colors.textDim} />
      <TextInput
        ref={ref}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={(e) => onSubmit(e.nativeEvent.text)}
        onFocus={onFocus}
        onBlur={onBlur}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        selectionColor={colors.accent}
        keyboardAppearance="dark"
        accessibilityLabel="Rechercher"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={hitSlop} accessibilityLabel="Effacer la recherche">
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 46,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.55 },
  input: { flex: 1, color: colors.text, fontSize: 15.5, paddingVertical: 0 },
});
