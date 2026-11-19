import { useCallback, useEffect, useRef, useState } from 'react';

import { describeError } from '../core/errors';
import { dataEvents, type DataTopic } from '../lib/emitter';

/**
 * Exécute une requête locale et la relance quand l'un des sujets change
 * (historique, téléchargements…). Les données restent affichées pendant
 * le rafraîchissement pour éviter les clignotements.
 */
export function useLiveQuery<T>(
  query: () => Promise<T>,
  topics: DataTopic[],
  deps: unknown[] = [],
): { data: T | undefined; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  const reload = useCallback(() => {
    const id = ++seq.current;
    queryRef
      .current()
      .then((d) => {
        if (id !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (id === seq.current) setError(describeError(e));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
    const offs = topics.map((t) => dataEvents.on(t, reload));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, topics.join(','), ...deps]);

  return { data, loading, error, reload };
}
