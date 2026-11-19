/**
 * Identités de client Innertube (l'API interne utilisée par les applications
 * YouTube elles-mêmes, comme le font NewPipe, Grayjay ou yt-dlp).
 *
 * - WEB : recherche, page vidéo (« next »), chaînes — réponses riches.
 * - ANDROID_VR puis IOS : « player », qui renvoie des URL de flux directement
 *   lisibles, sans exécuter le JavaScript du lecteur web.
 *
 * YouTube finit par refuser les versions trop anciennes : si la lecture casse
 * du jour au lendemain, mettre à jour `clientVersion` / `userAgent` ici.
 */

export interface InnertubeClient {
  /** Identifiant numérique (en-tête X-YouTube-Client-Name). */
  id: number;
  context: Record<string, string | number>;
  userAgent: string;
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
};

/** Ordre d'essai pour obtenir les flux d'une vidéo. */
export const PLAYER_CLIENTS: InnertubeClient[] = [ANDROID_VR, IOS];
