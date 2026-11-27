import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFlowHost, README_SOURCE_FILE } from '@dsh-workbench/shared/host';
import type { DshToolRunContext } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { createDiyFlowRuns } from '../model/flow/runs';
import { registerDiyStepTool } from '../model/flow/step-tool';

const exec = { agent: { session: { id: 's-1' } } } as unknown as DshToolRunContext;
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const BASELINE = {
  baseline: true,
  see: ['库存 低于 10'],
  do: ['刷新'],
  agent: ['读取库存'],
  data: ['库存表'],
};

function rig(moduleDirectoryOf?: (unit: string) => Promise<string | null>) {
  const runs = createDiyFlowRuns({
    host: createFlowHost(),
    flow: DIY_BOARD_FLOW,
    onEnd: () => {},
  });
  const registered: unknown[] = [];
  const ctx = {
    get: (key: string) => (key === 'tools' ? { register: (tool: unknown) => { registered.push(tool); return () => {}; } } : undefined),
  } as never;
  registerDiyStepTool(ctx, runs, moduleDirectoryOf);
  return { runs, tool: registered[0] as { execute: (raw: unknown, exec: DshToolRunContext) => Promise<unknown> } };
}

async function atLedger(
  runs: ReturnType<typeof createDiyFlowRuns>,
  plan: Record<string, unknown> = BASELINE,
): Promise<void> {
  runs.start('s-1', { destination: 'headless', summary: '加个查库存的工具' });
  for (const value of [
    { sites: [] },
    plan,
    { unit: 'stock-tool' },
    { unit: 'stock-tool', installed: true },
    { passed: [], unverified: [] },
  ]) {
    runs.provide('s-1', value);
    await tick();
  }
}

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'wb-plan-ledger-'));
}

function writeReadme(dir: string, value: Record<string, unknown>): void {
  writeFileSync(join(dir, README_SOURCE_FILE), JSON.stringify(value));
}

