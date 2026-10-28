import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createPreflight } from '../preflight.js';

const NO_CLI = { console: false, pluginMarket: false, browserBridge: false };

describe('没有命令行的适配器：预检里换成它自己的自检', () => {
  it('适配器给了 check → 单独一条「运行时」，标签用它给的名字', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({
      shell: fake.shell,
      capabilities: NO_CLI,
      runtimeLabel: 'Chrome MCP',
      runtimeCheck: async () => ({ ok: true, detail: 'MCP server 起得来（2 个工具）' }),
    });

    const snapshot = await preflight.run();
    const step = snapshot.steps.find((item) => item.id === 'runtime');
    expect(step).toBeDefined();
    expect(step?.label).toBe('Chrome MCP');
    expect(step?.status).toBe('ok');
    expect(snapshot.steps.some((item) => item.id === 'opencli')).toBe(false);
    expect(snapshot.steps.some((item) => item.id === 'bridge')).toBe(false);
  });

  it('自检没过 → 预检停在 failed，错误就是自检那句话', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({
      shell: fake.shell,
      capabilities: NO_CLI,
      runtimeCheck: async () => ({ ok: false, detail: 'MCP server 起不来：spawn ENOENT' }),
    });

    const snapshot = await preflight.run();
    expect(snapshot.phase).toBe('failed');
    expect(snapshot.error).toContain('spawn ENOENT');
    expect(snapshot.guidance).toBe('install');
  });

  it('适配器没给 check → 这一步不出现（照旧）', async () => {
    const fake = createFakeShell([]);
    const preflight = createPreflight({ shell: fake.shell, capabilities: NO_CLI });
    const snapshot = await preflight.run();
    expect(snapshot.steps.some((item) => item.id === 'runtime')).toBe(false);
    expect(snapshot.phase).toBe('ready');
  });
});
