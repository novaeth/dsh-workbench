import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeShell, createNoopDataReader,
} from '@dsh-workbench/shared/testing';
import type { UnitManifest } from '@dsh-workbench/shared';
import { createHostKit, createWorkspaceStore } from '@dsh-workbench/shared/host';
import { PANELS_FILE, PANELS_MODULE_ID, RELEASED_FILE } from '../model/service';
import { DIY_DEBUG_TOOLS, DIY_RECORD_TOOLS, DIY_TOOLS, panelsUnit } from '../unit';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { testAdaptersWith } from './test-adapters';
import { panelsHost } from '../index';

const adapters = testAdaptersWith({ root: () => dir, profile: () => profileDir });

let dir = '';
let profileDir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-face-'));
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-profile-'));
  fs.writeFileSync(
    path.join(profileDir, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-test', dsh: { profile: { bundles: [] } }, dependencies: {} }),
    'utf8',
  );
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
});

const store = () => createWorkspaceStore({ root: dir });

function mount(options: {
  ctx: unknown;
  manifests: ReturnType<Parameters<typeof panelsHost.mount>[0]['manifests']>;
  installable?: () => readonly string[];
  probe?: Parameters<typeof panelsHost.mount>[0]['probe'];
}) {
  return panelsHost.mount({
    manifest: panelsUnit,
    ctx: options.ctx as never,
    manifests: () => options.manifests,
    ownedUnits: () => [panelsUnit.id],
    store: store(),
    data: createNoopDataReader(),
    ...createHostKit({ libInstallCommand: (options) => `npm i ${options.need.name}` }),
    ...(options.installable === undefined ? {} : { installable: options.installable }),
    ...(options.probe === undefined ? {} : { probe: options.probe }),
  });
}

function configFile(workspace: string): string {
  return path.join(store().for(PANELS_MODULE_ID, workspace).dir, PANELS_FILE);
}

function releasedFile(): string {
  return path.join(store().machine(PANELS_MODULE_ID).dir, RELEASED_FILE);
}

const written = (): string => fs.readFileSync(releasedFile(), 'utf8');

function fakeCtx() {
  const provided: string[] = [];
  return {
    provided,
    ctx: {
      get: (key: string) => (key === WORKBENCH_ADAPTERS ? adapters : undefined),
      provide: (name: string) => {
        provided.push(name);
        return () => {};
      },
      logger: { info: () => {}, warn: () => {} },
    },
  };
}

