import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { DATE_LABELS, DURATION_LABELS, filtersAreDefault, SORT_LABELS } from '../core/filters';
import { DEFAULT_FILTERS, type SearchFilters } from '../core/types';
import { space } from '../theme';
import { Chip } from './Chip';
import { OptionSheet, type SheetOption } from './OptionSheet';

type SheetKind = 'sort' | 'uploadDate' | 'duration' | null;

function options<T extends string>(labels: Record<T, string>): SheetOption<T>[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

/** Filtres et tri de la recherche, en puces horizontales. */
export function FilterBar({ value, onChange }: { value: SearchFilters; onChange: (f: SearchFilters) => void }) {
  const [sheet, setSheet] = useState<SheetKind>(null);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        <Chip icon="swap-vertical" label={SORT_LABELS[value.sort]} active={value.sort !== 'relevance'} trailingIcon="chevron-down" onPress={() => setSheet('sort')} />
        <Chip icon="calendar-outline" label={DATE_LABELS[value.uploadDate]} active={value.uploadDate !== 'any'} trailingIcon="chevron-down" onPress={() => setSheet('uploadDate')} />
        <Chip icon="time-outline" label={DURATION_LABELS[value.duration]} active={value.duration !== 'any'} trailingIcon="chevron-down" onPress={() => setSheet('duration')} />
        {!filtersAreDefault(value) && <Chip icon="close" label="Réinitialiser" onPress={() => onChange(DEFAULT_FILTERS)} />}
      </ScrollView>

      <OptionSheet
        visible={sheet === 'sort'}
        title="Trier par"
        options={options(SORT_LABELS)}
        selected={value.sort}
        onSelect={(sort) => onChange({ ...value, sort })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'uploadDate'}
        title="Date de publication"
        options={options(DATE_LABELS)}
        selected={value.uploadDate}
        onSelect={(uploadDate) => onChange({ ...value, uploadDate })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'duration'}
        title="Durée"
        options={options(DURATION_LABELS).map((o) =>
          o.value === 'short' ? { ...o, hint: 'Les Shorts restent toujours exclus' } : o,
        )}
        selected={value.duration}
        onSelect={(duration) => onChange({ ...value, duration })}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
});
