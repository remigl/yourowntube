import { useEffect, useState } from 'react';

import { getDownload, type DownloadEntry } from '../db/repo';
import { dataEvents } from '../lib/emitter';
import { downloads } from '../services/downloads';

/** État du téléchargement d'une vidéo, avec la progression en direct. */
export function useDownloadState(videoId: string | undefined) {
  const [entry, setEntry] = useState<DownloadEntry | null>(null);
  const [progress, setProgress] = useState<number | undefined>(videoId ? downloads.progressOf(videoId) : undefined);

  useEffect(() => {
    if (!videoId) return;
    let alive = true;
    const load = () =>
      getDownload(videoId)
        .then((e) => {
          if (!alive) return;
          setEntry(e);
          setProgress(downloads.progressOf(videoId));
        })
        .catch(() => undefined);
    load();
    const off1 = dataEvents.on('downloads', load);
    const off2 = dataEvents.on('progress', (p) => {
      if (p.videoId === videoId) setProgress(p.ratio);
    });
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [videoId]);

  const active = !!videoId && (downloads.isActive(videoId) || entry?.status === 'downloading');
  return { entry, progress: progress ?? entry?.progress ?? 0, active };
}
