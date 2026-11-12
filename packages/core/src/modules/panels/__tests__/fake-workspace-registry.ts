import type { DshWorkspaceRecord, DshWorkspaceRegistry } from '@dsh-workbench/shared/host';

export function fakeWorkspaceRegistry(...records: readonly DshWorkspaceRecord[]): DshWorkspaceRegistry {
  const registry = {
    create: async () => undefined,
    resolveByPath: async (dir: string) => records.find((record) => record.path === dir),
  };
  return registry as unknown as DshWorkspaceRegistry;
}

export function fakeWorkspace(path: string, title = '工坊'): DshWorkspaceRecord {
  return { id: path, path, title } as unknown as DshWorkspaceRecord;
}
