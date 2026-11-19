import * as FileSystem from 'expo-file-system/legacy';

/**
 * Fichiers locaux, dans le dossier privé de l'application (inaccessible aux
 * autres applications, supprimé avec l'application). On évite le cache
 * système, que l'OS peut vider : une vidéo hors ligne doit rester disponible.
 */
const ROOT = `${FileSystem.documentDirectory ?? ''}yourowntube/`;
export const VIDEOS_DIR = `${ROOT}videos/`;
export const THUMBS_DIR = `${ROOT}thumbs/`;
const DASH_DIR = `${FileSystem.cacheDirectory ?? ''}dash/`;

/** Écrit un manifeste DASH généré localement et renvoie son URI file://. */
export async function writeDashManifest(videoId: string, xml: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(DASH_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DASH_DIR, { intermediates: true });
  const uri = `${DASH_DIR}${safeName(videoId)}.mpd`;
  await FileSystem.writeAsStringAsync(uri, xml);
  return uri;
}

let ensured: Promise<void> | null = null;

export function ensureDirs(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const dir of [VIDEOS_DIR, THUMBS_DIR]) {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

/** Nom de fichier sûr à partir d'un identifiant de vidéo. */
export function safeName(id: string): string {
  return id.replace(/[^\w-]/g, '_');
}

export function extensionFor(mimeType: string | null | undefined): string {
  if (!mimeType) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('3gpp')) return '3gp';
  return 'mp4';
}

export async function fileExists(uri: string | null | undefined): Promise<boolean> {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

export async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory ? (info.size ?? 0) : 0;
}

export async function deleteFile(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.warn('[files] suppression impossible', uri, e);
  }
}

export async function freeDiskSpace(): Promise<number | null> {
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

/** Supprime les fichiers partiels (.part) laissés par un téléchargement interrompu. */
export async function cleanPartialFiles(): Promise<void> {
  await ensureDirs();
  const names = await FileSystem.readDirectoryAsync(VIDEOS_DIR);
  await Promise.all(names.filter((n) => n.endsWith('.part')).map((n) => deleteFile(VIDEOS_DIR + n)));
}

/** Fichiers vidéo présents sur le disque mais absents de la base (nettoyage). */
export async function listVideoFiles(): Promise<string[]> {
  await ensureDirs();
  const names = await FileSystem.readDirectoryAsync(VIDEOS_DIR);
  return names.filter((n) => !n.endsWith('.part')).map((n) => VIDEOS_DIR + n);
}

export { FileSystem };
