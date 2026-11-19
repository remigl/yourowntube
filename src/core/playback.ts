/** Règles de lecture : reprise et choix local / streaming. */

export const RESUME_MIN_SEC = 5;
export const RESUME_TAIL_SEC = 15;
export const COMPLETED_RATIO = 0.95;

/** Position de reprise, ou 0 si la vidéo est à peine commencée ou presque finie. */
export function resumePosition(position: number | null | undefined, duration: number | null | undefined): number {
  if (!position || position < RESUME_MIN_SEC) return 0;
  if (duration && duration > 0 && (position >= duration - RESUME_TAIL_SEC || position / duration >= COMPLETED_RATIO)) {
    return 0;
  }
  return position;
}

export function isCompleted(position: number, duration: number | null | undefined): boolean {
  if (!duration || duration <= 0) return false;
  return position / duration >= COMPLETED_RATIO || duration - position <= RESUME_TAIL_SEC;
}

export type PlaybackOrigin = 'local' | 'stream' | 'unavailable_offline';

/** Priorité absolue au fichier local ; sinon streaming si en ligne. */
export function choosePlaybackOrigin(hasLocalFile: boolean, online: boolean): PlaybackOrigin {
  if (hasLocalFile) return 'local';
  return online ? 'stream' : 'unavailable_offline';
}

export function clampSeek(target: number, duration: number | null | undefined): number {
  const max = duration && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(0, target), max);
}
