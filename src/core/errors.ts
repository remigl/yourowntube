export type AppErrorCode =
  | 'offline'
  | 'timeout'
  | 'network'
  | 'http'
  | 'not_configured'
  | 'quota'
  | 'not_found'
  | 'blocked_short'
  | 'no_stream'
  | 'parse'
  | 'storage'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;

  constructor(code: AppErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

/** Message lisible en français pour n'importe quelle erreur. */
export function describeError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Une erreur inattendue est survenue.';
}

export function errorCode(err: unknown): AppErrorCode {
  return err instanceof AppError ? err.code : 'unknown';
}
