import { useNetworkState } from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AppError, describeError } from '../core/errors';
import { coerceSetting, DEFAULT_SETTINGS, type AppSettings } from '../core/settings';
import type { ShortsPolicy } from '../core/shorts';
import { createSource, type VideoSource } from '../core/sources';
import { getDb } from '../db/database';
import { loadSettingRows, saveSettingRows } from '../db/repo';
import { downloads } from '../services/downloads';

const API_KEY_ITEM = 'yourowntube.youtubeApiKey';

interface AppState {
  ready: boolean;
  initError: string | null;
  retryInit: () => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Source active, ou null si mal configurée (voir sourceError). */
  source: VideoSource | null;
  sourceError: AppError | null;
  online: boolean;
  shortsPolicy: ShortsPolicy;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const net = useNetworkState();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setInitError(null);
        await getDb();
        const rows = await loadSettingRows();
        const loaded: AppSettings = { ...DEFAULT_SETTINGS };
        for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
          if (key !== 'youtubeApiKey' && rows[key] !== undefined) {
            (loaded as unknown as Record<string, unknown>)[key] = coerceSetting(key, rows[key]);
          }
        }
        loaded.youtubeApiKey = (await SecureStore.getItemAsync(API_KEY_ITEM).catch(() => null)) ?? '';
        if (!alive) return;
        setSettings(loaded);
        setReady(true);
        // Nettoyage des téléchargements interrompus, sans bloquer l'ouverture.
        downloads.recover().catch((e) => console.warn('[downloads] recover', e));
      } catch (e) {
        if (alive) setInitError(describeError(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    const { youtubeApiKey, ...rest } = patch;
    if (youtubeApiKey !== undefined) {
      if (youtubeApiKey) await SecureStore.setItemAsync(API_KEY_ITEM, youtubeApiKey);
      else await SecureStore.deleteItemAsync(API_KEY_ITEM);
    }
    const rows = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v)]));
    if (Object.keys(rows).length > 0) await saveSettingRows(rows);
  }, []);

  const { source, sourceError } = useMemo(() => {
    try {
      return { source: createSource(settings), sourceError: null };
    } catch (e) {
      return {
        source: null,
        sourceError: e instanceof AppError ? e : new AppError('not_configured', describeError(e)),
      };
    }
    // Ne reconstruire la source que si un réglage qui la concerne change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.source, settings.invidiousInstance, settings.pipedInstance, settings.youtubeApiKey, settings.youtubeStreamProvider]);

  // Tant que l'état réseau est inconnu, on suppose être en ligne.
  const online = net.isConnected !== false && net.isInternetReachable !== false;

  const shortsPolicy = useMemo(() => ({ thresholdSec: settings.shortsThresholdSec }), [settings.shortsThresholdSec]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      initError,
      retryInit: () => setAttempt((n) => n + 1),
      settings,
      updateSettings,
      source,
      sourceError,
      online,
      shortsPolicy,
    }),
    [ready, initError, settings, updateSettings, source, sourceError, online, shortsPolicy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp doit être utilisé dans <AppProvider>');
  return v;
}
