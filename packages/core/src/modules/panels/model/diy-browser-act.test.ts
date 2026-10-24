import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { ACT_TIMEOUT_MS, SWEEP_TIMEOUT_MS, actBrowser, actErrorOf, stopNetworkExact, type ActStep } from './diy-browser-act';

interface Step {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
}

function fakeShell(steps: readonly Step[]) {
  const lines: string[] = [];
  const timeouts: (number | undefined)[] = [];
  let index = 0;
  const shell = {
    resolve(request: { command: string; timeoutMs?: number }) {
      lines.push(request.command);
      timeouts.push(request.timeoutMs);
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
  return { shell: shell as unknown as DshShell, lines, timeouts };
}

function step(payload: Record<string, unknown> | undefined, extra: Partial<ActStep> = {}): ActStep {
  return { ok: true, stdout: '', stderr: '', exitCode: 0, timedOut: false, truncated: false, payload, ...extra };
}

describe('actBrowser：把子命令原样挂到 opencli browser <会话> 上', () => {
  it('★★ 参数各自引号、背景前缀与 --window background 都带上，超时默认 15 秒', async () => {
    const rig = fakeShell([{ stdout: 'noise {"clicked":true} tail' }]);
    const got = await actBrowser(rig.shell, 'opencli', 'workbench', ['click', '.wb-cardOpen']);

    expect(rig.lines[0]).toBe(
      "'env' 'OPENCLI_WINDOW=background' 'opencli' 'browser' 'workbench' 'click' '.wb-cardOpen' '--window' 'background'",
    );
    expect(rig.timeouts[0]).toBe(ACT_TIMEOUT_MS);
    expect(got.ok).toBe(true);
    expect(got.payload?.['clicked']).toBe(true);
    expect(got.truncated).toBe(false);
  });

  it('★ 超时可传；抠不出 JSON 时 payload 是 undefined（不假装读到）', async () => {
    const rig = fakeShell([{ stdout: '没有什么 JSON' }, { stdout: '{"matches_n":2}' }]);
    const first = await actBrowser(rig.shell, 'opencli', 'workbench', ['state'], 1234);
    const second = await actBrowser(rig.shell, 'opencli', 'workbench', ['find', '.a']);

    expect(rig.timeouts[0]).toBe(1234);
    expect(first.payload).toBeUndefined();
    expect(second.payload?.['matches_n']).toBe(2);
  });

  it('★ truncated / exitCode 原样跟着回来', async () => {
    const rig = fakeShell([{ stdout: 'x', stderr: 'boom', exitCode: 3, truncated: true }]);
    const got = await actBrowser(rig.shell, 'opencli', 'workbench', ['state']);

    expect(got.ok).toBe(false);
    expect(got.exitCode).toBe(3);
    expect(got.truncated).toBe(true);
    expect(got.stderr).toBe('boom');
  });
});

describe('actErrorOf：四档话术，先超时、再 opencli 的 error 信封', () => {
  it('★★ 超时那句带秒数', () => {
    expect(actErrorOf(step(undefined, { ok: false, timedOut: true }))).toBe(
      `opencli 没在 ${String(ACT_TIMEOUT_MS / 1000)} 秒内回来`,
    );
  });

  it('★★ payload 里的 error.message 优先（哪怕 ok 是 true）', () => {
    expect(actErrorOf(step({ error: { message: 'bound_tab_mutation_blocked' } }))).toBe(
      'bound_tab_mutation_blocked',
    );
    expect(actErrorOf(step({ error: { message: '   ' } }, { ok: false, stderr: 'boom' }))).toBe('boom');
    expect(actErrorOf(step({ error: '不是对象' }, { ok: false, stderr: 'boom' }))).toBe('boom');
  });

  it('★ 成功且没有信封就没有错；否则 stderr → stdout → 兜底那句', () => {
    expect(actErrorOf(step({ ok: true }))).toBe('');
    expect(actErrorOf(step(undefined, { ok: false, stderr: 'boom' }))).toBe('boom');
    expect(actErrorOf(step(undefined, { ok: false, stdout: 'out' }))).toBe('out');
    expect(actErrorOf(step(undefined, { ok: false }))).toBe('opencli 报了个错');
  });
});

describe('stopNetworkExact：按文件精确收掉跟随者', () => {
  it('★★ 一条 shell 行里先读 pid/reaper，再 kill 与 pkill，最后只在 pid 没漂时删掉那两只 pid 文件 —— **数据文件一个字节都不删**', async () => {
    const rig = fakeShell([{ stdout: '' }]);
    const ok = await stopNetworkExact(rig.shell, '/w/net.jsonl');

    expect(ok).toBe(true);
    expect(rig.lines[0]).toContain(`p="$(cat '/w/net.jsonl.pid' 2>/dev/null)"`);
    expect(rig.lines[0]).toContain(`r="$(cat '/w/net.jsonl.reaper' 2>/dev/null)"`);
    expect(rig.lines[0]).toContain('[ -n "$p" ] && kill "$p"');
    expect(rig.lines[0]).toContain('[ -n "$r" ] && pkill -P "$r"');
    expect(rig.lines[0]).toContain('[ -n "$r" ] && kill "$r"');
    expect(rig.lines[0]).toContain(`rm -f '/w/net.jsonl.pid' '/w/net.jsonl.reaper'`);
    expect(rig.lines[0]).not.toContain(`rm -f '/w/net.jsonl' `);
    expect(rig.lines[0]).not.toContain(`'/w/net.jsonl' '/w/net.jsonl.pid'`);
    expect(rig.lines[0].endsWith('; true')).toBe(true);
    expect(rig.timeouts[0]).toBe(SWEEP_TIMEOUT_MS);
  });

  it('★ 非 0 退出就是没成；超时可传', async () => {
    const rig = fakeShell([{ exitCode: 1 }, { exitCode: 0 }]);
    const failed = await stopNetworkExact(rig.shell, '/w/net.jsonl', 999);
    const passed = await stopNetworkExact(rig.shell, '/w/net.jsonl');

    expect(failed).toBe(false);
    expect(rig.timeouts[0]).toBe(999);
    expect(passed).toBe(true);
    expect(rig.timeouts[1]).toBe(SWEEP_TIMEOUT_MS);
  });
});
