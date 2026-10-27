import type { LibNeed } from './needs.js';

export interface LibReader {
  load<T = unknown>(need: LibNeed, entry: string): Promise<T>;
}
