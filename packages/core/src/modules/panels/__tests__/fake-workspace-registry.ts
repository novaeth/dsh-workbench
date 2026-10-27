import type { DshWorkspaceRecord, DshWorkspaceRegistry } from '@dsh-workbench/shared';

export function fakeWorkspaceRegistry(...records: readonly DshWorkspaceRecord[]): DshWorkspaceRegistry {
  return {
    get: () => undefined,
    create: async () => undefined,
    resolveByPath: async (dir: string) => records.find((record) => record.path === dir),
  };
}

export function fakeWorkspace(path: string, title = '工坊'): DshWorkspaceRecord {
  return { id: path, path, title };
}
