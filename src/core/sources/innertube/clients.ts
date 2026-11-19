/**
 * Identités de client Innertube (l'API interne utilisée par les applications
 * YouTube elles-mêmes, comme le font NewPipe, Grayjay ou yt-dlp).
 *
 * - WEB : recherche, page vidéo (« next »), chaînes — réponses riches.
 * - Pour « player » (les flux), on essaie dans l'ordre des clients qui
 *   renvoient des URL directement lisibles sans jeton de preuve (PO token).
 *
 * YouTube retire régulièrement des clients ou refuse les versions anciennes.
 * Si la lecture casse (erreurs 403), c'est ici qu'il faut mettre à jour :
 * les valeurs de référence sont dans INNERTUBE_CLIENTS de yt-dlp
 * (yt_dlp/extractor/youtube/_base.py).
 */

export interface InnertubeClient {
  /** Identifiant numérique (en-tête X-YouTube-Client-Name). */
  id: number;
  context: Record<string, string | number>;
  userAgent: string;
  /**
   * Les URL directes de ce client exigent un PO token (coupure en 403 après
   * quelques secondes) : on n'en garde que le HLS, qui n'en demande pas.
   */
  directUrlsNeedPoToken?: boolean;
}

export const WEB: InnertubeClient = {
  id: 1,
  context: {
    clientName: 'WEB',
    clientVersion: '2.20251105.01.00',
  },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36,gzip(gfe)',
};

/** App YouTube d'Apple Vision Pro : URL directes, anonymes, sans PO token (client par défaut de yt-dlp depuis août 2026). */
export const VISIONOS: InnertubeClient = {
  id: 101,
  context: {
    clientName: 'VISIONOS',
    clientVersion: '1.02',
    deviceMake: 'Apple',
    deviceModel: 'RealityDevice17,1',
    osName: 'visionOS',
    osVersion: '26.5.23O471',
  },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

export const ANDROID_VR: InnertubeClient = {
  id: 28,
  context: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.62.27',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    androidSdkVersion: 32,
    osName: 'Android',
    osVersion: '12L',
  },
  userAgent:
    'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
};

/** Client Android sans `androidSdkVersion` : n'exige pas de PO token (souvent limité au 360p). */
export const ANDROID_SDKLESS: InnertubeClient = {
  id: 3,
  context: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    osName: 'Android',
    osVersion: '11',
  },
  userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
};

export const IOS: InnertubeClient = {
  id: 5,
  context: {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    osName: 'iPhone',
    osVersion: '18.3.2.22D82',
  },
  userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
  directUrlsNeedPoToken: true,
};

/** Ordre d'essai pour obtenir les flux d'une vidéo. */
export const PLAYER_CLIENTS: InnertubeClient[] = [VISIONOS, ANDROID_VR, ANDROID_SDKLESS, IOS];
