import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ADAPTERS, createAdapterSet, createSupplyPort } from './index.js';

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('adapters-default', () => {
  it('defaults to the six host adapters', () => {
    expect(DEFAULT_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'opencli',
      'browser',
      'supply',
      'profile',
      'probe',
      'data',
    ]);
  });
});

describe('supply port', () => {
  it('only exposes the port members, not the whole adapters-default namespace', () => {
    const supply = createSupplyPort();
    expect('profileModules' in supply).toBe(true);
    expect('startSelfUpdate' in supply).toBe(true);
    expect('createDataReader' in supply).toBe(false);
    expect('createOpencli' in supply).toBe(false);
    expect('probeUnits' in supply).toBe(false);
    expect('DEFAULT_ADAPTERS' in supply).toBe(false);
  });
});

describe('默认适配器集合', () => {
  it('createAdapterSet 就是 AdapterSet 的一份完整实现', () => {
    const set = createAdapterSet({ get: () => undefined } as never);
    expect(set.apiVersion).toBe(1);
    expect(set.supply).toBe(set.modules);
    expect(typeof set.probe.probeUnits).toBe('function');
    expect(typeof set.runtime.seed).toBe('function');
    expect(typeof set.plugins.createUnits).toBe('function');
    expect(typeof set.actions.configSyncHandler).toBe('function');
  });

  it('工厂不写 root：seed 由宿主 apply 调一次', () => {
    const home = mkdtempSync(join(tmpdir(), 'wb-default-set-'));
    dirs.push(home);
    vi.stubEnv('DSH_HOME', home);
    createAdapterSet({ get: () => undefined } as never);
    expect(readdirSync(home)).toEqual([]);
  });
});