describe('流程递交工具', () => {
  it('★★ 站探那步把站点递上去，流程走到确认方案', async () => {
    const { runs, tool } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    runs.start('s-1', { destination: 'board', summary: '盯库存' });

    const out = (await tool.execute({ sites: ['库存表'] }, exec)) as { step: string; text: string };

    expect(out.step).toBe('plan');
    expect(out.text).toContain('确认方案');
    expect(runs.stepOf('s-1')?.id).toBe('plan');
  });

  it('★★ 无看板那两格的名字与面板一致：安装模块 / 检查模块功能', async () => {
    const { runs, tool } = rig();
    runs.start('s-1', { destination: 'headless', summary: '加个查库存的工具' });
    runs.provide('s-1', { sites: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    runs.provide('s-1', { see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const out = (await tool.execute({ unit: 'stock-tool' }, exec)) as { text: string };

    expect(out.text).toContain('安装模块');
    expect(out.text).not.toContain('添加模块到面板');
  });

  it('★★ 无看板候确认方案时不说字符画', async () => {
    const { runs, tool } = rig();
    runs.start('s-1', { destination: 'headless', summary: '加个查库存的工具' });

    const out = (await tool.execute({ sites: [] }, exec)) as { text: string };

    expect(out.text).toContain('输出 / 触发 / 批准 / 数据');
    expect(out.text).not.toContain('字符画');
  });

  it('★ 该递的字段没给就拒，并说清要递什么', async () => {
    const { runs, tool } = rig();
    runs.start('s-1', { destination: 'board', summary: '盯库存' });

    await expect(tool.execute({}, exec)).rejects.toThrow(/sites/);
  });

  it('★ 她改主意了：带原因终止，流程立刻停下', async () => {
    const { runs, tool } = rig();
    runs.start('s-1', { destination: 'board', summary: '盯库存' });

    const out = (await tool.execute({ cancel: true, reason: '她说不做了' }, exec)) as { done: boolean; text: string };

    expect(out.done).toBe(true);
    expect(out.text).toContain('她说不做了');
    expect(runs.stepOf('s-1')).toBeNull();
  });

  it('★★ 旧流程没有基线：最后一步递完仍收尾，并留下宽限说明', async () => {
    const { runs, tool } = rig();
    runs.start('s-1', { destination: 'headless', summary: '加个查库存的工具' });
    runs.provide('s-1', { sites: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    runs.provide('s-1', { see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    runs.provide('s-1', { unit: 'stock-tool' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    runs.provide('s-1', { unit: 'stock-tool', installed: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    runs.provide('s-1', { passed: [], unverified: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const out = (await tool.execute({ design: 'design.json' }, exec)) as {
      step: string;
      done: boolean;
      text: string;
      baseline: { available: boolean };
    };

    expect(out.done).toBe(true);
    expect(out.step).toBe('');
    expect(out.text).toContain('已完成');
    expect(out.text).toContain('本次没有方案基线可比对');
    expect(out.baseline).toEqual({ available: false });
  });

  it('★ 终止不给原因就拒', async () => {
    const { runs, tool } = rig();
    runs.start('s-1', { destination: 'board', summary: '盯库存' });

    await expect(tool.execute({ cancel: true }, exec)).rejects.toThrow(/原因/);
    expect(runs.stepOf('s-1')?.id).toBe('probe');
  });
});

describe('保存设计前比对已批准的方案', () => {
  it('★★ 四段一致就通过：忽略空白、顺序、绑定与图', async () => {
    const dir = temporaryDirectory();
    try {
      writeReadme(dir, {
        see: ['正常库存', ' 库存\n低于   10 '],
        do: [{ text: '刷新', bind: { tool: 'stock_refresh' } }],
        agent: [{ text: '读取库存', bind: { tool: 'stock_read' } }],
        data: ['库存表'],
        shots: [{ caption: '另一张图', ascii: '不参与比对' }],
        install: ['也不参与比对'],
      });
      const { runs, tool } = rig(async () => dir);
      await atLedger(runs, { ...BASELINE, see: ['库存 低于 10', '正常库存'] });

      const out = (await tool.execute({ design: 'design.json' }, exec)) as {
        done: boolean;
        baseline: { available: boolean };
      };
      expect(out.done).toBe(true);
      expect(out.baseline.available).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★★ 某段少一条或改一条：点名该段、第一条差异与两条恢复路径', async () => {
    const dir = temporaryDirectory();
    try {
      writeReadme(dir, { see: ['改成另一句'], do: ['刷新'], agent: ['读取库存'], data: ['库存表'] });
      const { runs, tool } = rig(async () => dir);
      await atLedger(runs);

      await expect(tool.execute({ design: 'design.json' }, exec)).rejects.toThrow(
        /「输出」缺少「库存 低于 10」.*把模块说明改成与已批准的方案一致.*终止流程/,
      );
      expect(runs.stepOf('s-1')?.id).toBe('ledger');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★ 模块说明多出一条也拒绝', async () => {
    const dir = temporaryDirectory();
    try {
      writeReadme(dir, {
        see: ['库存 低于 10'],
        do: ['刷新', '多一个按钮'],
        agent: ['读取库存'],
        data: ['库存表'],
      });
      const { runs, tool } = rig(async () => dir);
      await atLedger(runs);

      await expect(tool.execute({ design: 'design.json' }, exec)).rejects.toThrow(/「触发」多出「多一个按钮」/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★ 找不到模块或读不到说明时不放行', async () => {
    const missing = rig(async () => null);
    await atLedger(missing.runs);
    await expect(missing.tool.execute({ design: 'design.json' }, exec)).rejects.toThrow(/没有模块「stock-tool」/);

    const dir = temporaryDirectory();
    try {
      const unreadable = rig(async () => dir);
      await atLedger(unreadable.runs);
      await expect(unreadable.tool.execute({ design: 'design.json' }, exec)).rejects.toThrow(/读不到模块.*readme\.json/);
      expect(unreadable.runs.stepOf('s-1')?.id).toBe('ledger');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★ 损坏基线按旧流程宽限，不阻塞会话', async () => {
    const { runs, tool } = rig(async () => null);
    await atLedger(runs, { ...BASELINE, see: [] });

    const out = (await tool.execute({ design: 'design.json' }, exec)) as { done: boolean; text: string };
    expect(out.done).toBe(true);
    expect(out.text).toContain('本次没有方案基线可比对');
  });
});
