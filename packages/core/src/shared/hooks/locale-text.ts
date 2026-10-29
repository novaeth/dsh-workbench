import type { RuntimeText } from '@dsh-workbench/shared';
import { resolveRuntimeText } from '@dsh-workbench/shared';

let resolver: ((text: RuntimeText) => string) | undefined;

export function setRuntimeTextResolver(next?: (text: RuntimeText) => string): void {
  resolver = next;
}

export function runtimeText(text: RuntimeText): string {
  return resolveRuntimeText(text, resolver);
}
