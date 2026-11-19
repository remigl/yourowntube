import { AppError, describeError } from '../core/errors';
import { pickDownloadStream } from '../core/sources/streams';
import type { VideoSource } from '../core/sources/types';
import { thumbnailCandidates } from '../core/thumbnails';
import type { VideoSummary } from '../core/types';
import {
  deleteDownloadRows,
  getDownload,
  listDownloads,
  saveDownload,
  upsertVideo,
  type DownloadEntry,
} from '../db/repo';
import { dataEvents } from '../lib/emitter';
import {
  cleanPartialFiles,
  deleteFile,
  ensureDirs,
  extensionFor,
  fileExists,
  fileSize,
  FileSystem,
  listVideoFiles,
  safeName,
  THUMBS_DIR,
  VIDEOS_DIR,
} from './files';

interface ActiveDownload {
  resumable: FileSystem.DownloadResumable | null;
  ratio: number;
  cancelled: boolean;
  partUri?: string;
}

/**
 * Gestionnaire de téléchargements : un fichier par vidéo, écrit d'abord en
 * `.part` puis renommé une fois complet, pour ne jamais lire un fichier tronqué.
 */
class DownloadManager {
  private active = new Map<string, ActiveDownload>();

  /** Progression en mémoire (0–1) d'un téléchargement en cours. */
  progressOf(videoId: string): number | undefined {
    return this.active.get(videoId)?.ratio;
  }

  isActive(videoId: string): boolean {
    return this.active.has(videoId);
  }

  async start(video: VideoSummary, source: VideoSource, maxHeight: number): Promise<void> {
    if (this.active.has(video.id)) return;
    const job: ActiveDownload = { resumable: null, ratio: 0, cancelled: false };
    this.active.set(video.id, job);
    try {
      await ensureDirs();
      await upsertVideo(video, source.kind);
      await saveDownload(video.id, { status: 'downloading', progress: 0, error: null });

      const info = await source.getPlayback(video.id);
      const stream = pickDownloadStream(info.downloadable, maxHeight);
      if (!stream) {
        throw new AppError('no_stream', 'Aucun fichier téléchargeable n’est proposé pour cette vidéo par cette source.');
      }
      if (job.cancelled) return;

      const finalUri = `${VIDEOS_DIR}${safeName(video.id)}.${extensionFor(stream.mimeType)}`;
      const partUri = `${finalUri}.part`;
      job.partUri = partUri;
      let lastWrite = 0;

      job.resumable = FileSystem.createDownloadResumable(stream.url, partUri, { headers: stream.headers }, (p) => {
        const expected = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : (stream.sizeBytes ?? 0);
        const ratio = expected > 0 ? Math.min(1, p.totalBytesWritten / expected) : 0;
        job.ratio = ratio;
        dataEvents.emit('progress', { videoId: video.id, ratio });
        const now = Date.now();
        if (now - lastWrite > 2000) {
          lastWrite = now;
          void saveDownload(video.id, { progress: ratio }, false);
        }
      });

      const result = await job.resumable.downloadAsync();
      if (job.cancelled || !result) return;
      if (result.status < 200 || result.status >= 300) {
        throw new AppError('http', `Le serveur a refusé le téléchargement (${result.status}).`, result.status);
      }

      await deleteFile(finalUri);
      await FileSystem.moveAsync({ from: partUri, to: finalUri });
      const size = await fileSize(finalUri);
      if (size === 0) throw new AppError('storage', 'Le fichier téléchargé est vide.');

      const thumbUri = await this.saveThumbnail(video);
      await saveDownload(video.id, {
        status: 'done',
        fileUri: finalUri,
        thumbUri,
        sizeBytes: size,
        quality: stream.quality,
        mimeType: stream.mimeType,
        progress: 1,
        error: null,
        completedAt: Date.now(),
      });
    } catch (e) {
      if (job.cancelled) return;
      await deleteFile(job.partUri);
      await saveDownload(video.id, { status: 'error', error: describeError(e), progress: 0 });
    } finally {
      this.active.delete(video.id);
      dataEvents.emit('downloads');
    }
  }

  /** Annule un téléchargement en cours et oublie l'entrée. */
  async cancel(videoId: string): Promise<void> {
    const job = this.active.get(videoId);
    if (job) {
      job.cancelled = true;
      try {
        await job.resumable?.cancelAsync();
      } catch {
        /* déjà terminé */
      }
      await deleteFile(job.partUri);
      this.active.delete(videoId);
    }
    await deleteDownloadRows([videoId]);
  }

  /** Supprime une ou plusieurs vidéos téléchargées (fichier + miniature + entrée). */
  async remove(videoIds: string[]): Promise<void> {
    const entries = await Promise.all(videoIds.map((id) => getDownload(id)));
    for (const id of videoIds) if (this.active.has(id)) await this.cancel(id);
    await Promise.all(
      entries.flatMap((e) => (e ? [deleteFile(e.fileUri), deleteFile(e.thumbUri)] : [])),
    );
    await deleteDownloadRows(videoIds);
  }

  /**
   * Fichier local prêt à lire, ou null. Si le fichier a disparu du disque,
   * l'entrée est nettoyée pour que l'interface reste juste.
   */
  async localFileFor(videoId: string): Promise<DownloadEntry | null> {
    const entry = await getDownload(videoId);
    if (!entry || entry.status !== 'done') return null;
    if (await fileExists(entry.fileUri)) return entry;
    await deleteDownloadRows([videoId]);
    return null;
  }

  /** Au démarrage : les téléchargements coupés par la fermeture de l'app passent en erreur. */
  async recover(): Promise<void> {
    await cleanPartialFiles();
    const all = await listDownloads();
    for (const d of all) {
      if (d.status === 'downloading' && !this.active.has(d.video.id)) {
        await saveDownload(d.video.id, { status: 'error', error: 'Téléchargement interrompu.', progress: 0 }, false);
      }
      if (d.status === 'done' && !(await fileExists(d.fileUri))) {
        await deleteDownloadRows([d.video.id]);
      }
    }
    // Fichiers orphelins (entrée supprimée mais fichier resté) : on libère la place.
    const known = new Set(all.map((d) => d.fileUri).filter(Boolean));
    for (const uri of await listVideoFiles()) if (!known.has(uri)) await deleteFile(uri);
    dataEvents.emit('downloads');
  }

  private async saveThumbnail(video: VideoSummary): Promise<string | null> {
    const target = `${THUMBS_DIR}${safeName(video.id)}.jpg`;
    for (const url of thumbnailCandidates(video.id, video.thumbnail)) {
      try {
        const res = await FileSystem.downloadAsync(url, target);
        if (res.status >= 200 && res.status < 300 && (await fileSize(target)) > 2000) return target;
      } catch {
        /* candidat suivant */
      }
    }
    await deleteFile(target);
    return null;
  }
}

export const downloads = new DownloadManager();
