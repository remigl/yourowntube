/** Mini bus d'événements typé, sans dépendance. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    const set = (this.handlers[event] ??= new Set());
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K] extends void ? [] : [Events[K]]): void {
    const payload = args[0] as Events[K];
    this.handlers[event]?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.warn('[emitter]', String(event), e);
      }
    });
  }
}

/** Sujets de données modifiables : les écrans se rafraîchissent quand ils changent. */
export type DataTopic = 'history' | 'searches' | 'downloads' | 'videos' | 'settings';

export const dataEvents = new Emitter<Record<DataTopic, void> & { progress: { videoId: string; ratio: number } }>();
