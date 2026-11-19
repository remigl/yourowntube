import type { SearchFilters } from '../../types';

/**
 * Paramètre `params` de la recherche Innertube : un petit message protobuf
 * encodé en base64.
 *
 *   SearchParams { 1: tri (varint), 2: Filtres { 1: date, 2: type, 3: durée } }
 *
 * Exemples connus : vidéos seules = « EgIQAQ== », vidéos triées par date =
 * « CAISAhAB », vidéos courtes (< 4 min) = « EgQQARgB ».
 */

const SORT = { relevance: 0, rating: 1, date: 2, views: 3 } as const;
const UPLOAD = { any: 0, today: 2, week: 3, month: 4, year: 5 } as const;
const DURATION = { any: 0, short: 1, long: 2, medium: 3 } as const;
const TYPE_VIDEO = 1;

function varint(n: number): number[] {
  const out: number[] = [];
  let v = n >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

function field(num: number, value: number): number[] {
  return [...varint((num << 3) | 0), ...varint(value)];
}

function message(num: number, bytes: number[]): number[] {
  return [...varint((num << 3) | 2), ...varint(bytes.length), ...bytes];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/** Toujours « vidéos uniquement » (ni chaînes, ni playlists, ni films). */
export function searchParams(f: SearchFilters): string {
  const filters = [
    ...(UPLOAD[f.uploadDate] ? field(1, UPLOAD[f.uploadDate]) : []),
    ...field(2, TYPE_VIDEO),
    ...(DURATION[f.duration] ? field(3, DURATION[f.duration]) : []),
  ];
  const bytes = [...(SORT[f.sort] ? field(1, SORT[f.sort]) : []), ...message(2, filters)];
  return base64(bytes);
}
