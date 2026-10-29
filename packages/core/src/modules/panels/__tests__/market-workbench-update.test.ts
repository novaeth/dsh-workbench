import { beforeEach, describe, expect, it } from 'vitest';
import { call, fakeBundles, harness } from './market-tools-harness';
import { updateWorkbenchOnce } from '../model/market-workbench-update';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { MODULES_UPDATE_WORKBENCH_TOOL } from '../unit';

beforeEach(() => {
});

describe('workbench_modules_update_workbench（工作台自己那一份）', () => {
  it('★ 工作台自己也能升，但换的是"自己站的这块地板"：交给外部执行器，回 restart-required', async () => {
    const h = harness({
      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
    });

    const payload = await call(h, MODULES_UPDATE_WORKBENCH_TOOL, {});

    expect(h.selfUpdates).toEqual([
      {
        dshHome: '/tmp/dsh-home',
        profile: 'workbench',
        pkg: '@dsh-workbench/core',
        from: '0.1.18',
        to: '',
        pinned: false,
      },
    ]);
    expect(payload.change).toMatchObject({ stage: 'install', target: '@dsh-workbench/core@latest' });
    expect((payload.change as { application?: string }).application).toBe('restart-required');
  });

  it('★ 这一跳永远是"要重启一次"：换的是自己这块地板，重启归用户', async () => {
    const h = harness({
      manifests: [],
      bundles: fakeBundles({
        install: async () => ({
          application: 'applied',
          stage: 'install',
          changed: true,
          target: '@dsh-workbench/core@latest',
          bundle: '@dsh-workbench/core',
        }),
      }),
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
    });

    const payload = await call(h, MODULES_UPDATE_WORKBENCH_TOOL, {});

    expect((payload.change as { application?: string }).application).toBe('restart-required');
    expect(String(payload.text)).toContain('要重启一次 dsh 才生效');
    expect(String(payload.text)).toContain('别自己重启');
  });

  it('★ 工作台那一行一条卸载都不发、管理器也不碰 —— 谁都不许把自己那一行摘掉', async () => {
    const did: string[] = [];
    const h = harness({
      manifests: [],
      bundles: fakeBundles({
        install: async (request) => {
          did.push(`install ${request.spec}`);
          return {
            application: 'failed',
            stage: 'install',
            changed: false,
            target: request.spec,
            errorCode: 'already-installed',
          };
        },
        remove: async (name) => {
          did.push(`remove ${name}`);
          return { application: 'applied', stage: 'remove', changed: true, target: name };
        },
      }),
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
    });

    const payload = await call(h, MODULES_UPDATE_WORKBENCH_TOOL, {});

    expect(did).toEqual([]);
    expect(h.selfUpdates).toHaveLength(1);
    expect((payload.change as { application?: string }).application).toBe('restart-required');
  });

  it('★ 拿不到 DSH_HOME 或 profile 名字 → 不硬来，给一句能照做的人话', async () => {
    const h = harness({
      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
      profileName: null,
    });

    await expect(call(h, MODULES_UPDATE_WORKBENCH_TOOL, {})).rejects.toThrow(/profile 名字/);
    expect(h.selfUpdates).toEqual([]);
  });

  it('★ 问到了源上的版本就装那一版（界面显示的那个版本，就是装下去的那个）', async () => {
    const h = harness({
      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18', registry: 'https://r.example/' }),
      npmLatest: '0.1.19',
    });

    const payload = await call(h, MODULES_UPDATE_WORKBENCH_TOOL, {});

    expect(h.fake.commands().some((line) => line.includes('npm view') && line.includes('https://r.example/'))).toBe(
      true,
    );
    expect(payload.change).toMatchObject({ target: '@dsh-workbench/core@0.1.19' });
    expect(h.selfUpdates).toEqual([
      {
        dshHome: '/tmp/dsh-home',
        profile: 'workbench',
        pkg: '@dsh-workbench/core',
        from: '0.1.18',
        to: '0.1.19',
        pinned: true,
      },
    ]);
  });

  it('★ 源上只铺开了外壳那一份 → 一个字符都不装，给一句能照做的人话', async () => {
    const tried: string[] = [];
    const h = harness({
      manifests: [],
      bundles: fakeBundles({
        install: async (request) => {
          tried.push(request.spec);
          return { application: 'applied', stage: 'install', changed: true, target: request.spec };
        },
      }),
      workbench: (pkg) => ({ pkg, version: '0.1.18', registry: 'https://r.example/' }),
      npmLatest: '0.1.19',
      npmMissing: ['@dsh-workbench/module-tools'],
    });

    const failed = await call(h, MODULES_UPDATE_WORKBENCH_TOOL, {}).catch((error: Error) => error.message);

    expect(tried).toEqual([]);
    expect(String(failed)).toContain('还没铺齐');
    expect(String(failed)).toContain('@dsh-workbench/module-tools');
    expect(String(failed)).toContain('重新检查');
  });

  it('★ 源码目录那份不给升：工具里也要说清"不从源上更新"，而不是装一个源上的版本盖掉它', async () => {
    const h = harness({
      manifests: [],
      bundles: fakeBundles(),
      workbench: (pkg) => ({ pkg, version: '0.1.18', local: true }),
    });

    await expect(call(h, MODULES_UPDATE_WORKBENCH_TOOL, {})).rejects.toThrow(/源码目录/);
  });
});

