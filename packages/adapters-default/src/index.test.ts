import { describe, expect, it } from 'vitest';
import { DEFAULT_ADAPTERS, createSupplyPort } from './index.js';

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
