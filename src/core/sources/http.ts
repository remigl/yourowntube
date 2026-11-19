import { AppError } from '../errors';

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string>; method?: string; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface HttpOptions {
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

const DEFAULT_TIMEOUT = 15_000;

/** GET JSON avec délai d'expiration et erreurs typées. */
export function getJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<T> {
  return requestJson<T>(url, {}, opts);
}

/** POST d'un corps JSON, réponse JSON. */
export function postJson<T = unknown>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  opts: HttpOptions = {},
): Promise<T> {
  return requestJson<T>(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } }, opts);
}

async function requestJson<T>(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> },
  opts: HttpOptions,
): Promise<T> {
  const f: FetchLike = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await f(url, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...init.headers } });
  } catch (e) {
    if (controller.signal.aborted) throw new AppError('timeout', 'Le serveur met trop de temps à répondre.');
    throw new AppError('network', 'Impossible de joindre le serveur. Vérifiez votre connexion ou l’instance configurée.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    if (res.status === 403 && /quota/i.test(body)) {
      throw new AppError('quota', 'Quota de l’API YouTube épuisé pour aujourd’hui.', 403);
    }
    if (res.status === 400 && /API key/i.test(body)) {
      throw new AppError('not_configured', 'Clé API YouTube invalide.', 400);
    }
    if (res.status === 404) throw new AppError('not_found', 'Contenu introuvable.', 404);
    if (res.status === 403 || res.status === 401) {
      if (/youtube\.com\/youtubei/.test(url)) {
        throw new AppError('blocked', 'YouTube refuse la requête depuis ce réseau. Réessayez plus tard ou depuis une autre connexion.', res.status);
      }
      if (/googleapis\.com/.test(url)) {
        throw new AppError(
          'not_configured',
          'Clé API YouTube refusée : vérifiez que l’API YouTube Data v3 est activée et que la clé n’est pas restreinte.',
          res.status,
        );
      }
      throw new AppError(
        'blocked',
        'Cette instance refuse l’accès aux applications (protection anti-robots ou API désactivée). Essayez une autre instance ou Piped.',
        res.status,
      );
    }
    if (res.status === 429) {
      throw new AppError('blocked', 'Trop de requêtes : l’instance limite l’accès. Réessayez plus tard ou changez d’instance.', 429);
    }
    throw new AppError('http', `Le serveur a répondu avec une erreur (${res.status}).`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new AppError('parse', 'Réponse du serveur illisible.');
  }
}

/** Construit une URL avec paramètres de requête (valeurs vides ignorées). */
export function buildUrl(base: string, path: string, params: Record<string, string | number | undefined> = {}): string {
  const root = base.replace(/\/+$/, '');
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${root}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`;
}

/** Rend absolue une URL éventuellement relative à l'instance. */
export function absolutize(base: string, url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${base.replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function normalizeInstance(url: string): string {
  let u = url.trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

/** Décode les entités HTML renvoyées par l'API YouTube (&#39;, &amp;…). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
