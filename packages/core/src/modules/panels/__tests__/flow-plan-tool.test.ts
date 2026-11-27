import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import { README_SECTION_KEYS, SHOT_KINDS } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW, PLAN_DRAFT_PROPERTIES } from '../model/flow/definitions';
import { registerDiyPlanTool } from '../model/flow/plan-tool';
import { createDiyFlowRuns } from '../model/flow/runs';

const CARD = { kind: 'card', caption: '库存卡片', ascii: '库存 8 件' } as const;
const APPROVAL = {
  object: '库存阈值',
  change: '从 10 改成 20',
  target: '库存模块设置',
  impact: '只影响当前项目',
} as const;
const APPROVAL_SHOT = { kind: 'approval', caption: '审批屏 · 修改阈值', ascii: '库存阈值 10 → 20' } as const;

async function atPlan(runs: ReturnType<typeof rig>['runs']): Promise<void> {
  runs.start('s-1', { destination: 'board', summary: '盯库存' });
  runs.provide('s-1', { sites: [] });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function rig() {
  const registered: DshToolDefinition[] = [];
  const ctx = {
    get: (name: string) =>
      name === 'tools'
        ? {
            register: (tool: DshToolDefinition) => {
              registered.push(tool);
              return () => {};
            },
          }
        : undefined,
    logger: undefined,
  } as unknown as DshHostContext;
  const runs = createDiyFlowRuns({
    host: createFlowHost(),
    flow: DIY_BOARD_FLOW,
    onEnd: () => {},
  });
  registerDiyPlanTool(ctx, runs);
  const exec = { agent: { session: { id: 's-1' } } } as unknown as DshToolRunContext;
  return { tool: registered[0], runs, exec };
}

describe('计划工具', () => {
  it('★★ 判成看板：第一次只交去向，停在查看数据来源', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    const out = (await tool.execute(
      { destination: 'board', summary: '盯库存低于 10 的' },
      exec,
    )) as { step: string; done: boolean; text: string };

    expect(out.step).toBe('probe');
    expect(out.done).toBe(false);
    expect(out.text).toContain('查看数据来源');
    expect(out.text).toContain('第 1/6 步');
  });

  it('★★ 还没到确认方案就带方案：当场拒，并说清先交什么', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(
      tool.execute(
        { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] },
        exec,
      ),
    ).rejects.toThrow(/现在还没到「确认方案」/);
  });

  it('★ 方案里留空的一条当场拒，不静默吞掉', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    runs.start('s-1', { destination: 'board', summary: '盯库存' });
    runs.provide('s-1', { sites: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(
      tool.execute(
        {
          destination: 'board',
          summary: '盯库存',
          see: ['一眼', '  '],
          do: ['一点'],
          agent: ['一件'],
          data: ['一处'],
        },
        exec,
      ),
    ).rejects.toThrow(/invalid plan: see\[1\]/);
  });

  it('★★ 方案四段与字符画都从模块 readme 的接口约定来，不另立一套', () => {
    const properties = PLAN_DRAFT_PROPERTIES as Record<string, { items?: { properties?: Record<string, unknown> } }>;

    for (const key of README_SECTION_KEYS) {
      expect(properties[key], key).toBeDefined();
    }
    const kind = properties['shots']?.items?.properties?.['kind'] as { enum?: readonly string[] } | undefined;
    expect(kind?.enum).toEqual([...SHOT_KINDS]);
  });

  it('★★ 描述与三个去向一致，不再保留禁止调用的旧去向', () => {
    const { tool } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    const properties = tool.parameters['properties'] as Record<string, { enum?: readonly string[] }>;

    expect(properties['destination']?.enum).toEqual(['board', 'headless', 'tweak']);
    for (const text of ['一次性', '现成', '只是提问']) expect(tool.description).not.toContain(text);
    expect(tool.description).toContain('restart: true');
  });

  it('★ 字符画的 kind 只认接口约定里的值', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await atPlan(runs);

    await expect(
      tool.execute(
        {
          destination: 'board',
          summary: '盯库存',
          see: ['一眼'],
          do: ['一点'],
          agent: ['一件'],
          data: ['一处'],
          shots: [{ kind: 'bogus', caption: '卡片', ascii: '┌─┐' }],
        },
        exec,
      ),
    ).rejects.toThrow(/shots\[0\]\.kind/);
  });

  it('★ 字符画没图注或没内容都当场拒', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await atPlan(runs);

    await expect(
      tool.execute(
        {
          destination: 'board',
          summary: '盯库存',
          see: ['一眼'],
          do: ['一点'],
          agent: ['一件'],
          data: ['一处'],
          shots: [{ caption: '卡片', ascii: '   ' }],
        },
        exec,
      ),
    ).rejects.toThrow(/shots\[0\]\.ascii/);
  });

  it('★ 回话带上第几步、还剩几步', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    const out = (await tool.execute(
      { destination: 'board', summary: '盯库存' },
      exec,
    )) as { index: number; total: number; remaining: number };

    expect(out.index).toBe(1);
    expect(out.total).toBe(6);
    expect(out.remaining).toBe(5);
  });

  it('★ 一次性与改道不是计划去向：当场拒，不开流程', async () => {
    const { tool, runs, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    for (const destination of ['once', 'ready', 'reroute', 'write-record']) {
      await expect(tool.execute({ destination, summary: '算这个月的数' }, exec)).rejects.toThrow(/去向只能是/);
    }
    expect(runs.stepOf('s-1')).toBeNull();
  });

  it('★ 乱填去向当场拒，不静默', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(tool.execute({ destination: '看板', summary: 'x' }, exec)).rejects.toThrow(/去向只能是/);
  });

  it('★ 缺定义里要求的字段当场拒', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(tool.execute({ destination: 'board' }, exec)).rejects.toThrow(/summary/);
  });

  it('★ 没有会话 id 就拒，不假装推进了', async () => {
    const { tool } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(
      tool.execute({ destination: 'board', summary: 'x' }, {} as unknown as DshToolRunContext),
    ).rejects.toThrow(/没有 id/);
  });
});

