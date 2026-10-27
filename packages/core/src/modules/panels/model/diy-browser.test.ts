import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { bindCurrentTab, jsonOf, readyPageOf, runBrowserStep, writeShotsDir } from './diy-browser';
import { cardSelectorOf } from './diy-scripts';

interface Step {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
}

function fakeShell(steps: readonly Step[]) {
  const lines: string[] = [];
  let index = 0;
  const shell = {
    resolve(request: { command: string }) {
      lines.push(request.command);
      return request;
    },
    async execute() {
      const step = steps[Math.min(index, steps.length - 1)] ?? {};
      index += 1;
      return {
        result: async () => ({
          exitCode: step.exitCode === undefined ? 0 : step.exitCode,
          timedOut: step.timedOut ?? false,
          aborted: false,
          stdout: { text: step.stdout ?? '', truncated: step.truncated ?? false },
          stderr: { text: step.stderr ?? '', truncated: false },
        }),
      };
    },
  };
  return { shell: shell as unknown as DshShell, lines };
}

describe('跑一条 opencli：argv 原样挂上背景前缀，结果原样回来', () => {
  it('★★ 每个参数各自引号，会话与子命令一个不改', async () => {
    const rig = fakeShell([{ stdout: 'ok' }]);
    const step = await runBrowserStep(rig.shell, 'opencli', [
      'browser',
      'workbench',
      'state',
      '--source',
      'ax',
      '--window',
      'background',
    ]);

    expect(rig.lines[0]).toBe(
      "'env' 'OPENCLI_WINDOW=background' 'opencli' 'browser' 'workbench' 'state' '--source' 'ax' '--window' 'background'",
    );
    expect(step.ok).toBe(true);
    expect(step.stdout).toBe('ok');
  });

  it('★★ ok = exitCode 0 且没超时；truncated 是两路合并后的那个布尔', async () => {
    const failed = fakeShell([{ exitCode: 3, stdout: 'out', stderr: 'boom' }]);
    const slow = fakeShell([{ timedOut: true, exitCode: null }]);
    const cut = fakeShell([{ stdout: 'x', truncated: true }]);

    expect(await runBrowserStep(failed.shell, 'opencli', ['browser', 'workbench', 'state'])).toMatchObject({
      ok: false,
      exitCode: 3,
      timedOut: false,
      truncated: false,
      stdout: 'out',
      stderr: 'boom',
    });
    expect(await runBrowserStep(slow.shell, 'opencli', ['browser', 'workbench', 'state'])).toMatchObject({
      ok: false,
      timedOut: true,
    });
    expect(await runBrowserStep(cut.shell, 'opencli', ['browser', 'workbench', 'state'])).toMatchObject({
      ok: true,
      truncated: true,
    });
  });
});

describe('抠 JSON 与那一页的握手', () => {
  it('★ 命令里混着别的话也能把信封抠出来；抠不出就老实说没有', () => {
    expect(jsonOf('noise {"a":1} tail')?.['a']).toBe(1);
    expect(jsonOf('null')).toBeUndefined();
    expect(jsonOf('[]')).toBeUndefined();
    expect(jsonOf('{')).toBeUndefined();
    expect(jsonOf('没有什么')).toBeUndefined();
  });

  it('★ 连不上/不是工作台都有话说（不给用户看一句空错）', async () => {
    const bad = fakeShell([{ stdout: JSON.stringify({ error: { code: 'no-extension', message: '扩展没连上' } }) }]);
    const bound = await bindCurrentTab(bad.shell, 'opencli', 'workbench');

    expect(bound.ok).toBe(false);
    expect(bound.reason).toContain('扩展没连上');
    expect(bad.lines[0]).toContain("'browser' 'workbench' 'bind'");
    expect(bad.lines[0]).toContain('OPENCLI_WINDOW=background');

    const good = fakeShell([
      { stdout: JSON.stringify({ session: 'workbench', url: 'http://127.0.0.1:3081/', title: '工作台' }) },
    ]);
    expect(await bindCurrentTab(good.shell, 'opencli', 'workbench')).toMatchObject({
      ok: true,
      url: 'http://127.0.0.1:3081/',
      title: '工作台',
    });
  });

  it('★★ 已经绑着工作台就**不再 bind**（只有本次会话第一次要用户把工作台切到前台）', async () => {
    const rig = fakeShell([
      { stdout: JSON.stringify({ plugin: '@dsh-workbench/core', pid: 1, url: 'u', title: 't' }) },
    ]);
    const handshake = await readyPageOf(rig.shell, 'opencli', 'workbench');

    expect(handshake.ok).toBe(true);
    expect(handshake.bound).toBe(false);
    expect(rig.lines).toHaveLength(1);
    expect(rig.lines[0]).toContain("'eval'");
  });

  it('★ 没绑着（会话是个 about:blank 空目标）才 bind，绑完再认一次那一页', async () => {
    const rig = fakeShell([
      { stdout: JSON.stringify({ plugin: null, pid: null, url: 'about:blank', title: '' }) },
      { stdout: JSON.stringify({ session: 'workbench', url: 'http://127.0.0.1:3081/', title: '工作台' }) },
      { stdout: JSON.stringify({ plugin: '@dsh-workbench/core', pid: 1, url: 'http://127.0.0.1:3081/', title: '工作台' }) },
    ]);
    const handshake = await readyPageOf(rig.shell, 'opencli', 'workbench');

    expect(handshake).toMatchObject({ ok: true, bound: true });
    expect(rig.lines[1]).toContain("'bind'");
  });

  it('★ 建截图目录走 shell（套件不许自己 import node:fs —— arch S67）', async () => {
    const rig = fakeShell([{ stdout: 'ok' }]);

    expect(await writeShotsDir(rig.shell, '/w/demo/shots')).toBe(true);
    expect(rig.lines[0]).toBe("'mkdir' '-p' '/w/demo/shots'");
  });

  it('★ 卡锚点是外壳盖的那一个（模块自己写的卡壳也认）', () => {
    expect(cardSelectorOf('demo')).toBe('#wb-card-demo');
  });
});