describe('panelsHost', () => {
  it('交单元号与动态面，并且多交付"闸门 + 偏好写"两样机制', () => {
    const { ctx, provided } = fakeCtx();

    const result = mount({ ctx, manifests: [panelsUnit] });

    expect(panelsHost.unit).toBe(panelsUnit.id);
    expect(provided).toContain('workbenchPanels');
    expect(Object.keys(result.routes)).toEqual([
      'panels',
      'panels/plugins',
      'panels/diy-debug',
      'panels/diy-record',
      'panels/market-discover',
      'panels/market-doc',
      'panels/market-sources',
      'panels/market-installed',
      'panels/market-publish-preview',
    ]);
    expect(result.gate).toBeDefined();
    expect(result.prefs?.resource).toBe('panels');
  });

  it('闸门：没有卡片的套件**永远不会被收起来**（否则"放回来"的入口会被自己收掉）', () => {
    const { ctx } = fakeCtx();
    const result = mount({ ctx, manifests: [panelsUnit] });

    expect(result.gate?.deniedTools({ workspace: '/w/a', preset: null })).toEqual([
      ...DIY_TOOLS,
      ...DIY_DEBUG_TOOLS,
      ...DIY_RECORD_TOOLS,
    ]);
  });

  it('★★ 那 35 把 DIY 工具只跟模式走：与工作区无关，选了 workbench-diy 才有', () => {
    const workshop = path.join(dir, 'workbench', 'diy');
const ctx = {
      get: (name: string) =>
        name === WORKBENCH_ADAPTERS ? adapters :
        name === WORKBENCH_ADAPTERS ? adapters :
        name === 'dshHomePath' ? (relative: string) => path.join(dir, relative) : undefined,
      provide: () => () => {},
      logger: { info: () => {}, warn: () => {} },
    };
    const result = mount({ ctx, manifests: [panelsUnit] });
    const diy = [...DIY_TOOLS, ...DIY_DEBUG_TOOLS, ...DIY_RECORD_TOOLS];

    expect(result.gate?.deniedTools({ workspace: workshop, preset: null })).toEqual(diy);
    expect(result.gate?.deniedTools({ workspace: '/w/a', preset: null })).toEqual(diy);
    expect(result.gate?.deniedTools({ workspace: '/w/a', preset: 'workbench-diy' })).toEqual([]);
    expect(result.gate?.deniedTools({ workspace: workshop, preset: 'workbench-diy' })).toEqual([]);
    expect(result.gate?.deniedTools({ workspace: null, preset: 'workbench-diy' })).toEqual([]);
    expect(result.gate?.deniedTools({ workspace: null, preset: null })).toEqual(diy);
  });

  it('偏好写处理器真的改配置（与 agent 工具同一个服务）', () => {
    const { ctx } = fakeCtx();
    const result = mount({ ctx, manifests: [panelsUnit] });

    const written = result.prefs?.handle({ action: 'reset', path: '/w/a' }) as { ok: boolean; units: unknown[] };

    expect(written.ok).toBe(true);
    expect(Array.isArray(written.units)).toBe(true);
  });

  it('没有 tools 服务时不注册工具（降级不抛）', () => {
    const { ctx } = fakeCtx();
    const result = mount({ ctx, manifests: [panelsUnit] });

    expect(result.registerTools()).toEqual([]);
  });

  it('★ 交出机器供给处理器，且**真的转到市场服务**（未声明的模块 → 市场报"没有这个模块"）', async () => {
    const { ctx } = fakeCtx();
    const result = mount({ ctx, manifests: [panelsUnit] });

    expect(typeof result.provision?.handle).toBe('function');
    await expect(
      Promise.resolve(result.provision?.handle({ action: 'install', unit: 'issues' })),
    ).rejects.toThrow(/市场里没有这个模块：issues/);
  });

  it('★ 清单声明的工具 === 面实际注册的（逐个对账）', () => {
    const registered: string[] = [];
    const ctx = {
      get: (name: string) =>
        name === WORKBENCH_ADAPTERS ? adapters :
        name === 'tools'
          ? {
              register(definition: { name: string }) {
                registered.push(definition.name);
                return () => {};
              },
            }
          : undefined,
      provide: () => () => {},
      logger: { info: () => {}, warn: () => {} },
    };

    const result = mount({ ctx, manifests: [panelsUnit] });
    result.registerTools();

    expect([...registered].sort()).toEqual(panelsUnit.tools.map((tool) => tool.name).sort());
  });
});