describe('改模块：四段只写变化，没变的写「没变」', () => {
  const START = { destination: 'tweak', summary: '把卡片分成三组' } as const;

  it('★★ 改模块第一步就是确认方案：一次交齐直接进创建模块', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    const out = (await tool.execute(
      {
        ...START,
        see: ['修改：卡片从平铺 7 条变成三组'],
        do: ['没变'],
        agent: ['没变'],
        data: ['没变'],
        shots: [{ caption: '改后的分组卡片', ascii: '低库存 / 正常 / 充足' }],
      },
      exec,
    )) as { step: string };

    expect(out.step).toBe('build');
    expect(runs.stepOf('s-1')?.id).toBe('build');
  });

  it('★★ 带类型的条目与「没变」都收，推进到下一步', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await tool.execute(START, exec);

    const out = (await tool.execute(
      {
        ...START,
        see: ['修改：卡片从平铺 7 条变成三组'],
        do: ['新增：点分组标题折叠该组', '删除：整卡刷新按钮'],
        agent: ['没变'],
        data: ['没变'],
        shots: [{ caption: '改后的分组卡片', ascii: '低库存 / 正常 / 充足' }],
      },
      exec,
    )) as { step: string };

    expect(out.step).toBe('build');
  });

  it('★ 条目没写「新增 / 删除 / 修改」当场拒', async () => {
    const { tool } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    const exec = { agent: { session: { id: 's-1' } } } as unknown as DshToolRunContext;
    if (tool === undefined) throw new Error('没有注册上');
    await tool.execute(START, exec);

    await expect(
      tool.execute(
        { ...START, see: ['卡片变成三组'], do: ['没变'], agent: ['没变'], data: ['没变'] },
        exec,
      ),
    ).rejects.toThrow(/要以「新增：」「删除：」「修改：」开头/);
  });

  it('★ 「没变」混在别的条目里当场拒', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await tool.execute(START, exec);

    await expect(
      tool.execute(
        {
          ...START,
          see: ['修改：卡片变成三组', '没变'],
          do: ['没变'],
          agent: ['没变'],
          data: ['没变'],
        },
        exec,
      ),
    ).rejects.toThrow(/只写「没变」一条/);
  });

  it('★ 四段全是「没变」当场拒：这次根本没改东西', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await tool.execute(START, exec);

    await expect(
      tool.execute({ ...START, see: ['没变'], do: ['没变'], agent: ['没变'], data: ['没变'] }, exec),
    ).rejects.toThrow(/没有任何改动/);
  });
  it('★ 四段提到审批屏却没给 approval 图，当场拒', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await tool.execute(START, exec);

    await expect(
      tool.execute(
        {
          ...START,
          see: ['修改：审批屏 多一行「模式」'],
          do: ['没变'],
          agent: ['新增：审批后修改模式'],
          data: ['没变'],
          shots: [{ caption: '改后的卡片', ascii: '模式：自动' }],
          approval: APPROVAL,
        },
        exec,
      ),
    ).rejects.toThrow(/kind: "approval"/);
  });

  it('★ 给了 approval 图却没写审批屏，也当场拒', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await tool.execute(START, exec);

    await expect(
      tool.execute(
        {
          ...START,
          see: ['修改：卡片从平铺变成三组'],
          do: ['没变'],
          agent: ['没变'],
          data: ['没变'],
          shots: [{ caption: '改后的卡片', ascii: '三组卡片' }, APPROVAL_SHOT],
        },
        exec,
      ),
    ).rejects.toThrow(/四段没写需要审批的写工具/);
  });
});

