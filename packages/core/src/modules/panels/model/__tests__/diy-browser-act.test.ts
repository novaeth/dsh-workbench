import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { fakeSeamOf } from '../../__tests__/seam-fake';
import { ACT_TIMEOUT_MS, actBrowser, actErrorOf, type ActStep } from '../diy-browser-act';

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
  return { shell: shell as unknown as DshShell, seam: fakeSeamOf(shell as unknown as DshShell), lines, timeouts };
}

function step(payload: Record<string, unknown> | undefined, extra: Partial<ActStep> = {}): ActStep {
  return { ok: true, stdout: '', stderr: '', exitCode: 0, timedOut: false, truncated: false, payload, ...extra };
}

const backgroundLine = (command: string, argv: readonly string[]): string =>
  [quoteShellArg(command), ...argv.map(quoteShellArg)].join(' ');

describe('actBrowser：把子命令原样挂到 opencli browser <会话> 上', () => {
  it('★★ 参数各自引号、背景前缀与 --window background 都带上，超时默认 15 秒', async () => {
    const rig = fakeShell([{ stdout: 'noise {"clicked":true} tail' }]);
    const got = await actBrowser(rig.seam, 'opencli', 'workbench', ['click', '.wb-cardOpen'], undefined, backgroundLine);

    expect(rig.lines[0]).toBe(
      "'opencli' 'browser' 'workbench' 'click' '.wb-cardOpen' '--window' 'background'",
    );
    expect(rig.timeouts[0]).toBe(ACT_TIMEOUT_MS);
    expect(got.ok).toBe(true);
    expect(got.payload?.['clicked']).toBe(true);
    expect(got.truncated).toBe(false);
  });

  it('★ 超时可传；抠不出 JSON 时 payload 是 undefined（不假装读到）', async () => {
    const rig = fakeShell([{ stdout: '没有什么 JSON' }, { stdout: '{"matches_n":2}' }]);
    const first = await actBrowser(rig.seam, 'opencli', 'workbench', ['state'], 1234, backgroundLine);
    const second = await actBrowser(rig.seam, 'opencli', 'workbench', ['find', '.a'], undefined, backgroundLine);

    expect(rig.timeouts[0]).toBe(1234);
    expect(first.payload).toBeUndefined();
    expect(second.payload?.['matches_n']).toBe(2);
  });

  it('★ truncated / exitCode 原样跟着回来', async () => {
    const rig = fakeShell([{ stdout: 'x', stderr: 'boom', exitCode: 3, truncated: true }]);
    const got = await actBrowser(rig.seam, 'opencli', 'workbench', ['state']);

    expect(got.ok).toBe(false);
    expect(got.exitCode).toBe(3);
    expect(got.truncated).toBe(true);
    expect(got.stderr).toBe('boom');
  });
});

describe('actErrorOf：四档话术，先超时、再 opencli 的 error 信封', () => {
  it('★★ 超时那句带秒数', () => {
    expect(actErrorOf(step(undefined, { ok: false, timedOut: true }))).toBe(
      `运行时没在 ${String(ACT_TIMEOUT_MS / 1000)} 秒内回来`,
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
    expect(actErrorOf(step(undefined, { ok: false }))).toBe('运行时报了个错');
  });
});
