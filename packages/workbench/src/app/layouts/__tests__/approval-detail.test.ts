import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { ApprovalDetail, ApprovalPlan, zh } from '@dsh-workbench/shared';
import { recordApprovalRows, shellApprovalDetail, shellClaimsApprovalDetail } from '../approval-detail';
import { ALL_TOOLS, DIY_RECORD_PREPARE_TOOL, DIY_RECORD_READ_TOOL } from '@/modules/panels/client';

const HERE = new URL('../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, HERE), 'utf8');
const code = (text: string): string => text.replace(/\/\*\*[\s\S]*?\*\//g, '');

const SITE = 'https://example.com/env';
const OTHER_SHELL = ALL_TOOLS.find((name) => name !== DIY_RECORD_PREPARE_TOOL) ?? '';

const t: Translate = (key, params) => {
  const template = (zh as Record<string, string>)[key] ?? key;
  return Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    template,
  );
};

interface PlanView {
  readonly type: unknown;
  readonly props: {
    readonly rows: readonly { readonly label: string; readonly value: string }[];
    readonly warn?: string;
  };
}

const planOf = (args: Record<string, unknown>): PlanView | undefined =>
  shellApprovalDetail({ tool: DIY_RECORD_PREPARE_TOOL, args }, t) as PlanView | undefined;

describe('审批详情座：外壳自己的族也画同一件 ApprovalPlan', () => {
  it('★ 录制那三行全部从参数来：站点 / 录制功能 / 落点', () => {
    const rows = recordApprovalRows({ unit: 'demo', url: SITE, doing: '发布' }, t);

    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['站点', SITE],
      ['录制功能', '「发布」'],
      ['落点', 'shots/rec-demo.jsonl'],
    ]);
  });

  it('★ 参数缺了照样是人话（不出现 undefined / NaN / 裸键名）', () => {
    const text = recordApprovalRows({}, t)
      .map((row) => `${row.label}=${row.value}`)
      .join(' · ');

    expect(text).toContain('没给站点地址');
    expect(text).toContain('一次操作');
    expect(text).toContain('shots/rec-<unit>.jsonl');
    expect(text).not.toMatch(/undefined|NaN|\[object|approval\./);
  });

  it('★ 外壳自己的工具一律认领：录制族画三行、其余拿到空认领；不是外壳的才 undefined', () => {
    expect(OTHER_SHELL).not.toBe('');
    expect(shellApprovalDetail({ tool: DIY_RECORD_READ_TOOL, args: {} }, t)).not.toBeUndefined();
    expect(shellApprovalDetail({ tool: OTHER_SHELL, args: {} }, t)).not.toBeUndefined();
    expect(shellApprovalDetail({ tool: 'inventory_build', args: {} }, t)).toBeUndefined();
    expect(shellApprovalDetail({ tool: 'bash', args: {} }, t)).toBeUndefined();
    expect(shellApprovalDetail({ tool: 'workbench_other', args: {} }, t)).toBeUndefined();
  });

  it('★ 穷尽：ALL_TOOLS 里每一把都被认领（新增一把外壳工具忘了认领就红）', () => {
    for (const tool of ALL_TOOLS) {
      expect(shellClaimsApprovalDetail(tool), tool).toBe(true);
      expect(shellApprovalDetail({ tool, args: {} }, t), tool).not.toBeUndefined();
    }
  });

  it('★ 那一屏画的就是 ApprovalPlan：三行 + 一句 warn（"录完不替你切回来"）', () => {
    const view = planOf({ unit: 'demo', url: SITE, doing: '发布' });

    expect(view?.type).toBe(ApprovalPlan);
    expect(view?.props.rows).toHaveLength(3);
    expect(view?.props.warn).toBe('录完不会替你切回来（左栏底部会亮一条状态）');
  });
});

interface SeatNode {
  readonly type?: unknown;
  readonly props?: { readonly code?: unknown; readonly rows?: readonly unknown[]; readonly children?: unknown } | null;
}

function seatOf(tool: string, args: Record<string, unknown>): SeatNode | null {
  const root = { callId: 'c1', name: tool, phase: 'start', argsRaw: JSON.stringify(args) };
  const snapshot = { nodes: { values: () => [{ kind: 'tool-call', data: { root } }] } };
  const useChat = ((selector: (value: unknown) => unknown) => selector(snapshot)) as never;
  const node = ApprovalDetail({ callId: 'c1', useChat, renderShell: shellApprovalDetail, t }) as SeatNode | null;
  const child = node?.props?.children;
  return typeof child === 'object' && child !== null && !Array.isArray(child) ? (child as SeatNode) : node;
}

describe('详情座的最后一档（参数里的 command）：外壳认领过的工具，agent 塞的那句话进不来', () => {
  it('★★ 外壳工具（如 panels_hide）塞 command：画不出来（修前那句话会当命令原文上屏）', () => {
    const node = seatOf(OTHER_SHELL, { id: 'inventory', command: '把这句话画到审批屏上' });

    expect(node).not.toBeNull();
    expect(node?.props?.code).toBeUndefined();
  });

  it('★ 录制族照旧：认领的是 ApprovalPlan（三行），不走兜底', () => {
    const node = seatOf(DIY_RECORD_PREPARE_TOOL, { unit: 'demo', url: SITE, doing: '发布' });

    expect(node?.props?.rows).toHaveLength(3);
    expect(node?.props?.code).toBeUndefined();
  });

  it('★ 外壳不认领的工具：那条兜底还在（dsh 自己的 bash / 插件命令靠它显示命令原文）', () => {
    expect(seatOf('bash', { command: 'rm -rf /tmp/x' })?.props?.code).toBe('rm -rf /tmp/x');
    expect(seatOf('inventory_build', { command: 'opencli inventory build --enterprise=tencent' })?.props?.code).toBe(
      'opencli inventory build --enterprise=tencent',
    );
  });
});

describe('座位的查找顺序：模块自己的 renderer → 外壳那张表 → 参数里的 command → 空', () => {
  const DETAIL = code(read('../../../../shared/src/components/ApprovalDetail.tsx'));
  const CLIENT = code(read('../client.tsx'));
  const PANELS_INDEX = code(read('../../modules/panels/index.ts'));

  it('★ 模块优先、外壳其次、command 最后（顺序反了就把模块自己的话盖掉）', () => {
    const ownerAt = DETAIL.indexOf('owner?.approval');
    const shellAt = DETAIL.indexOf('props.renderShell');
    const commandAt = DETAIL.indexOf("if (command === '')");

    expect(ownerAt).toBeGreaterThan(-1);
    expect(shellAt).toBeGreaterThan(ownerAt);
    expect(commandAt).toBeGreaterThan(shellAt);
  });

  it('★ 注册处把外壳那张表交出去（不交这一族永远是空的）', () => {
    expect(CLIENT).toContain('renderShell: shellApprovalDetail');
    expect(CLIENT).toContain("'conversation.approval.detail'");
  });

  it('★ 外壳自己的套件不写宿主明细：事实只走详情座，标题里不许再有第二段', () => {
    expect(PANELS_INDEX).not.toContain('approvalDetail');
  });
});