describe('方案基线与表现约束', () => {
  it('★ 几格 / 几步 / 多久不再收，提示删掉', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    for (const key of ['cells', 'steps', 'minutes']) {
      await expect(tool.execute({ destination: 'board', summary: '盯库存', [key]: '3' }, exec)).rejects.toThrow(
        new RegExp(`${key} 没有消费者；删掉`),
      );
      expect(PLAN_DRAFT_PROPERTIES[key]).toBeUndefined();
    }
  });

  it('★★ 看板零图与只有审批图都拒绝', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    const plan = {
      destination: 'board',
      summary: '盯库存',
      see: ['库存低于阈值'],
      do: ['点卡片看明细'],
      agent: ['审批后修改阈值'],
      data: ['库存表'],
      approval: APPROVAL,
    };
    await atPlan(runs);
    await expect(tool.execute(plan, exec)).rejects.toThrow(/给一张卡片图/);
    await expect(tool.execute({ ...plan, shots: [APPROVAL_SHOT] }, exec)).rejects.toThrow(/给一张卡片图/);
  });

  it('★★ 改模块零图拒绝', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(
      tool.execute(
        {
          destination: 'tweak',
          summary: '库存阈值改成 20',
          see: ['修改：阈值改成 20'],
          do: ['没变'],
          agent: ['没变'],
          data: ['没变'],
        },
        exec,
      ),
    ).rejects.toThrow(/给一张改之后的图/);
  });

  it('★★ 无看板零图通过，四段用输出 / 触发 / 批准 / 数据', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    runs.start('s-1', { destination: 'headless', summary: '查库存' });
    runs.provide('s-1', { sites: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(
      tool.execute({ destination: 'headless', summary: '查库存', do: ['定时触发'], agent: ['只读'], data: ['库存表'] }, exec),
    ).rejects.toThrow(/缺少 see（输出）/);
    const out = (await tool.execute(
      {
        destination: 'headless',
        summary: '查库存',
        see: ['返回低库存清单'],
        do: ['定时触发'],
        agent: ['无需批准，只读'],
        data: ['库存表'],
      },
      exec,
    )) as { step: string };
    expect(out.step).toBe('build');
  });

  it('★★ 写工具缺四格、审批图或图注不清都拒绝', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await atPlan(runs);
    const plan = {
      destination: 'board',
      summary: '盯库存',
      see: ['库存低于阈值'],
      do: ['点卡片看明细'],
      agent: ['审批后修改阈值'],
      data: ['库存表'],
      shots: [CARD, APPROVAL_SHOT],
    };

    await expect(tool.execute({ ...plan, approval: { ...APPROVAL, impact: '' } }, exec)).rejects.toThrow(/审批四格缺少 impact/);
    await expect(tool.execute({ ...plan, shots: [CARD], approval: APPROVAL }, exec)).rejects.toThrow(/kind: "approval"/);
    await expect(
      tool.execute(
        { ...plan, approval: APPROVAL, shots: [CARD, { ...APPROVAL_SHOT, caption: '卡片改后' }] },
        exec,
      ),
    ).rejects.toThrow(/图注要写清「审批屏」/);
  });

  it('★★ 批准后能读回完整基线', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await atPlan(runs);

    const out = (await tool.execute(
      {
        destination: 'board',
        summary: '盯库存',
        see: ['库存低于阈值'],
        do: ['点卡片看明细'],
        agent: ['审批后修改阈值'],
        data: ['库存表'],
        shots: [CARD, APPROVAL_SHOT],
        approval: APPROVAL,
      },
      exec,
    )) as {
      step: string;
      baseline: {
        available: boolean;
        summary: string;
        see: readonly string[];
        do: readonly string[];
        agent: readonly string[];
        data: readonly string[];
        shots: readonly unknown[];
        approval: unknown;
      };
    };

    expect(out.step).toBe('build');
    expect(out.baseline).toMatchObject({
      available: true,
      summary: '盯库存',
      see: ['库存低于阈值'],
      do: ['点卡片看明细'],
      agent: ['审批后修改阈值'],
      data: ['库存表'],
      shots: [CARD, APPROVAL_SHOT],
      approval: APPROVAL,
    });
  });

  it('★★ 工具层也锁定去向，并要求显式重启', async () => {
    const { tool, exec, runs } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    await tool.execute({ destination: 'board', summary: '第一版' }, exec);

    await expect(tool.execute({ destination: 'tweak', summary: '第一版' }, exec)).rejects.toThrow(/去向已锁定/);
    await expect(tool.execute({ destination: 'board', summary: '第二版' }, exec)).rejects.toThrow(/restart: true/);
    expect(runs.stepOf('s-1')?.id).toBe('probe');

    const out = (await tool.execute({ destination: 'board', summary: '第二版', restart: true }, exec)) as {
      restarted: boolean;
      step: string;
      text: string;
    };
    expect(out).toMatchObject({ restarted: true, step: 'probe' });
    expect(out.text).toContain('从头来');
  });
});
