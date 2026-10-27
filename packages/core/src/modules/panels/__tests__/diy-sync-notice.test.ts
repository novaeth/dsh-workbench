import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  renderStatus,
  statusOf,
  SYNC_STALE_MINUTES,
  SYNC_STALE_MS,
  syncNotice,
  type ModuleStatus,
} from '../model/diy-report';
import { syncStateOf, type SyncState, type Toolchain } from '@/shared/api/host/diy-modules';

const roots: string[] = [];

const HALF: Toolchain = { core: '0.3.0', moduleTools: '0.2.0', shared: '0.2.0' };
const OLD: Toolchain = { core: '0.2.0', moduleTools: '0.2.0', shared: '0.2.0' };
const SAME: Toolchain = { core: '0.3.0', moduleTools: '0.3.0', shared: '0.3.0' };

function workshop(options: {
  readonly sync?: unknown;
  readonly installed?: string;
  readonly versions?: Readonly<Record<string, string>>;
} = {}): {
  readonly root: string;
  readonly dir: string;
  readonly packagesDir: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'wb-diy-sync-'));
  roots.push(root);
  const dir = join(root, 'diy');
  mkdirSync(join(dir, 'packages'), { recursive: true });
  if (options.sync !== undefined) writeFileSync(join(dir, '.sync.json'), `${JSON.stringify(options.sync)}\n`);
  const versions =
    options.versions ??
    (options.installed === undefined
      ? undefined
      : { core: options.installed, 'module-tools': options.installed, shared: options.installed });
  for (const [name, version] of Object.entries(versions ?? {})) {
    const pkg = join(dir, 'node_modules', '@dsh-workbench', name);
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), `${JSON.stringify({ name: `@dsh-workbench/${name}`, version })}\n`);
  }
  return { root, dir, packagesDir: join(dir, 'packages') };
}

function row(dir: string): ModuleStatus {
  return statusOf({
    dir,
    unit: 'demo',
    name: 'demo',
    installed: false,
    known: false,
    open: false,
    health: { state: 'absent', reason: '还没装' },
  });
}

