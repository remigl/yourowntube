import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { colors, pct } from '../theme';

interface Props {
  /** Valeur 0–1. */
  value: number;
  /** Portion mise en mémoire tampon 0–1 (barre secondaire). */
  buffered?: number;
  onSlidingStart?: () => void;
  /** Appelé pendant le glissement (aperçu). */
  onChange?: (ratio: number) => void;
  /** Appelé au relâchement (validation). */
  onComplete: (ratio: number) => void;
  color?: string;
  height?: number;
  accessibilityLabel?: string;
}

/** Barre de progression / curseur, sans dépendance native supplémentaire. */
export function Scrubber({ value, buffered, onSlidingStart, onChange, onComplete, color = colors.accent, height = 3, accessibilityLabel }: Props) {
  const box = useRef({ left: 0, width: 1 });
  const viewRef = useRef<View>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const cb = useRef({ onSlidingStart, onChange, onComplete });
  cb.current = { onSlidingStart, onChange, onComplete };

  const ratioAt = (e: GestureResponderEvent) =>
    Math.min(1, Math.max(0, (e.nativeEvent.pageX - box.current.left) / box.current.width));

  const measure = () =>
    viewRef.current?.measureInWindow((x, _y, w) => {
      box.current = { left: x, width: Math.max(1, w) };
    });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          measure();
          const r = ratioAt(e);
          setDrag(r);
          cb.current.onSlidingStart?.();
          cb.current.onChange?.(r);
        },
        onPanResponderMove: (e) => {
          const r = ratioAt(e);
          setDrag(r);
          cb.current.onChange?.(r);
        },
        onPanResponderRelease: (e) => {
          const r = ratioAt(e);
          setDrag(null);
          cb.current.onComplete(r);
        },
        onPanResponderTerminate: () => setDrag(null),
      }),
    [],
  );

  const shown = drag ?? value;
  return (
    <View
      ref={viewRef}
      onLayout={measure}
      style={styles.touch}
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100) }}
    >
      <View style={[styles.track, { height: drag != null ? height + 2 : height }]}>
        {buffered != null && <View style={[styles.buffer, { width: pct(buffered) }]} />}
        <View style={[styles.fill, { width: pct(shown), backgroundColor: color }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: pct(shown), backgroundColor: color }, drag != null && styles.thumbActive]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  touch: { height: 28, justifyContent: 'center' },
  track: { width: '100%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  buffer: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6 },
  thumbActive: { width: 18, height: 18, borderRadius: 9, marginLeft: -9 },
});
