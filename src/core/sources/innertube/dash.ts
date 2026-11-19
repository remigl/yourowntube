/**
 * Manifeste DASH construit à partir des flux adaptatifs (vidéo seule + audio
 * seul). C'est ce qui permet la HD : YouTube ne propose presque plus de
 * fichiers audio + vidéo réunis au-delà de 360p. Lisible par ExoPlayer
 * (Android) ; iOS ne lit pas le DASH.
 */

export interface AdaptiveFormat {
  itag: number;
  url?: string;
  mimeType: string;
  bitrate?: number;
  averageBitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  qualityLabel?: string;
  contentLength?: string;
  approxDurationMs?: string;
  audioSampleRate?: string;
  audioChannels?: number;
  initRange?: { start: string; end: string };
  indexRange?: { start: string; end: string };
  audioTrack?: { audioIsDefault?: boolean };
}

function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function split(mime: string): { type: string; codecs: string } {
  const [type, rest = ''] = mime.split(';');
  const m = /codecs="([^"]+)"/.exec(rest);
  return { type: type.trim(), codecs: m?.[1] ?? '' };
}

const usable = (f: AdaptiveFormat) => !!f.url && !!f.initRange && !!f.indexRange;

/** Vidéos H.264 (compatibilité maximale) jusqu'à `maxHeight`, une par hauteur. */
export function pickVideo(formats: AdaptiveFormat[], maxHeight = 1080): AdaptiveFormat[] {
  const byHeight = new Map<number, AdaptiveFormat>();
  for (const f of formats) {
    const { type, codecs } = split(f.mimeType);
    if (!usable(f) || type !== 'video/mp4' || !codecs.startsWith('avc1') || !f.height || f.height > maxHeight) continue;
    const prev = byHeight.get(f.height);
    if (!prev || (f.bitrate ?? 0) > (prev.bitrate ?? 0)) byHeight.set(f.height, f);
  }
  return [...byHeight.values()].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

/** Meilleure piste audio AAC, en privilégiant la piste d'origine (pas un doublage). */
export function pickAudio(formats: AdaptiveFormat[]): AdaptiveFormat | undefined {
  const aac = formats.filter((f) => usable(f) && split(f.mimeType).type === 'audio/mp4');
  const original = aac.filter((f) => f.audioTrack?.audioIsDefault !== false);
  return (original.length ? original : aac).sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

function representation(f: AdaptiveFormat, audio: boolean): string {
  const { codecs } = split(f.mimeType);
  const attrs = [
    `id="${f.itag}"`,
    `codecs="${xml(codecs)}"`,
    `bandwidth="${f.bitrate ?? f.averageBitrate ?? 1}"`,
    ...(audio
      ? [`audioSamplingRate="${f.audioSampleRate ?? 44100}"`]
      : [`width="${f.width}"`, `height="${f.height}"`, ...(f.fps ? [`frameRate="${f.fps}"`] : [])]),
  ];
  const channels = audio
    ? `<AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="${f.audioChannels ?? 2}"/>`
    : '';
  return (
    `<Representation ${attrs.join(' ')}>${channels}` +
    `<BaseURL>${xml(f.url!)}</BaseURL>` +
    `<SegmentBase indexRange="${f.indexRange!.start}-${f.indexRange!.end}">` +
    `<Initialization range="${f.initRange!.start}-${f.initRange!.end}"/></SegmentBase></Representation>`
  );
}

/** Manifeste MPD complet, ou undefined s'il manque la vidéo ou l'audio. */
export function buildDashManifest(formats: AdaptiveFormat[], durationSec: number, maxHeight = 1080): string | undefined {
  const video = pickVideo(formats, maxHeight);
  const audio = pickAudio(formats);
  if (video.length === 0 || !audio || !(durationSec > 0)) return undefined;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" ' +
    `mediaPresentationDuration="PT${durationSec.toFixed(3)}S" minBufferTime="PT1.5S"><Period>` +
    `<AdaptationSet id="0" contentType="video" mimeType="video/mp4" subsegmentAlignment="true">${video.map((f) => representation(f, false)).join('')}</AdaptationSet>` +
    `<AdaptationSet id="1" contentType="audio" mimeType="audio/mp4" subsegmentAlignment="true">${representation(audio, true)}</AdaptationSet>` +
    '</Period></MPD>'
  );
}