function textOf(dir: string, shellVersion: string): string {
  return renderStatus(dir, [row(dir)], { shellVersion });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('工坊代际：failed 说人话', () => {
  it('failed + 当前外壳版本：说清还是上一代 + 差在哪 + reason 原文 + 怎么修', () => {
    const { dir } = workshop({
      sync: { state: 'failed', version: '0.3.0', at: '2026-10-18T00:00:00Z', reason: '没有 pnpm，装不动' },
      installed: '0.2.0',
    });

    const text = textOf(dir, '0.3.0');

    expect(text).toContain('工坊工具链还是上一代');
    expect(text).toContain('工坊里 core 0.2.0 / module-tools 0.2.0 / shared 0.2.0');
    expect(text).toContain('工作台已经是 0.3.0');
    expect(text).toContain('没有 pnpm，装不动');
    expect(text).toContain('pnpm install');
    expect(text).toContain('重启一次工作台');
    expect(text.startsWith(`工作区：${dir}\n⚠️`)).toBe(true);
  });

  it('reason 没给时也把话说全（不打印 undefined）', () => {
    const { dir } = workshop({
      sync: { state: 'failed', version: '0.3.0', at: '2026-10-18T00:00:00Z' },
      installed: '0.2.0',
    });

    const text = textOf(dir, '0.3.0');

    expect(text).toContain('(没给原因)');
    expect(text).not.toContain('undefined');
  });

  it('failed + 工坊里读不到那三个包（install 把树弄坏了）：照样报，不静默', () => {
    const { dir } = workshop({
      sync: { state: 'failed', version: '0.3.0', at: '2026-10-18T00:00:00Z', reason: '装到一半断了' },
      versions: { core: '0.3.0' },
    });

    const text = textOf(dir, '0.3.0');

    expect(text).toContain('工坊里读不到那三个包的版本');
    expect(text).toContain('装到一半断了');
    expect(text).toContain('pnpm install');
  });

  it('failed + 旧版本（外壳又更新过）：不拿旧记录当当前状态说', () => {
    const { dir, root } = workshop({
      sync: { state: 'failed', version: '0.2.0', at: '2026-10-18T00:00:00Z', reason: '离线' },
    });
    const record = syncStateOf(join(root, 'diy'));

    const generic = syncNotice({ sync: record, shellVersion: '0.3.0', toolchain: OLD });
    expect(generic).toContain('下一轮工作台启动时会对齐到 0.3.0');
    expect(generic).not.toContain('正在后台同步');
    expect(generic).not.toContain('离线');
    expect(generic).not.toContain('还是上一代（工坊里 core 0.2.0 / module-tools 0.2.0 / shared 0.2.0；工作台已经是');
    expect(syncNotice({ sync: record, shellVersion: '0.3.0', toolchain: undefined })).toBeUndefined();
    const text = textOf(dir, '0.3.0');
    expect(text).not.toContain('还是上一代');
    expect(text).not.toContain('后台同步');
  });

  it('failed 但工坊里其实已经是这一代：不喊狼来了', () => {
    const { dir } = workshop({
      sync: { state: 'failed', version: '0.3.0', at: '2026-10-18T00:00:00Z', reason: '上一次没成' },
      installed: '0.3.0',
    });

    expect(textOf(dir, '0.3.0')).not.toContain('还是上一代');
  });

  it('算不出当前外壳版本：一声不响（不冒充）', () => {
    const { dir, root } = workshop({
      sync: { state: 'failed', version: '0.3.0', at: '2026-10-18T00:00:00Z' },
    });

    expect(
      syncNotice({
        sync: syncStateOf(join(root, 'diy')),
        shellVersion: undefined,
        toolchain: OLD,
      }),
    ).toBeUndefined();
    expect(renderStatus(dir, [row(dir)])).not.toContain('还是上一代');
  });
});

describe('工坊代际：正在同步', () => {
  it('syncing + 当前外壳版本 + 刚写的记录：说正在后台同步', () => {
    const { dir } = workshop({
      sync: { state: 'syncing', version: '0.3.0', at: new Date().toISOString() },
      installed: '0.2.0',
    });

    const text = textOf(dir, '0.3.0');

    expect(text).toContain('正在后台同步到 0.3.0');
  });

  it('syncing 但记录停住了：不冒充"正在同步"，说没走完 + 同一句修法', () => {
    const { dir } = workshop({
      sync: { state: 'syncing', version: '0.3.0', at: '2020-01-01T00:00:00Z' },
      installed: '0.2.0',
    });

    const text = textOf(dir, '0.3.0');

    expect(text).toContain('上一次同步没走完');
    expect(text).toContain('2020-01-01T00:00:00Z');
    expect(text).not.toContain('正在后台同步');
    expect(text).toContain('pnpm install');
  });

  it('窗口是参数：15 分钟以内算在跑、超过算没走完（文案里的分钟数也跟着窗口走）', () => {
    const now = 1_700_000_000_000;
    const at = (minutes: number): string => new Date(now - minutes * 60_000).toISOString();
    const sync = (minutes: number): SyncState => ({ state: 'syncing', version: '0.3.0', at: at(minutes) });
    const base = { shellVersion: '0.3.0', toolchain: OLD, now };

    expect(SYNC_STALE_MINUTES).toBe(15);
    expect(syncNotice({ ...base, windowMs: SYNC_STALE_MS, sync: sync(14) })).toContain('正在后台同步');
    expect(syncNotice({ ...base, windowMs: SYNC_STALE_MS, sync: sync(15) })).toContain('正在后台同步');
    expect(syncNotice({ ...base, windowMs: SYNC_STALE_MS, sync: sync(16) })).toContain('上一次同步没走完');
    expect(syncNotice({ ...base, windowMs: 5 * 60_000, sync: sync(6) })).toContain('超过 5 分钟');
  });

  it('记录里没有能解析的时间：不当成"停住了"喊狼来了', () => {
    const notice = syncNotice({
      sync: { state: 'syncing', version: '0.3.0', at: '' },
      shellVersion: '0.3.0',
      toolchain: OLD,
    });

    expect(notice).toContain('正在后台同步');
  });

  it('★ 没有 .sync.json 的工作区不归我们维护：装了上一代也不出声（不替别人的仓库喊狼来了）', () => {
    const { dir } = workshop({ installed: '0.2.0' });

    const text = textOf(dir, '0.3.0');

    expect(text).not.toContain('上一代');
    expect(text).not.toContain('下一轮工作台启动时会对齐');
  });

  it('★ 只差一个包、也没有记录：同样不出声', () => {
    const { dir } = workshop({ versions: { core: '0.3.0', 'module-tools': '0.2.0', shared: '0.2.0' } });

    expect(textOf(dir, '0.3.0')).not.toContain('上一代');
  });

  it('工坊没装完（缺包）、也没有本代记录：不出声（首次是 setup 的活）', () => {
    const { dir } = workshop({ versions: { core: '0.2.0' } });

    expect(textOf(dir, '0.3.0')).not.toContain('上一代');
  });

  it('ok 记录 + 工坊里是上一代：记录不撒谎说同步完了，但也不说正在跑', () => {
    const { dir } = workshop({
      sync: { state: 'ok', version: '0.3.0', at: '2026-10-18T00:00:00Z' },
      installed: '0.2.0',
    });

    const text = textOf(dir, '0.3.0');

    expect(text).toContain('下一轮工作台启动时会对齐到 0.3.0');
    expect(text).not.toContain('正在后台同步');
  });

  it('漂移：ok(0.3.0) 而外壳 0.3.1、实装 0.3.0 —— 没有任何同步在跑，别说"正在后台同步"', () => {
    const { dir } = workshop({
      sync: { state: 'ok', version: '0.3.0', at: '2026-10-18T00:00:00Z' },
      installed: '0.3.0',
    });

    const text = textOf(dir, '0.3.1');

    expect(text).toContain('工坊里 core 0.3.0 / module-tools 0.3.0 / shared 0.3.0，工作台 0.3.1');
    expect(text).toContain('下一轮工作台启动时会对齐到 0.3.1');
    expect(text).toContain('seed.log');
    expect(text).not.toContain('正在后台同步');
    expect(text).not.toContain('正在同步');
  });

  it('ok 记录但版本是旧的（外壳又更新过）：不会当成"已同代"', () => {
    const { dir } = workshop({
      sync: { state: 'ok', version: '0.2.0', at: '2026-10-18T00:00:00Z' },
      installed: '0.2.0',
    });

    const text = textOf(dir, '0.3.0');

    expect(text).toContain('下一轮工作台启动时会对齐到 0.3.0');
    expect(text).not.toContain('正在后台同步');
    expect(text).not.toContain('工作台已经是 0.3.0');
  });
});

describe('工坊代际：与今天一致', () => {
  it('文件不在、工坊里也没版本：状态那一屏逐字与改动前一致', () => {
    const { dir } = workshop();

    expect(textOf(dir, '0.3.0')).toBe(
      `工作区：${dir}\n` +
        '—— demo（demo）\n' +
        '   装：没有 · 面板认得：不是 · 板上开着：没有\n' +
        '   起得来：还没有（还没装）\n' +
        '   产物：没有\n' +
        '   下一步：装：workbench_diy_install（第一次）',
    );
  });

  it('同代（工坊里就是这一代）不出声', () => {
    const { dir } = workshop({
      sync: { state: 'ok', version: '0.3.0', at: '2026-10-18T00:00:00Z' },
      installed: '0.3.0',
    });

    const text = textOf(dir, '0.3.0');

    expect(text.startsWith(`工作区：${dir}\n—— demo`)).toBe(true);
    expect(text).not.toContain('上一代');
    expect(text).not.toContain('后台同步');
  });

  it('记录坏掉 / 状态不认识 / 只有半个 JSON：不炸也不出声', () => {
    const { dir } = workshop({ installed: '0.3.0' });
    const file = join(dir, '.sync.json');

    for (const body of ['', '{', '{"state":"weird","version":"0.3.0"}', '[1,2,3]', 'null']) {
      writeFileSync(file, body);
      expect(syncStateOf(dir)).toBeUndefined();
      expect(textOf(dir, '0.3.0')).not.toContain('上一代');
    }
  });

  it('空工坊也带这条（还没造模块时最需要它）', () => {
    const { dir } = workshop({
      sync: { state: 'failed', version: '0.3.0', at: '2026-10-18T00:00:00Z', reason: '装不动' },
      installed: '0.2.0',
    });

    const text = renderStatus(dir, [], { shellVersion: '0.3.0' });

    expect(text).toContain('没有模块源码');
    expect(text).toContain('还是上一代');
  });
});

describe('syncNotice 的实装判据（照 T1 entry 那三条：三个包都在、都同代才不出声）', () => {
  const base = { sync: undefined, shellVersion: '0.3.0' };

  it('三个包都在、都同代 → 不出声（哪怕记录是 failed，那也是过时的）', () => {
    expect(syncNotice({ ...base, toolchain: SAME })).toBeUndefined();
  });

  it('只差一个包 → 报出来（core 同代不算同代）', () => {
    expect(syncNotice({ ...base, toolchain: HALF })).toContain('module-tools 0.2.0');
  });

  it('工坊没装完 / 没装 → 不出声（那是 skeleton 的活）', () => {
    expect(syncNotice({ ...base, toolchain: undefined })).toBeUndefined();
  });
});
