import type { PreflightSnapshot } from '@dsh-workbench/shared/host';

export function createForcePlan(): {
  next(): { hard?: 1; only?: string };
  again(only?: string | undefined): void;
} {
  let asked: string | undefined;
  let hard = false;
  return {
    next() {
      const query = hard ? { hard: 1 as const } : asked === undefined ? {} : { only: asked };
      hard = false;
      asked = undefined;
      return query;
    },
    again(only?: string | undefined) {
      if (only === undefined) hard = true;
      else asked = only;
    },
  };
}

export function retryTargetOf(snapshot: PreflightSnapshot | null): string | undefined {
  if (snapshot === null) return undefined;
  if ((snapshot.bridgeIssues?.length ?? 0) > 0) return 'bridge';
  if (snapshot.diyGap !== undefined) return 'diy';
  return snapshot.steps.find((item) => item.status === 'failed')?.id;
}