describe('updateWorkbenchOnce：外面那个进程收到的现场', () => {
  const recorder = (seen: SelfUpdateRequest[]) => (request: SelfUpdateRequest) => {
    seen.push(request);
    return { started: true, paths: { dir: '', script: '', marker: '', log: '' }, forward: '' };
  };

  it('★ 不是工作台那个包名 → 当场拒（这条路只服务自己那一份）', async () => {
    await expect(updateWorkbenchOnce({ asked: 'left-pad' })).rejects.toThrow(/只更新工作台自己那一份/);
  });

  it('★ profile 的 spec 里没写 registry → 拿兜底那个问（问到了就钉住那一版，不是 @latest）', async () => {
    const seen: SelfUpdateRequest[] = [];
    const outcome = await updateWorkbenchOnce({
      asked: '',
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
      installed: (pkg) => ({ kind: 'unknown', pkg }),
      shell: createFakeShell((call) =>
        call.command.includes('npm view') ? { stdout: '0.1.19\n' } : { stdout: '' },
      ).shell,
      profileRegistry: async () => 'https://r.example/',
      dshHome: () => '/tmp/dsh-home',
      profileName: () => 'workbench',
      selfUpdate: recorder(seen),
    });

    expect(seen[0]).toMatchObject({ to: '0.1.19', pinned: true });
    expect(outcome.change).toMatchObject({ target: '@dsh-workbench/core@0.1.19' });
  });

  it('★ 连兜底也拿不到 → 老老实实装 @latest（不许瞎猜一个版本）', async () => {
    const seen: SelfUpdateRequest[] = [];
    await updateWorkbenchOnce({
      asked: '',
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
      shell: createFakeShell(() => ({ stdout: '0.1.19\n' })).shell,
      profileRegistry: async () => undefined,
      dshHome: () => '/tmp/dsh-home',
      profileName: () => 'workbench',
      selfUpdate: recorder(seen),
    });

    expect(seen[0]).toMatchObject({ to: '', pinned: false });
  });

  it('★ 接到手上的现场：pkg / profile / from / to 一处都不许错', async () => {
    const seen: SelfUpdateRequest[] = [];
    const outcome = await updateWorkbenchOnce({
      asked: '',
      workbench: (pkg) => ({ pkg, version: '0.1.18' }),
      installed: (pkg) => ({ kind: 'unknown', pkg }),
      dshHome: () => '/tmp/dsh-home',
      profileName: () => 'workbench',
      selfUpdate: recorder(seen),
    });

    expect(seen).toEqual([
      {
        dshHome: '/tmp/dsh-home',
        profile: 'workbench',
        pkg: '@dsh-workbench/core',
        from: '0.1.18',
        to: '',
        pinned: false,
      },
    ]);
    expect(outcome.change).toMatchObject({
      application: 'restart-required',
      target: '@dsh-workbench/core@latest',
      changed: false,
    });
  });
});
