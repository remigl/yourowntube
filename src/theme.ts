import { Platform, StyleSheet } from 'react-native';

export const colors = {
  bg: '#0A0A0C',
  surface: '#141417',
  surfaceAlt: '#1C1C21',
  surfacePressed: '#24242A',
  border: '#26262D',
  text: '#F3F3F6',
  textDim: '#A0A0AA',
  textFaint: '#62626C',
  /** Accent discret : orange braise. */
  accent: '#FF6B3D',
  accentSoft: 'rgba(255,107,61,0.14)',
  success: '#4CC38A',
  successSoft: 'rgba(76,195,138,0.14)',
  danger: '#FF5C6C',
  dangerSoft: 'rgba(255,92,108,0.14)',
  overlay: 'rgba(0,0,0,0.55)',
  scrim: 'rgba(0,0,0,0.72)',
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

const family = Platform.select({ ios: 'System', default: undefined });

export const type = StyleSheet.create({
  brand: { fontFamily: family, fontSize: 20, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  h1: { fontFamily: family, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: colors.text },
  h2: { fontFamily: family, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  title: { fontFamily: family, fontSize: 15, fontWeight: '600', lineHeight: 20, letterSpacing: -0.15, color: colors.text },
  body: { fontFamily: family, fontSize: 14, lineHeight: 20, color: colors.text },
  meta: { fontFamily: family, fontSize: 12.5, lineHeight: 17, color: colors.textDim },
  caption: { fontFamily: family, fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: colors.textFaint },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, color: colors.text },
});

export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

/** Pourcentage typé pour les styles React Native (`${number}%`). */
export function pct(ratio01: number): `${number}%` {
  return `${Math.min(100, Math.max(0, ratio01 * 100))}%`;
}
