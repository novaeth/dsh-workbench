import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupplyPort } from '@dsh-workbench/shared/host';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import { swapExternally } from './market-swap-stuck';

const PKG = '@a/mod';

function rig(input: {
  readonly after: InstalledModule;
  readonly state?: string;
  readonly throws?: boolean;
}) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-swap-'));
  const marker = join(dir, 'self-update.json');
  const supply = {
    startSelfUpdate: () => {
      if (input.throws === true) throw new Error('spawn 失败');
      if (input.state !== undefined) {
        writeFileSync(marker, JSON.stringify({ pkg: PKG, state: input.state, version: '0.1.1' }));
      }
      return { started: true, paths: { dir, script: '', marker, log: '' }, forward: '' };
    },
  } as unknown as Pick<SupplyPort, 'startSelfUpdate'>;
  return { dir, marker, supply };
}

const base = {
  dshHome: '/tmp/home',
  profile: 'workbench',
  pollMs: 1,
  waitMs: 200,
};

describe('swapExternally：进程内换不掉时，从外部进程换一份', () => {
  it('★ 外部换成了 → 回盘上那一份（调用方据此回 restart-required）', async () => {
    const { supply } = rig({ after: { kind: 'module', pkg: PKG, unit: 'mod', version: '0.1.1' }, state: 'ok' });
    const installed = (): InstalledModule => ({ kind: 'module', pkg: PKG, unit: 'mod', version: '0.1.1' });
    const after = await swapExternally({ ...base, supply, installed }, { pkg: PKG, from: '0.1.0', to: '0.1.1', pinned: true });
    expect(after).toMatchObject({ kind: 'module', version: '0.1.1' });
  });

  it('★ 盘上还是旧的（或读不到）→ 不给成功，调用方回落成失败 + 命令', async () => {
    const { supply } = rig({ after: { kind: 'unknown', pkg: PKG }, state: 'failed' });
    const installed = (): InstalledModule => ({ kind: 'unknown', pkg: PKG });
    const after = await swapExternally({ ...base, supply, installed }, { pkg: PKG, from: '0.1.0', to: '0.1.1', pinned: true });
    expect(after).toBeUndefined();
  });

  it('★ 外部那一步起不来（spawn 抛错）→ 吃掉错误，回 undefined', async () => {
    const { supply } = rig({ after: { kind: 'module', pkg: PKG, unit: 'mod', version: '0.1.1' }, throws: true });
    const installed = (): InstalledModule => ({ kind: 'module', pkg: PKG, unit: 'mod', version: '0.1.1' });
    const after = await swapExternally({ ...base, supply, installed }, { pkg: PKG, from: '0.1.0', to: '0.1.1', pinned: true });
    expect(after).toBeUndefined();
  });
});
