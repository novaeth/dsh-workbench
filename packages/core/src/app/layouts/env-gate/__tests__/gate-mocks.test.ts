import { describe, expect, it } from 'vitest';
import { zh } from '@dsh-workbench/shared';
import { gateActionOf } from '../boot-gate';
import { bridgeAdvice, failedStepText, gateHintOf, guidanceTextOf, stepDetailText } from '../gate-text';
import { GATE_MOCKS } from '../gate-mock';

const t = ((key: string) => (zh as Record<string, string>)[key] ?? key) as never;

describe('GATE_MOCKS', () => {
  it('id、按钮字、那句人话都不重复且不为空', () => {
    const ids = GATE_MOCKS.map((item) => item.id);
    const labels = GATE_MOCKS.map((item) => item.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const item of GATE_MOCKS) expect(item.note.trim(), item.id).not.toBe('');
  });

  it('★ 顶上那句与这一帧对上（检查 / 在装什么 / 失败 / 按住）', () => {
    const HINT_KEY = {
      checking: 'env.checking',
      installing: 'env.installing',
      installingToolchain: 'env.installingToolchain',
      failed: 'env.failed',
    } as const;
    const zhText = (key: string): string => (zh as Record<string, string>)[key] ?? key;

    for (const item of GATE_MOCKS) {
      const holding = item.snapshot.phase === 'ready' && gateActionOf(item.snapshot) === 'hold';
      expect(item.expect.hint === 'hold', item.id).toBe(holding);
      const expected =
        item.expect.hint === 'hold'
          ? (item.snapshot.bridgeIssues?.length ?? 0) > 0
            ? 'env.bridge.hold'
            : 'env.diy.hold'
          : HINT_KEY[item.expect.hint];

      expect(gateHintOf(item.snapshot, t), item.id).toBe(zhText(expected));
    }
  });

  it('★ 桥接坏了 / DIY 挂不起来的那几档：门停在原地（就绪即撤会把「怎么解决」一起丢掉）', () => {
    for (const item of GATE_MOCKS) {
      if (item.snapshot.phase !== 'ready') continue;
      const issues = item.snapshot.bridgeIssues ?? [];
      const stuck = issues.length > 0 || item.snapshot.diyGap !== undefined;

      expect(gateActionOf(item.snapshot), item.id).toBe(stuck ? 'hold' : 'close');
    }
  });

  it('★ 失败态必须给得起"怎么解决"：error + failure + guidance 三件都在', () => {
    for (const item of GATE_MOCKS) {
      if (item.snapshot.phase !== 'failed') continue;

      expect(item.snapshot.error, item.id).toBeTruthy();
      expect(item.snapshot.failure, item.id).toBeTruthy();
      expect(item.snapshot.guidance, item.id).toBe(item.expect.guidance);
      expect(
        item.snapshot.steps.some((step) => step.status === 'failed'),
        item.id,
      ).toBe(true);
    }
  });

  it('★ "给确切命令"只在 `install` 那档：`path` / `shell` / `host` 不给（照做也没用）', () => {
    for (const item of GATE_MOCKS) {
      const failed = item.snapshot.steps.find((step) => step.status === 'failed');
      const hasCommand = failed?.command !== undefined;
      if (item.expect.guidance === 'install') {
        expect(hasCommand, item.id).toBe(true);
        expect(item.expect.command, item.id).toBe(true);
      }
      if (item.expect.guidance === 'path' || item.expect.guidance === 'shell' || item.expect.guidance === 'host') {
        expect(item.expect.command, item.id).toBe(false);
      }
      if (item.snapshot.phase !== 'failed') expect(hasCommand, item.id).toBe(false);
    }
  });

  it('★ 命令没返回那档：说的是"退干净、清残留、再打开"，不是让人重装工具', () => {
    const t = (key: string): string => key;

    expect(guidanceTextOf('host', t)).toEqual({ why: 'env.fix.whyHost', step: 'env.fix.stepHost' });
    expect(guidanceTextOf(undefined, t)).toEqual({ why: 'env.fix.why', step: 'env.fix.step' });
    expect(failedStepText('host', t)).toBe('env.stepFailed.host');

    const host = GATE_MOCKS.find((item) => item.id === 'failed-host');
    expect(stepDetailText(host?.snapshot.steps[0] as never, host?.snapshot as never, t)).toBe(
      'env.stepFailed.host',
    );
    expect(zh['env.fix.stepHost']).toContain('完全退出');
    expect(zh['env.fix.whyHost']).not.toContain('装不上');
  });

  it('★ 覆盖了真机上难造的那几档：安装中、装不上、装了找不到、执行缝坏、命令没返回、浏览器通道三种坏法', () => {
    const ids = GATE_MOCKS.map((item) => item.id);

    for (const id of [
      'installing',
      'failed-permission',
      'failed-network',
      'failed-path',
      'failed-shell',
      'failed-host',
      'warn-extension',
      'warn-daemon',
      'warn-profile',
      'warn-diy',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('★ DIY 那一档必须给得起修法：挂不起来的行 + 升级命令 + 原文都在', () => {
    const diy = GATE_MOCKS.find((item) => item.id === 'warn-diy');

    expect(diy, 'warn-diy').toBeDefined();
    const gap = diy?.snapshot.diyGap;
    expect(gap?.rows).toEqual(['tool-schedule']);
    expect(gap?.command).toBe('npm i -g @deepseek-ai/dsh@latest');
    expect(gap?.detail ?? '').toContain('never started');
    for (const item of GATE_MOCKS) {
      const step = item.snapshot.steps.find((one) => one.id === 'diy');
      if (step?.status !== 'warn') continue;
      expect(item.snapshot.diyGap, item.id).toBeDefined();
      expect(item.snapshot.diyGap?.command, item.id).toBe(step.command);
    }
  });

  it('★ 浏览器通道不是 ok 时：既有一句人话可念、也有原文可看（不许只摆一句 CLI 英文）', () => {
    const bridgeOf = (item: (typeof GATE_MOCKS)[number]) =>
      item.snapshot.steps.find((step) => step.id === 'bridge');

    for (const item of GATE_MOCKS) {
      const bridge = bridgeOf(item);
      const broken = bridge !== undefined && bridge.status === 'warn';

      if (!broken) {
        expect(item.snapshot.bridgeIssues, item.id).toBeUndefined();
        continue;
      }

      const issues = item.snapshot.bridgeIssues ?? [];
      expect(issues.length, item.id).toBeGreaterThan(0);
      expect(issues, item.id).toEqual(item.expect.bridgeIssues);
      for (const issue of issues) expect(bridgeAdvice(issue, t).text.length, `${item.id}/${issue}`).toBeGreaterThan(0);
      expect(bridge.detail ?? '', item.id).not.toBe('');
    }
  });

  it('★ 档案给了修法就用档案的（连不上的那一步，话和链接都跟着运行时走）', () => {
    const fixes = {
      extension: {
        text: { zh: '扩展没连上', en: 'extension not connected' },
        link: { label: { zh: '去装', en: 'install' }, href: 'https://example.com/extension' },
      },
    };

    const extension = bridgeAdvice('extension', t, fixes);

    expect(extension.text).toBe('扩展没连上');
    expect(extension.link?.href).toBe('https://example.com/extension');
    expect(extension.link?.label).toBe('去装');
    for (const issue of ['daemon', 'profile', 'stale', 'unknown'] as const) {
      expect(bridgeAdvice(issue, t, fixes).link, issue).toBeUndefined();
    }
    expect(bridgeAdvice('daemon', t).text).toBe(zh['env.bridge.unknown']);
  });

  it('★ 通道坏了时给的是"怎么修"，不是再诊一次（`doctor` 已经诊过了）', () => {
    for (const item of GATE_MOCKS) {
      const bridge = item.snapshot.steps.find((step) => step.id === 'bridge');
      if (bridge?.status !== 'warn') continue;
      if (item.snapshot.canWakeBrowser === true) {
        expect(bridge.command, item.id).toBeUndefined();
        continue;
      }

      expect(bridge.command, item.id).toBeDefined();
      expect(bridge.command ?? '', item.id).not.toContain('doctor');
    }
  });

  it('★ 步骤行那句话是**客户端说的**：通道是好的时候不许把 CLI 的英文原文摆上台面', () => {
    const t = (key: string): string => key;
    const ok = GATE_MOCKS.find((item) => item.id === 'ready');
    const bridge = ok?.snapshot.steps.find((step) => step.id === 'bridge');

    expect(bridge, 'ready').toBeDefined();
    expect(bridge === undefined ? '' : stepDetailText(bridge, ok?.snapshot as never, t)).toBe('env.bridge.ok');
  });

  it('★ 版本号不上台面：工具链与后台工具那两行只说人话，原文留给折叠区', () => {
    const t = (key: string): string => key;
    const snapshot = GATE_MOCKS.find((item) => item.id === 'ready')?.snapshot as never;
    const toolchain = { id: 'toolchain', status: 'ok', detail: 'node v24.21.0 · npm 11.12.1 · pnpm 11.21.0' };
    const opencli = { id: 'cli', status: 'ok', detail: '1.8.8' };

    expect(stepDetailText(toolchain as never, snapshot, t)).toBe('env.toolchain.ok');
    expect(stepDetailText(opencli as never, snapshot, t)).toBe('env.runtime.ok');
    for (const step of [toolchain, opencli]) {
      expect(stepDetailText(step as never, snapshot, t), step.id).not.toMatch(/\d+\.\d+/);
    }
  });

  it('★ 还在跑的那一行留空：转圈就是它在说"在做"，不叠一行技术细节', () => {
    const t = (key: string): string => key;
    const snapshot = GATE_MOCKS.find((item) => item.id === 'checking')?.snapshot as never;
    const running = { id: 'cli', status: 'running' };

    expect(stepDetailText(running as never, snapshot, t)).toBe('');
  });

  it('只有 opencli 缺失才是拦路的：bridge 那步再怎么缺也只到 warn', () => {
    for (const item of GATE_MOCKS) {
      const bridge = item.snapshot.steps.find((step) => step.id === 'bridge');
      if (bridge === undefined) continue;
      expect(['pending', 'running', 'ok', 'warn'], item.id).toContain(bridge.status);
    }
  });
});
