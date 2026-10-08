import { lazy, type ComponentType } from "react";

const CHUNK_RELOAD_KEY = 'verdio_chunk_reload';
export function lazyWithReload<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const loaded = await loader();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return loaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const staleDeploymentChunk = /failed to fetch dynamically imported module|importing a module script failed|loading chunk [\d]+ failed/i.test(message);
      if (staleDeploymentChunk && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return new Promise<{ default: T }>(() => undefined);
      }
      throw error;
    }
  });
}

export const ChartRenderer = lazyWithReload(() => import("../ChartRenderer").then(m => ({ default: m.ChartRenderer })));
