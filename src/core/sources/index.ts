import { AppError } from '../errors';
import type { AppSettings } from '../settings';
import { DemoSource } from './demo';
import type { HttpOptions } from './http';
import { InvidiousSource } from './invidious';
import { PipedSource } from './piped';
import type { StreamProvider, VideoSource } from './types';
import { YouTubeDataSource } from './youtube';

export type { VideoSource, StreamProvider } from './types';
export { DemoSource, InvidiousSource, PipedSource, YouTubeDataSource };

/**
 * Construit la source active à partir des réglages. Lève `not_configured`
 * avec un message explicite si un champ obligatoire manque.
 */
export function createSource(s: AppSettings, http: HttpOptions = {}): VideoSource {
  switch (s.source) {
    case 'demo':
      return new DemoSource();
    case 'invidious':
      return new InvidiousSource(s.invidiousInstance, http);
    case 'piped':
      return new PipedSource(s.pipedInstance, http);
    case 'youtube': {
      let streams: StreamProvider | null = null;
      try {
        streams =
          s.youtubeStreamProvider === 'piped'
            ? new PipedSource(s.pipedInstance, http)
            : new InvidiousSource(s.invidiousInstance, http);
      } catch {
        streams = null; // recherche possible, lecture impossible : message clair au moment de lire
      }
      return new YouTubeDataSource(s.youtubeApiKey.trim(), streams, http);
    }
    default:
      throw new AppError('not_configured', 'Source inconnue.');
  }
}
