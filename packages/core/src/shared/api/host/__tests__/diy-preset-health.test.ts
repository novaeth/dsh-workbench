import { describe, expect, it } from 'vitest';
import {
  brokenRowsOf,
  createDiyPresetProbe,
  diyPresetVerdictOf,
} from '@dsh-workbench/adapters-default';
import { createPreflight } from '@dsh-workbench/adapters-default';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { ALL_OK } from './preflight-cases';

const HEALTHY = [
  { id: 'standard', name: '标准' },
  { id: 'workbench-diy', name: '工作台 DIY 模式' },
];

const BROKEN = [
  { id: 'standard' },
  { id: 'workbench-diy', name: '工作台 DIY 模式', broken: 'tool-schedule (@deepseek-ai/dsh-tool-schedule): never started' },
];

describe('diyPresetVerdictOf（这一代 dsh 上 DIY 模式挂不挂得起来）', () => {
  it('名册还空着 → 不知道（不拿"没跑完"当故障）', () => {
    expect(diyPresetVerdictOf([])).toBeUndefined();
  });

  it('那一行在、也没 broken → 可用', () => {
    expect(diyPresetVerdictOf(HEALTHY)).toEqual({ ok: true, rows: [], detail: '' });
  });

  it('★ broken → 挂不起来：行名与原文都带上（这就是 0.2.0-rc.2 上「工作台 DIY 模式」整个不见的那一帧）', () => {
    const verdict = diyPresetVerdictOf(BROKEN);

    expect(verdict?.ok).toBe(false);
    expect(verdict?.rows).toEqual(['tool-schedule']);
    expect(verdict?.detail).toContain('never started');
  });

  it('名册里根本没有那一行 → 也报（多半是 bundle 的 preset 补丁没生效）', () => {
    const verdict = diyPresetVerdictOf([{ id: 'standard' }, { id: 'minimal' }]);

    expect(verdict?.ok).toBe(false);
    expect(verdict?.rows).toEqual([]);
    expect(verdict?.detail).toContain('workbench-diy');
  });

  it('broken 多行时一行一个行名；空 broken 不当故障', () => {
    expect(brokenRowsOf('a (@x/a): never started\nb (@x/b): never started')).toEqual(['a', 'b']);
    expect(brokenRowsOf('')).toEqual([]);
    expect(diyPresetVerdictOf([{ id: 'workbench-diy', broken: '   ' }])?.ok).toBe(true);
  });
});

describe('createDiyPresetProbe（名册登记得慢，探针自己等）', () => {
  it('头几拍还空着，等到了就给结论', async () => {
    let calls = 0;
    const ctx = {
      get: () =>
        ({
          list: async () => (++calls < 3 ? [] : HEALTHY),
        }) as never,
    };
    const probe = createDiyPresetProbe(ctx as never, { deadlineMs: 2_000, everyMs: 1 });

    expect(await probe()).toEqual({ ok: true, rows: [], detail: '' });
    expect(calls).toBe(3);
  });

  it('一直没有那一行 → 到点放弃，回 undefined（不报故障）', async () => {
    const ctx = { get: () => ({ list: async () => [] }) as never };
    const probe = createDiyPresetProbe(ctx as never, { deadlineMs: 5, everyMs: 1 });

    expect(await probe()).toBeUndefined();
  });

  it('没有 agentPresets 服务 / list 抛错 → 都回 undefined，不冒泡', async () => {
    expect(await createDiyPresetProbe({ get: () => undefined } as never)()).toBeUndefined();

    const throwing = { get: () => ({ list: async () => { throw new Error('boom'); } }) as never };
    expect(await createDiyPresetProbe(throwing as never)()).toBeUndefined();
  });
});

describe('启动体检把 DIY 那一行接进来', () => {
  it('★ 挂不起来 → 步骤行是 warn、快照带 diyGap（客户端据此停在原地）', async () => {
    const { fake, preflight } = buildPreflight(async () => diyPresetVerdictOf(BROKEN));
    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps.map((item) => `${item.id}=${item.status}`)).toEqual([
      'opencli=ok',
      'bridge=ok',
      'diy=warn',
    ]);
    expect(snapshot.diyGap?.rows).toEqual(['tool-schedule']);
    expect(snapshot.diyGap?.command).toBe('npm i -g @deepseek-ai/dsh@latest');
    expect(fake.calls.map((call) => call.command)).toEqual(['opencli --version', 'opencli doctor']);
  });

  it('挂得起来 → 步骤行 ok、不带 gap（门照常放行）', async () => {
    const { preflight } = buildPreflight(async () => diyPresetVerdictOf(HEALTHY));
    const snapshot = await preflight.run();

    expect(snapshot.steps.find((item) => item.id === 'diy')?.status).toBe('ok');
    expect(snapshot.diyGap).toBeUndefined();
  });

  it('探针读不到 → 索性不摆那一行（不声称可用、也不报故障）', async () => {
    const { preflight } = buildPreflight(async () => undefined);
    const snapshot = await preflight.run();

    expect(snapshot.steps.some((item) => item.id === 'diy')).toBe(false);
    expect(snapshot.diyGap).toBeUndefined();
  });
});

function buildPreflight(probe: () => Promise<ReturnType<typeof diyPresetVerdictOf>>) {
  const fake = createFakeShell(ALL_OK.map((step) => ({ ...step })));
  const preflight = createPreflight({ shell: fake.shell, probeDiy: probe });
  return { fake, preflight };
}