describe('panelsHost：装/卸之后面板跟着变', () => {
  const boardUnit: UnitManifest = {
    id: 'board-x',
    titleKey: 'issues.mine', card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [
      {
        kind: 'extension',
        runtime: 'opencli',
        name: 'p',
        commands: ['x'],
        purpose: '测试',
        sources: [{ kind: 'git', url: 'git@x:p.git' }],
      },
    ],
  };

  function ctxWithShell(shell: unknown) {
    return {
      get: (name: string) =>
        name === WORKBENCH_ADAPTERS ? adapters :
        name === 'shell' ? shell : name === 'profileContext' ? { dir: profileDir } : undefined,
      provide: () => () => {},
      logger: { info: () => {}, warn: () => {} },
    };
  }

  const fakeProbe = async (unit: string) => ({
    unit,
    status: 'missing' as const,
    needs: [
      {
        id: 'extension:p',
        kind: 'extension' as const,
        name: 'p',
        status: 'missing' as const,
        detail: '假探测',
        provision: 'ready' as const,
        command: "'opencli' plugin install 'git@x:p.git'",
      },
    ],
    detail: '假探测',
  });

  const installed = async (unit: string) => ({
    unit,
    status: 'ok' as const,
    needs: [{ id: 'extension:p', kind: 'extension' as const, name: 'p', status: 'ok' as const, detail: '假探测' }],
    detail: '假探测',
  });

  it('★ 装完**不上板**（装是机器的事，用不用是每个项目自己的选择 —— ADR-0009）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const mounted = mount({
      ctx: ctxWithShell(fake.shell),
      manifests: [panelsUnit, boardUnit],
      probe: fakeProbe as never,
    });

    await mounted.provision?.handle({ action: 'install', unit: 'board-x' });

    expect(fs.readdirSync(dir)).toEqual([]);
    const payload = (await mounted.routes.panels?.(new URLSearchParams({ path: '/w/a' }))) as {
      units: Array<{ id: string; shown: boolean }>;
    };
    expect(payload.units.find((entry) => entry.id === 'board-x')?.shown).toBe(false);
  });

  it('★ 市场门槛按来源认模块：宿主点了名的都在目录里（没有插件要装的那张也在），没点名的不在', async () => {
    const { needs: _needs, ...withoutNeeds } = boardUnit;
    const noEnv: UnitManifest = { ...withoutNeeds, id: 'board-z' };
    const fake = createFakeShell([]);
    const mounted = mount({
      ctx: ctxWithShell(fake.shell),
      manifests: [panelsUnit, boardUnit, noEnv],
      installable: () => ['board-x', 'board-z'],
      probe: installed as never,
    });

    await expect(
      mounted.provision?.handle({ action: 'install', unit: 'board-z' }),
    ).resolves.toMatchObject({ ok: true, action: 'install' });
    await expect(
      Promise.resolve(mounted.provision?.handle({ action: 'install', unit: 'board-y' })),
    ).rejects.toThrow(/市场里没有这个模块：board-y/);
    await expect(
      Promise.resolve(mounted.provision?.handle({ action: 'install', unit: panelsUnit.id })),
    ).rejects.toThrow(new RegExp(`市场里没有这个模块：${panelsUnit.id}`));
  });

  it('★ 宿主没说来源（旧宿主）→ 回退老口径：声明了插件/库的才进目录', async () => {
    const mounted = mount({
      ctx: ctxWithShell(createFakeShell([]).shell),
      manifests: [panelsUnit, boardUnit],
      probe: installed as never,
    });

    await expect(
      Promise.resolve(mounted.provision?.handle({ action: 'install', unit: panelsUnit.id })),
    ).rejects.toThrow(new RegExp(`市场里没有这个模块：${panelsUnit.id}`));
  });

  it('★ 另一个模块只是**停用**（没卸载）→ 卸它时那份安装仍然留着（停用是"暂时不用"）', async () => {
    const other = { ...boardUnit, id: 'board-y' };
    const fake = createFakeShell([{ stdout: '' }]);
    const mounted = mount({
      ctx: ctxWithShell(fake.shell),
      manifests: [panelsUnit, boardUnit, other],
      probe: installed as never,
    });

    await mounted.provision?.handle({ action: 'install', unit: 'board-y' });
    await mounted.prefs?.handle({ action: 'hide', id: 'board-y', path: '/w/a' });

    await mounted.provision?.handle({ action: 'uninstall', unit: 'board-x' });

    expect(fake.commands()).toEqual([]);
  });

  it('★ 顺序卸也能走到干净状态：面板上还有人要就留着，最后一个人走了才真删（死角就没了）', async () => {
    const other = { ...boardUnit, id: 'board-y' };
    const fake = createFakeShell([{ stdout: '' }, { stdout: '' }]);
    const mounted = mount({
      ctx: ctxWithShell(fake.shell),
      manifests: [panelsUnit, boardUnit, other],
      probe: installed as never,
    });
    const provision = mounted.provision;

    await provision?.handle({ action: 'install', unit: 'board-x' });
    await provision?.handle({ action: 'install', unit: 'board-y' });

    await provision?.handle({ action: 'uninstall', unit: 'board-x' });
    expect(fake.commands()).toEqual([]);

    await provision?.handle({ action: 'uninstall', unit: 'board-y' });
    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'p'"]);
    const saved = JSON.parse(written()) as { ids?: string[] };
    expect(saved.ids).toEqual(expect.arrayContaining(['board-x', 'board-y']));
    expect(fs.readdirSync(dir).filter((name) => name !== '_machine')).toEqual([]);
  });

  it('★ 卸完 → 从**所有**工作区拿走 + 记一笔放手', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const mounted = mount({
      ctx: ctxWithShell(fake.shell),
      manifests: [panelsUnit, boardUnit],
      probe: fakeProbe as never,
    });
    await mounted.prefs?.handle({ action: 'show', id: 'board-x', path: '/w/a' });
    await mounted.prefs?.handle({ action: 'show', id: 'board-x', path: '/w/b' });
    expect(fs.readFileSync(configFile('/w/a'), 'utf8')).toContain('board-x');

    await mounted.provision?.handle({ action: 'uninstall', unit: 'board-x' });

    expect(JSON.parse(written())).toEqual({ ids: ['board-x'] });
    expect(JSON.parse(fs.readFileSync(configFile('/w/a'), 'utf8'))).toEqual({ shown: [], hidden: [] });
    expect(JSON.parse(fs.readFileSync(configFile('/w/b'), 'utf8'))).toEqual({ shown: [], hidden: [] });
  });
});
