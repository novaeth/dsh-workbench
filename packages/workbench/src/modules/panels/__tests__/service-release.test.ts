import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { createWorkspaceStore, type WorkspaceStore } from '@dsh-workbench/shared/host';
import { PANELS_FILE, PANELS_MODULE_ID, RELEASED_FILE, createPanelsService } from '../model/service';

const A = '/w/a';
const B = '/w/b';

function unit(id: string, order: number): UnitManifest {
  return { id, card: { titleKey: `${id}.title`, order }, tools: [], host: { inject: [] } };
}

const UNITS = [unit('issues', 10), unit('ci', 20)];

let root = '';
let store: WorkspaceStore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-release-'));
  store = createWorkspaceStore({ root });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function mount(options: { store?: WorkspaceStore } = {}) {
  return createPanelsService({
    manifests: () => UNITS,
    store: options.store ?? createWorkspaceStore({ root }),
    owned: () => [],
  });
}

function configFile(workspace: string): string {
  return path.join(store.for(PANELS_MODULE_ID, workspace).dir, PANELS_FILE);
}

function releasedFile(): string {
  return path.join(store.machine(PANELS_MODULE_ID).dir, RELEASED_FILE);
}

function machineConfig(): string {
  return path.join(store.machine(PANELS_MODULE_ID).dir, PANELS_FILE);
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saved(workspace: string): unknown {
  return JSON.parse(fs.readFileSync(configFile(workspace), 'utf8'));
}

describe('createPanelsService：放手 / 收回放手', () => {
  it('★ release = 放手 + 从**所有**工作区拿走（落盘的两个位置都要对）', () => {
    const service = mount();
    service.show('issues', A);
    service.show('issues', B);

    service.release('issues');

    expect(service.isReleased('issues')).toBe(true);
    expect(service.isEnabled('issues', A)).toBe(false);
    expect(service.isEnabled('issues', B)).toBe(false);
    expect(JSON.parse(fs.readFileSync(releasedFile(), 'utf8'))).toEqual({ ids: ['issues'] });
    expect(saved(A)).toEqual({ shown: [], hidden: [] });
    expect(saved(B)).toEqual({ shown: [], hidden: [] });
    expect(mount().isReleased('issues')).toBe(true);
  });

  it('★ release 也清机器级板（shown 与 hidden 两边）：没配过的工作区从此看不到它', () => {
    const service = mount();
    const never = '/w/never';
    service.show('issues', A);
    store.machine(PANELS_MODULE_ID).write(PANELS_FILE, { shown: ['issues', 'ci'], hidden: [] });

    expect(service.isEnabled('issues', never)).toBe(true);

    service.release('issues');

    expect(readJson(machineConfig())).toEqual({ shown: ['ci'], hidden: [] });
    expect(readJson(configFile(A))).toEqual({ shown: [], hidden: [] });
    expect(service.isEnabled('issues', never)).toBe(false);
    expect(mount().isEnabled('issues', never)).toBe(false);
    expect(service.isEnabled('ci', never)).toBe(true);

    store.machine(PANELS_MODULE_ID).write(PANELS_FILE, { shown: ['ci'], hidden: ['issues'] });
    mount().release('issues');

    expect(readJson(machineConfig())).toEqual({ shown: ['ci'], hidden: [] });
  });

  it('★ 从所有工作区拿走是**读盘**做的：这个进程没读过的那些工作区也照清', () => {
    const C = '/w/c';
    const D = '/w/d';
    for (const [workspace, shown] of [
      [C, ['issues', 'ci']],
      [D, ['ci', 'other']],
    ] as const) {
      fs.mkdirSync(path.dirname(configFile(workspace)), { recursive: true });
      fs.writeFileSync(configFile(workspace), JSON.stringify({ shown }), 'utf8');
    }

    mount().release('issues');

    expect(saved(C)).toEqual({ shown: ['ci'], hidden: [] });
    expect(saved(D)).toEqual({ shown: ['ci', 'other'] });
  });

  it('★ 单纯"收起"**不算**放手（依赖还得给它留着）', () => {
    const service = mount();
    service.show('issues', A);

    service.hide('issues', A);

    expect(service.isReleased('issues')).toBe(false);
    expect(fs.existsSync(releasedFile())).toBe(false);
  });

  it('★ 显示 = 我又要它了 → 收回放手（连机器文件一起摘掉）', () => {
    const service = mount();
    service.release('issues');

    service.show('issues', A);

    expect(service.isReleased('issues')).toBe(false);
    expect(service.isEnabled('issues', A)).toBe(true);
    expect(fs.existsSync(releasedFile())).toBe(false);
    expect(mount().isReleased('issues')).toBe(false);
  });

  it('★ 拖上板（move 一个不在名单里的）= 启用它 → 同样收回放手', () => {
    const service = mount();
    service.release('issues');

    service.move('issues', 0, A);

    expect(service.isReleased('issues')).toBe(false);
    expect(service.isEnabled('issues', A)).toBe(true);
  });

  it('没有可写根时放手照样清掉这次会话里读过的那些名单（scan 看不到内存）', () => {
    const service = mount({ store: createWorkspaceStore({ root: null }) });
    service.show('issues', A);
    service.show('issues', B);
    expect(service.isEnabled('issues', B)).toBe(true);

    service.release('issues');

    expect(service.isEnabled('issues', A)).toBe(false);
    expect(service.isEnabled('issues', B)).toBe(false);
  });

  it('★ accept = 重新接纳（用户点「安装」）：收回放手，但**不**自动上板（ADR-0009）', () => {
    const service = mount();
    service.show('issues', A);
    service.release('issues');

    service.accept('issues');

    expect(service.isReleased('issues')).toBe(false);
    expect(fs.existsSync(releasedFile())).toBe(false);
    expect(service.isEnabled('issues', A)).toBe(false);
    expect(mount().isReleased('issues')).toBe(false);
  });

  it('accept 在没放手过时什么都不用做（不为一次无谓的调用落盘）', () => {
    const service = mount();

    service.accept('issues');

    expect(fs.existsSync(releasedFile())).toBe(false);
  });

  it('release 也让订阅者知道（面板要重画）', () => {
    const service = mount();
    const listener = vi.fn();
    service.subscribe(listener);

    service.release('issues');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
