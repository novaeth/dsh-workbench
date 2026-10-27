import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { readBundleManager } from '../index.js';

function fakeContext(manager: unknown): DshHostContext {
  return { get: (name: string) => (name === 'pluginManager' ? manager : undefined) } as unknown as DshHostContext;
}

const MANAGER = {
  installBundle: async () => ({ application: 'applied', stage: 'install', changed: true, target: 'x' }),
  removeBundle: async () => ({ application: 'applied', stage: 'remove', changed: true, target: 'x' }),
};

describe('bundle manager：唯一那条 pluginManager 适配缝', () => {
  it('服务不在 / 缺写方法 → 没有适配缝，而不是半条', () => {
    expect(readBundleManager(fakeContext(undefined))).toBeUndefined();
    expect(readBundleManager(fakeContext({ listBundles: async () => [] }))).toBeUndefined();
    expect(readBundleManager(fakeContext({ installBundle: async () => ({}) }))).toBeUndefined();
  });

  it('registries()：registry 可以是 null（= pnpm 自己配的源）；方法不在就回 null', async () => {
    const manager = readBundleManager(
      fakeContext({
        ...MANAGER,
        registries: async () => ({
          registry: null,
          fallbackRegistries: ['https://r.example/', 7],
          resolved: 'https://registry.npmmirror.com/',
        }),
      }),
    );
    expect(await manager?.registries()).toEqual({
      registry: null,
      fallbackRegistries: ['https://r.example/'],
      resolved: 'https://registry.npmmirror.com/',
    });

    const bare = readBundleManager(fakeContext(MANAGER));
    expect(await bare?.registries()).toBeNull();
  });

  it('inspect()：accepted 只带有的字段，registry 为 null 也认', async () => {
    const manager = readBundleManager(
      fakeContext({
        ...MANAGER,
        inspect: async (spec: string, options?: { registry?: string | null }) => ({
          status: 'accepted',
          kind: 'registry',
          name: spec,
          version: '0.3.1',
          bundle: true,
          registry: options?.registry ?? null,
        }),
      }),
    );
    expect(await manager?.inspect('@dsh-workbench/module-hello', null)).toEqual({
      status: 'accepted',
      kind: 'registry',
      name: '@dsh-workbench/module-hello',
      version: '0.3.1',
      bundle: true,
      registry: null,
    });
  });

  it('inspect()：refused 的 problem 不在表里就落到 unknown，非法 registries 丢掉', async () => {
    const manager = readBundleManager(
      fakeContext({
        ...MANAGER,
        inspect: async () => ({
          status: 'refused',
          problem: 'something-new',
          reason: '源上没有这个包',
          registries: ['https://a.example/', null, 5],
        }),
      }),
    );
    expect(await manager?.inspect('nope')).toEqual({
      status: 'refused',
      problem: 'unknown',
      reason: '源上没有这个包',
      registries: ['https://a.example/', null],
    });
  });

  it('inspect()：看不懂的回答回 null，不瞎猜', async () => {
    const manager = readBundleManager(fakeContext({ ...MANAGER, inspect: async () => ({ status: 'weird' }) }));
    expect(await manager?.inspect('x')).toBeNull();
    expect(await readBundleManager(fakeContext(MANAGER))?.inspect('x')).toBeNull();
  });

  it('★ 要重启时把 dsh 给的理由一起带回来（不认识的理由丢掉，不许原样塞给界面）', async () => {
    const manager = readBundleManager(
      fakeContext({
        ...MANAGER,
        installBundle: async (spec: string) => ({
          application: 'restart-required',
          stage: 'install',
          changed: true,
          target: spec,
          bundle: spec,
          restartReason: 'no-hmr',
        }),
      }),
    );
    const change = await manager?.install({ spec: '@dsh-workbench/module-hello@0.1.3' });
    expect(change?.restartReason).toBe('no-hmr');

    const odd = readBundleManager(
      fakeContext({
        ...MANAGER,
        installBundle: async (spec: string) => ({
          application: 'restart-required',
          stage: 'install',
          changed: true,
          target: spec,
          bundle: spec,
          restartReason: 'vibes',
        }),
      }),
    );
    expect((await odd?.install({ spec: '@dsh-workbench/module-hello@0.1.3' }))?.restartReason).toBeUndefined();
  });

  it('install()：spec / registry / requestId / approvedBuilds 原样透传，结果归一', async () => {
    const seen: unknown[] = [];
    const manager = readBundleManager(
      fakeContext({
        ...MANAGER,
        installBundle: async (spec: string, options: unknown) => {
          seen.push({ spec, options });
          return {
            application: 'restart-required',
            stage: 'install',
            changed: true,
            target: spec,
            bundle: spec,
            restartReason: 'package-moved',
            warnings: ['x'],
          };
        },
      }),
    );
    const change = await manager?.install({
      spec: '@dsh-workbench/module-hello@0.1.3',
      registry: 'https://r.example/',
      requestId: 'req-1',
      approvedBuilds: ['esbuild'],
    });
    expect(seen).toEqual([
      {
        spec: '@dsh-workbench/module-hello@0.1.3',
        options: { registry: 'https://r.example/', requestId: 'req-1', approvedBuilds: ['esbuild'] },
      },
    ]);
    expect(change).toEqual({
      application: 'restart-required',
      stage: 'install',
      changed: true,
      target: '@dsh-workbench/module-hello@0.1.3',
      bundle: '@dsh-workbench/module-hello@0.1.3',
      restartReason: 'package-moved',
    });
  });

  it('install()：失败态把归因带全（错误码 / pnpm 结果 / 待批构建脚本 / 卡在哪一侧）', async () => {
    const manager = readBundleManager(
      fakeContext({
        ...MANAGER,
        installBundle: async () => ({
          application: 'failed',
          stage: 'install',
          changed: false,
          target: 'x',
          error: { code: 'incompatible-version', diagnostic: 'peer 不匹配' },
          packageResult: { exitCode: 1, output: 'ERR', truncated: true, logPath: '/tmp/pnpm.log', kind: 'build-blocked' },
          pendingBuilds: ['esbuild', 7],
          failedAt: 'registry',
        }),
      }),
    );
    expect(await manager?.install({ spec: 'x' })).toEqual({
      application: 'failed',
      stage: 'install',
      changed: false,
      target: 'x',
      errorCode: 'incompatible-version',
      errorDetail: 'peer 不匹配',
      packageResult: { exitCode: 1, output: 'ERR', truncated: true, logPath: '/tmp/pnpm.log', kind: 'build-blocked' },
      pendingBuilds: ['esbuild'],
      failedAt: 'registry',
    });
  });

  it('install()：application 不在那五个里 ⇒ 返回 null（宁可说"看不懂"，也不编一个状态）', async () => {
    const manager = readBundleManager(fakeContext({ ...MANAGER, installBundle: async () => ({ application: '?' }) }));
    expect(await manager?.install({ spec: 'x' })).toBeNull();
  });

  it('remove()：走 removeBundle，结果同样归一', async () => {
    const manager = readBundleManager(
      fakeContext({
        ...MANAGER,
        removeBundle: async (name: string) => ({
          application: 'failed',
          stage: 'remove',
          changed: false,
          target: name,
          error: { code: 'bundle-in-use' },
        }),
      }),
    );
    expect(await manager?.remove('@dsh-workbench/module-hello')).toEqual({
      application: 'failed',
      stage: 'remove',
      changed: false,
      target: '@dsh-workbench/module-hello',
      errorCode: 'bundle-in-use',
    });
  });

  it('cancel()：三种取值照抄；方法不在就回 null', async () => {
    const manager = readBundleManager(
      fakeContext({ ...MANAGER, cancelInstall: async () => ({ status: 'too-late' }) }),
    );
    expect(await manager?.cancel('req-1')).toBe('too-late');
    expect(await readBundleManager(fakeContext(MANAGER))?.cancel('req-1')).toBeNull();
    const weird = readBundleManager(fakeContext({ ...MANAGER, cancelInstall: async () => ({ status: 'nope' }) }));
    expect(await weird?.cancel('req-1')).toBeNull();
  });
});
