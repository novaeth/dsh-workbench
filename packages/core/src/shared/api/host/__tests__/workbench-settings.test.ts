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
  it('★ 默认关：没有文件时 MCP 按需加载与非正式版本都是关的', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(store.read()).toEqual({ mcpOnDemand: false, includePrerelease: false });
    expect(fs.existsSync(path.join(root, 'settings.json'))).toBe(false);
  });

  it('★ 打开开关：写到 settings.json；再读回来还是开；文件长这样', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(store.apply({ mcpOnDemand: true })).toEqual({
      ok: true,
      settings: { mcpOnDemand: true, includePrerelease: false },
    });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'))).toEqual({
      mcpOnDemand: true,
      includePrerelease: false,
    });

    const again = createWorkbenchSettingsStore({ root });
    expect(again.read()).toEqual({ mcpOnDemand: true, includePrerelease: false });
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
    const provided: Record<string, unknown> = {};
    const ctx = {
      get: (name: string) => provided[name],
      provide: (name: string, value: unknown) => {
        provided[name] = value;
        return () => {};
      },
    };
    const store = mountWorkbenchSettings({ ctx: ctx as never, routes: routes as never, root });

    expect(routes['workbench-settings']?.()).toEqual({
      ok: true,
      settings: { mcpOnDemand: false, includePrerelease: false },
    });
    store.apply({ mcpOnDemand: true });
    expect(routes['workbench-settings']?.()).toEqual({
      ok: true,
      settings: { mcpOnDemand: true, includePrerelease: false },
    });
  });

  it('不是 boolean 就当场拒，文件一个字节都不动', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(() => store.apply({ mcpOnDemand: 'yes' })).toThrow(/mcpOnDemand/);
    expect(fs.existsSync(path.join(root, 'settings.json'))).toBe(false);
    expect(store.read()).toEqual({ mcpOnDemand: false, includePrerelease: false });
  });

  it('★ 打开非正式版本开关：只改它，MCP 那一档不动', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(store.apply({ includePrerelease: true })).toEqual({
      ok: true,
      settings: { mcpOnDemand: false, includePrerelease: true },
    });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'))).toEqual({
      mcpOnDemand: false,
      includePrerelease: true,
    });
  });

  it('includePrerelease 不是 boolean 也当场拒，文件一个字节都不动', () => {
    const store = createWorkbenchSettingsStore({ root });

    expect(() => store.apply({ includePrerelease: 'yes' })).toThrow(/includePrerelease/);
    expect(fs.existsSync(path.join(root, 'settings.json'))).toBe(false);
  });
});
