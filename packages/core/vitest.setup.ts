import { beforeEach, vi } from 'vitest';
import { fakeAdapterSet } from '@dsh-workbench/shared/testing';

type Set = ReturnType<typeof fakeAdapterSet>;

let fallback = fakeAdapterSet() as unknown as Set;

beforeEach(() => {
  fallback = fakeAdapterSet() as unknown as Set;
});

function withFallback(got: Set): Set {
  const merged = { ...fallback, ...got } as Record<string, unknown>;
  for (const key of ['supply', 'modules', 'profile', 'probe', 'runtime', 'plugins', 'actions', 'data']) {
    if (merged[key] === undefined) merged[key] = (fallback as unknown as Record<string, unknown>)[key];
  }
  const partial = got as unknown as Record<string, unknown>;
  if (partial['supply'] === undefined && partial['modules'] !== undefined) {
    merged['supply'] = { ...fallback.supply, ...(partial['modules'] as object) };
  } else if (partial['supply'] !== undefined && partial['modules'] === undefined) {
    merged['modules'] = fallback.modules;
  }
  return merged as unknown as Set;
}

vi.mock('@dsh-workbench/shared/host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dsh-workbench/shared/host')>();
  const provided = (ctx?: { get?: (key: string, optional?: boolean) => unknown }): Set => {
    const got = (() => {
      try {
        return ctx?.get?.('workbenchAdapters', false) as Set | undefined;
      } catch {
        return undefined;
      }
    })();
    if (got === undefined) return fallback;
    return withFallback(got);
  };
  const supply = (ctx?: { get?: (key: string, optional?: boolean) => unknown }) => {
    const adapters = provided(ctx) as unknown as { supply: Set['supply']; modules: Set['modules'] };
    return { ...adapters.modules, ...adapters.supply, env: adapters.supply, modules: adapters.modules };
  };
  return {
    ...actual,
    adaptersOf: (ctx?: never) => provided(ctx),
    supplyPortOf: (ctx?: never) => supply(ctx),
    profilePortOf: (ctx?: never) => (provided(ctx) as unknown as { profile: unknown }).profile,
    cliCommandOf: (ctx?: { get?: (key: string, optional?: boolean) => unknown }) => {
      const runtime = (provided(ctx) as unknown as { runtime: { commandSurface?: (c?: unknown) => { name?: string } | undefined } }).runtime;
      return runtime.commandSurface?.(ctx)?.name ?? 'runtime';
    },
    requireSupply: (ctx?: never) => supply(ctx),
  };
});
