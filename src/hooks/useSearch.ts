import { useCallback, useEffect, useRef, useState } from 'react';

import { AppError, describeError, errorCode, type AppErrorCode } from '../core/errors';
import { applyFilters } from '../core/filters';
import { excludeShorts, type ShortsPolicy } from '../core/shorts';
import type { VideoSource } from '../core/sources/types';
import type { SearchFilters, VideoSummary } from '../core/types';

interface SearchState {
  items: VideoSummary[];
  loading: boolean;
  loadingMore: boolean;
  error: { message: string; code: AppErrorCode } | null;
  hasMore: boolean;
  /** Nombre de Shorts écartés (affiché discrètement). */
  hiddenShorts: number;
}

const INITIAL: SearchState = { items: [], loading: false, loadingMore: false, error: null, hasMore: false, hiddenShorts: 0 };

/** Pages successives tentées si une page ne contenait que des Shorts. */
const MAX_EMPTY_SKIPS = 3;

/**
 * Recherche paginée : exclusion des Shorts, filtres client, dédoublonnage
 * entre pages et annulation des réponses obsolètes.
 */
export function useSearch(
  source: VideoSource | null,
  query: string,
  filters: SearchFilters,
  policy: ShortsPolicy,
  online: boolean,
) {
  const [state, setState] = useState<SearchState>(INITIAL);
  const nextPage = useRef<string | undefined>(undefined);
  const seq = useRef(0);
  const busy = useRef(false);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (!query.trim()) {
        setState(INITIAL);
        return;
      }
      if (!source) return;
      if (!online) {
        setState((s) => ({ ...s, loading: false, loadingMore: false, error: { code: 'offline', message: 'Vous êtes hors ligne. Vos vidéos téléchargées restent disponibles.' } }));
        return;
      }
      if (!reset && (busy.current || !nextPage.current)) return;
      const id = ++seq.current;
      busy.current = true;
      setState((s) => (reset ? { ...INITIAL, loading: true } : { ...s, loadingMore: true, error: null }));
      try {
        let page = reset ? undefined : nextPage.current;
        let collected: VideoSummary[] = [];
        let hidden = 0;
        for (let attempt = 0; attempt <= MAX_EMPTY_SKIPS; attempt++) {
          const res = await source.search(query.trim(), filters, page);
          const kept = applyFilters(excludeShorts(res.items, policy), filters);
          hidden += res.items.length - excludeShorts(res.items, policy).length;
          collected = kept;
          page = res.nextPage;
          if (kept.length > 0 || !page) break;
        }
        if (id !== seq.current) return;
        nextPage.current = page;
        setState((s) => {
          const base = reset ? [] : s.items;
          const known = new Set(base.map((v) => v.id));
          return {
            items: [...base, ...collected.filter((v) => !known.has(v.id))],
            loading: false,
            loadingMore: false,
            error: null,
            hasMore: !!page,
            hiddenShorts: (reset ? 0 : s.hiddenShorts) + hidden,
          };
        });
      } catch (e) {
        if (id !== seq.current) return;
        setState((s) => ({
          ...s,
          loading: false,
          loadingMore: false,
          error: { message: describeError(e), code: e instanceof AppError ? e.code : errorCode(e) },
        }));
      } finally {
        if (id === seq.current) busy.current = false;
      }
    },
    [source, query, filters, policy, online],
  );

  useEffect(() => {
    nextPage.current = undefined;
    busy.current = false;
    void fetchPage(true);
    // `online` est volontairement exclu : on ne relance pas toute la recherche à chaque micro-coupure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, query, filters, policy]);

  return {
    ...state,
    loadMore: () => void fetchPage(false),
    refresh: () => void fetchPage(true),
  };
}
