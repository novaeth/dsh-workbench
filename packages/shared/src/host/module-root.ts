import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageRootOf(moduleUrl: string): string {
  return dirname(dirname(dirname(fileURLToPath(moduleUrl))));
}
