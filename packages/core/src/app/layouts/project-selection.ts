import { STORAGE_KEY_PROJECT } from '@dsh-workbench/shared';
import { readText, writeText } from '@dsh-workbench/shared';

const listeners = new Set<() => void>();

export function selectedProjectId(): string | null {
  const stored = readText(STORAGE_KEY_PROJECT);
  return stored === '' ? null : stored;
}

export function selectProject(workspaceId: string): void {
  writeText(STORAGE_KEY_PROJECT, workspaceId);
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
    }
  }
}

export function subscribeProject(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
