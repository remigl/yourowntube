/** Identifiant YouTube classique : 11 caractères [A-Za-z0-9_-]. */
export function isYouTubeId(id: string): boolean {
  return /^[\w-]{11}$/.test(id);
}

/**
 * Miniatures candidates, de la meilleure à la plus sûre. `hq720` (1280×720)
 * n'existe pas pour toutes les vidéos ; `hqdefault` existe toujours.
 */
export function thumbnailCandidates(id: string, given?: string): string[] {
  const list: string[] = [];
  // Seulement pour de vraies vidéos YouTube (miniature absente ou servie depuis /vi/<id>/).
  const yt = isYouTubeId(id) && (!given || given.includes(`/vi/${id}/`));
  if (yt) {
    list.push(`https://i.ytimg.com/vi/${id}/hq720.jpg`, `https://i.ytimg.com/vi/${id}/sddefault.jpg`);
  }
  if (given) list.push(given);
  if (yt) list.push(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  return [...new Set(list)];
}
