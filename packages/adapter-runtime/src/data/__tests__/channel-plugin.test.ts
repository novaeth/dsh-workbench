import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginPlanStep } from '@dsh-workbench/shared';
import { planLineOf, planStepText } from '@dsh-workbench/shared/host';
import { CHANNEL_PLUGIN_NAME, CHANNEL_PLUGIN_SITE, channelPluginPlan } from '../channel-plugin.js';

const DSH_HOME = '/tmp/dshhome-channel-plan';
const ROOT = path.join(DSH_HOME, 'workbench', 'opencli');
const DEST = path.join(ROOT, 'plugins-npm', 'node_modules', CHANNEL_PLUGIN_NAME);
const PEER_DIR = path.join(ROOT, 'plugins-npm', 'node_modules', '@jackwener', 'opencli');
const PEER_PARENT = path.join(ROOT, 'plugins-npm', 'node_modules', '@jackwener');
const PEER_TARGET = path.join(ROOT, 'toolchain', 'node_modules', '@jackwener', 'opencli');

const POSIX_ONLY = ['rm -rf', 'mkdir -p', 'ln -s', 'cp -R', '|| true', 'NPM_CONFIG_REGISTRY='];

let channelDir = '';

function plan() {
  const resolved = channelPluginPlan({ channelDir, command: 'opencli' });
  if (resolved === undefined) throw new Error('清单在，计划该产得出来');
  return resolved;
}

beforeEach(() => {
  vi.stubEnv('DSH_HOME', DSH_HOME);
  channelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-channel-src-'));
  fs.writeFileSync(
    path.join(channelDir, 'opencli-plugin.json'),
    JSON.stringify({ name: CHANNEL_PLUGIN_SITE, version: '0.1.0' }),
    'utf8',
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(channelDir, { recursive: true, force: true });
});

describe('channelPluginPlan：有序步骤，不是一条 shell 行', () => {
  it('★ 步骤种类与顺序：copy → remove → mkdir → link → 兜底卸载 → 安装', () => {
    const built = plan();

    expect(built.steps.map((step) => step.kind)).toEqual([
      'copy',
      'remove',
      'mkdir',
      'link',
      'run',
      'run',
    ]);
    expect(built.steps[0]).toEqual({ kind: 'copy', from: channelDir, to: DEST });
    expect(built.steps[1]).toEqual({ kind: 'remove', path: PEER_DIR });
    expect(built.steps[2]).toEqual({ kind: 'mkdir', path: PEER_PARENT });
    expect(built.steps[3]).toEqual({ kind: 'link', target: PEER_TARGET, path: PEER_DIR });
    expect(built.steps[4]).toEqual({
      kind: 'run',
      line: `'opencli' plugin uninstall '${CHANNEL_PLUGIN_SITE}'`,
      optional: true,
    });
    expect(built.steps[5]).toEqual({
      kind: 'run',
      line: `'opencli' plugin install '${DEST}'`,
    });
    expect(built.dest).toBe(DEST);
    expect(built.version).toBe('0.1.0');
  });

  it('★ win32 下每一步都渲染得出来，且没有 POSIX-only 编排', () => {
    const built = plan();

    for (const step of built.steps) {
      const text = planStepText(step, 'win32');
      for (const token of POSIX_ONLY) expect(text, `${step.kind}: ${text}`).not.toContain(token);
    }
    const line = planLineOf(built.steps, 'win32');
    for (const token of POSIX_ONLY) expect(line).not.toContain(token);
    const link = built.steps.find((step) => step.kind === 'link');
    if (link === undefined) throw new Error('计划里该有一条链接步');
    expect(planStepText(link, 'win32')).toContain('-ItemType Junction');
  });

  it('★ 给人看的那一行按顺序连起来，命令步里没有 shell 包装', () => {
    const built = plan();
    const kinds = built.steps.map((step) => step.kind);
    const runs: readonly PluginPlanStep[] = built.steps.filter((step) => step.kind === 'run');

    expect(built.line).toBe(planLineOf(built.steps));
    expect(kinds.indexOf('link')).toBeLessThan(kinds.indexOf('run'));
    expect(runs).toHaveLength(2);
    expect(built.line).not.toContain('|| true');
    expect(built.line).toContain('plugin uninstall');
    expect(built.line).toContain('plugin install');
  });

  it('渠道目录里没有清单 → 判不了，不猜', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-channel-empty-'));

    try {
      expect(channelPluginPlan({ channelDir: empty })).toBeUndefined();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
