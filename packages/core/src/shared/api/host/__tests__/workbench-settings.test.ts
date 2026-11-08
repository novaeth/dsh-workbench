import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkbenchSettingsStore, mountWorkbenchSettings } from '../workbench-settings';

let root = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-settings-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('工作台设置（本机文件）', () => {
  it('★ 默认关：没有文件时 MCP 按需加载是关的', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(store.read()).toEqual({ mcpOnDemand: false });
    expect(fs.existsSync(path.join(root, 'settings.json'))).toBe(false);
  });

  it('★ 打开开关：写到 settings.json；再读回来还是开；文件长这样', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(store.apply({ mcpOnDemand: true })).toEqual({ ok: true, settings: { mcpOnDemand: true } });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'))).toEqual({ mcpOnDemand: true });

    const again = createWorkbenchSettingsStore({ root });
    expect(again.read()).toEqual({ mcpOnDemand: true });
  });

  it('开关变了才通知；同一个值再写一次不惊动订阅者', () => {
    const store = createWorkbenchSettingsStore({ root });
    let changes = 0;
    const off = store.watch(() => (changes += 1));

    store.apply({ mcpOnDemand: false });
    expect(changes).toBe(0);
    store.apply({ mcpOnDemand: true });
    expect(changes).toBe(1);
    store.apply({ mcpOnDemand: true });
    expect(changes).toBe(1);
    off();
    store.apply({ mcpOnDemand: false });
    expect(changes).toBe(1);
  });

  it('★ 读口带 ok: true（取数层只认 ok 的响应，少一个字段界面就一直 disabled）', () => {
    const routes: Record<string, () => unknown> = {};
    const store = mountWorkbenchSettings({ ctx: {} as never, routes: routes as never, root });

    expect(routes['workbench-settings']?.()).toEqual({ ok: true, settings: { mcpOnDemand: false } });
    store.apply({ mcpOnDemand: true });
    expect(routes['workbench-settings']?.()).toEqual({ ok: true, settings: { mcpOnDemand: true } });
  });

  it('不是 boolean 就当场拒，文件一个字节都不动', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(() => store.apply({ mcpOnDemand: 'yes' })).toThrow(/mcpOnDemand/);
    expect(fs.existsSync(path.join(root, 'settings.json'))).toBe(false);
    expect(store.read()).toEqual({ mcpOnDemand: false });
  });
});
