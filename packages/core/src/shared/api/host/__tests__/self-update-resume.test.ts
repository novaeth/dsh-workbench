import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import { resumeQueuedSelfUpdate } from '../self-update-resume';

const ctx = {} as DshHostContext;

describe('宿主起来时把上次排队那条接着排', () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const fresh = (): { root: string; marker: string; profileDir: string } => {
    const root = mkdtempSync(join(tmpdir(), 'wb-resume-'));
    roots.push(root);
    vi.stubEnv('DSH_HOME', root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    const profileDir = join(root, 'profiles', 'desktop');
    mkdirSync(profileDir, { recursive: true });
    return { root, marker: join(root, 'workbench', 'self-update.json'), profileDir };
  };
  const writer = (marker: string, body: Record<string, unknown>) => {
    mkdirSync(join(marker, '..'), { recursive: true });
    writeFileSync(marker, JSON.stringify(body), 'utf8');
  };
  const supplyWith = (seen: SelfUpdateRequest[], started = true) => ({
    startSelfUpdate: (request: SelfUpdateRequest) => {
      seen.push(request);
      return { started, paths: { dir: '', planFile: '', marker: '', log: '', versionsDir: '' }, forward: '' };
    },
  });

  it('★ 上次排着队但脚本没了（pid 已死）→ 重新起一个，参数照 marker 回填', () => {
    const { root, marker, profileDir } = fresh();
    writer(marker, { pkg: '@dsh-workbench/core', state: 'queued', from: '1.2.2', to: '1.2.3', pid: 999_999 });
    const seen: SelfUpdateRequest[] = [];

    const started = resumeQueuedSelfUpdate(ctx, { supply: supplyWith(seen), home: root, profileDir });

    expect(started).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      dshHome: root,
      profile: 'desktop',
      pkg: '@dsh-workbench/core',
      from: '1.2.2',
      to: '1.2.3',
    });
  });

  it('★ 脚本还活着 → 适配器那边就拒了（busy 由它一处说了算），我们如实回 false', () => {
    const { root, marker, profileDir } = fresh();
    writer(marker, { pkg: '@dsh-workbench/core', state: 'queued', from: '1.2.2', to: '1.2.3', pid: process.pid });
    const seen: SelfUpdateRequest[] = [];

    expect(resumeQueuedSelfUpdate(ctx, { supply: supplyWith(seen, false), home: root, profileDir })).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it('★ 不是 queued（已装好 / 已还原 / 没有 marker）→ 都不动', () => {
    const { root, marker, profileDir } = fresh();
    const seen: SelfUpdateRequest[] = [];
    const supply = supplyWith(seen);

    expect(resumeQueuedSelfUpdate(ctx, { supply, home: root, profileDir })).toBe(false);
    for (const state of ['ok', 'restored', 'failed', 'running']) {
      writer(marker, { pkg: '@dsh-workbench/core', state, from: '1.2.2', to: '1.2.3' });
      expect(resumeQueuedSelfUpdate(ctx, { supply, home: root, profileDir })).toBe(false);
    }
    expect(seen).toEqual([]);
  });

  it('★ 拿不到 profile 目录 → 不硬来', () => {
    const { root, marker } = fresh();
    writer(marker, { pkg: '@dsh-workbench/core', state: 'queued', pid: 999_999 });
    const seen: SelfUpdateRequest[] = [];

    expect(resumeQueuedSelfUpdate(ctx, { supply: supplyWith(seen), home: root, profileDir: null })).toBe(false);
    expect(seen).toEqual([]);
  });

  it('★ 适配器不肯起（返回 started:false）→ 如实回 false', () => {
    const { root, marker, profileDir } = fresh();
    writer(marker, { pkg: '@dsh-workbench/core', state: 'queued', pid: 999_999 });

    expect(
      resumeQueuedSelfUpdate(ctx, { supply: supplyWith([], false), home: root, profileDir }),
    ).toBe(false);
  });
});
