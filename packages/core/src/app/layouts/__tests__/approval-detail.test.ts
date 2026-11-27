import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ApprovalPlanData, Translate, UnitClientFace, UnitManifest } from '@dsh-workbench/shared';
import { ApprovalDetail, ApprovalPlan, CardBoundary, zh } from '@dsh-workbench/shared';
import {
  marketSourceRows,
  moduleSupplyRows,
  planApprovalRows,
  pluginApprovalRows,
  pluginToolIndexOf,
  publishRows,
  recordApprovalRows,
  shellApprovalDetail,
  shellApprovalRenderer,
  shellClaimsApprovalDetail,
  versionLineOf,
} from '../approval-detail';
import { planSections } from '../approval-plan';
import {
  ALL_TOOLS,
  DIY_PUBLISH_TOOL,
  DIY_PLAN_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  MARKET_DISABLE_TOOL,
  MARKET_ENABLE_TOOL,
  MODULES_INSTALL_TOOL,
} from '@/modules/panels/client';

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

describe('发布审批：版本单独一行，仓库 / 分支 / 两个 commit 都写清楚', () => {
  const market = {
    url: 'https://git.example.com/wb/market.git',
    ref: 'main',
    indexPath: 'market',
    artifactPath: 'artifacts/probe',
    files: ['dist', 'client.js'],
    nextVersion: '0.0.2',
  };
  const preview = { name: '@demo/probe', version: '0.0.1', labels: ['探针'], market };

  it('★ 版本行显示 0.0.1 → 0.0.2，模块行只放包名', () => {
    expect(versionLineOf('0.0.1', '', '0.0.2')).toBe('0.0.1 → 0.0.2');
    expect(versionLineOf('0.0.1', 'patch', undefined)).toBe('0.0.1 → 0.0.2');
    expect(versionLineOf('0.0.1', 'minor', undefined)).toBe('0.0.1 → 0.1.0');
    expect(versionLineOf('0.0.1', '2.0.0', undefined)).toBe('0.0.1 → 2.0.0');
    expect(versionLineOf('0.0.1', '', undefined)).toBe('0.0.1');
  });

  it('★★ 详情座把这次会话的工作区交给预览：换工作区才读得到那个仓库里的模块', () => {
    const direct = shellApprovalDetail(
      { tool: DIY_PUBLISH_TOOL, args: { unit: 'argocd' } },
      t,
      undefined,
      undefined,
      '/w/repo',
    ) as { readonly props: { readonly workspace?: string } };
    expect(direct.props.workspace).toBe('/w/repo');

    const viaShell = shellApprovalRenderer(
      () => [],
      () => '/w/repo',
    )({ tool: DIY_PUBLISH_TOOL, args: { unit: 'argocd' } }, t) as {
      readonly props: { readonly workspace?: string };
    };
    expect(viaShell.props.workspace).toBe('/w/repo');
  });

  it('★ 市场目标的详情行：模块 / 版本 / 目标 / 作者 / 标签 / 仓库 / 分支 / 打包文件 / 索引 / 提交', () => {
    const rows = publishRows({ unit: 'probe' }, preview, t);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['模块', '@demo/probe'],
      ['版本', '0.0.1 → 0.0.2'],
      ['目标', '按配置默认'],
      ['作者', '未署名'],
      ['标签', '探针'],
      ['分类', '尚未设置，发布到市场时需要指定'],
      ['仓库', market.url],
      ['分支', 'main'],
      ['打包文件', 'artifacts/probe · dist · client.js'],
      ['索引', 'market'],
      ['提交', '打包文件和条目文件分两次提交，一次推送'],
    ]);
  });

  it('★ 分类不在索引现有词表里：把现有分类摆出来（软提示，不拦）', () => {
    const rows = publishRows(
      { unit: 'probe', category: '提醒' },
      { name: '@demo/probe', version: '0.0.1', categories: ['任务与协作', '用量与计费'], market },
      t,
    );
    expect(rows.find((row) => row.label === '分类')?.value).toBe('提醒');
    expect(rows.find((row) => row.label === '现有分类')?.value).toBe('任务与协作 · 用量与计费');
  });

  it('分类在现有词表里：不额外占一行', () => {
    const rows = publishRows(
      { unit: 'probe', category: '任务与协作' },
      { name: '@demo/probe', version: '0.0.1', categories: ['任务与协作'], market },
      t,
    );
    expect(rows.some((row) => row.label === '现有分类')).toBe(false);
  });

  it('★ 这次带的标签排在模块里写的那个前面；模块还没有标签就直说', () => {
    const asked = publishRows({ unit: 'probe', labels: ['发布编排', '构建状态'] }, preview, t);
    expect(asked.find((row) => row.label === '标签')?.value).toBe('发布编排 · 构建状态');

    const missing = publishRows({ unit: 'probe' }, { name: '@demo/probe', version: '0.0.1', market }, t);
    expect(missing.find((row) => row.label === '标签')?.value).toBe('未设置');
  });

  it('★ 模块写了 author：作者行把署名原文摆出来（姓名 + 邮箱，和提交署名一致）', () => {
    const rows = publishRows({ unit: 'probe' }, { ...preview, author: '陈康 <kang@example.com>' }, t);
    expect(rows.find((row) => row.label === '作者')?.value).toBe('陈康 <kang@example.com>');
  });

  it('★ 工具参数带了 author：作者行先用这次的署名，不用等预览', () => {
    const rows = publishRows({ unit: 'probe', author: '陈康 <kang@example.com>' }, undefined, t);
    expect(rows.find((row) => row.label === '作者')?.value).toBe('陈康 <kang@example.com>');
  });

  it('★ author 参数改过时盖过模块里写的那个（这次发的就是新的署名）', () => {
    const rows = publishRows(
      { unit: 'probe', author: 'Ada <ada@example.com>' },
      { ...preview, author: '陈康 <kang@example.com>' },
      t,
    );
    expect(rows.find((row) => row.label === '作者')?.value).toBe('Ada <ada@example.com>');
  });

  it('★ 条目已有认领人：多一行「认领人」；冲突写清是谁的，没主的写原来没署名', () => {
    const owned = publishRows(
      { unit: 'probe' },
      { ...preview, claim: { state: 'owned', owner: '陈康 <kang@example.com>' } },
      t,
    );
    expect(owned.find((row) => row.label === '认领人')?.value).toBe('陈康 <kang@example.com>');
    const conflict = publishRows({ unit: 'probe' }, { ...preview, claim: { state: 'conflict', owner: '甲' } }, t);
    expect(conflict.find((row) => row.label === '认领人')?.value).toBe('已被认领：甲');
    const unowned = publishRows({ unit: 'probe' }, { ...preview, claim: { state: 'unowned' } }, t);
    expect(unowned.find((row) => row.label === '认领人')?.value).toBe('原先未署名');
    const fresh = publishRows({ unit: 'probe' }, { ...preview, claim: { state: 'new' } }, t);
    expect(fresh.some((row) => row.label === '认领人')).toBe(false);
  });

  it('★ 模块标识 / 打包文件位置被占：各一行说清是谁', () => {
    const unit = publishRows(
      { unit: 'probe' },
      { ...preview, claim: { state: 'unit-taken', entry: '@demo/other' } },
      t,
    );
    expect(unit.find((row) => row.label === '模块标识')?.value).toBe('已被 @demo/other 占用');
    const path = publishRows(
      { unit: 'probe' },
      { ...preview, claim: { state: 'path-taken', entry: '@demo/other' } },
      t,
    );
    expect(path.find((row) => row.label === '打包文件位置')?.value).toBe('已被 @demo/other 占用');
  });
});

describe('计划审批：除了那张画，还要说清这个模块能给她什么', () => {
  const args = {
    destination: 'board',
    summary: '盯库存低于 10 的',
    see: ['卡了几天', '', '金额'],
    do: ['点一下就按金额排'],
    agent: ['每天早上替我念一遍'],
    data: ['从她的库存系统读，只读'],
  };

  it('★★ 四段都摊出来，空条目丢掉', () => {
    expect(planSections(args, t).map((section) => [section.label, section.items])).toEqual([
      ['能看到什么', ['卡了几天', '金额']],
      ['你可以做什么', ['点一下就按金额排']],
      ['AI 能做什么', ['每天早上替我念一遍']],
      ['数据来源', ['从她的库存系统读，只读']],
    ]);
  });

  it('★ 一段都没填就什么也不画（不出现空标题）', () => {
    expect(planSections({ destination: 'board', summary: '盯库存' }, t)).toEqual([]);
  });

  it('★★ 无看板换成输出 / 触发 / 批准 / 数据', () => {
    expect(planSections({ ...args, destination: 'headless' }, t).map((section) => section.label)).toEqual([
      '输出',
      '触发',
      '批准',
      '数据',
    ]);
  });

  it('★★ 写工具的审批四格进入计划审批屏', () => {
    const approval = {
      object: '库存阈值',
      change: '从 10 改成 20',
      target: '库存模块设置',
      impact: '只影响当前项目',
    };
    const rows = planApprovalRows({ approval }, t);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      [t('approval.fact.object'), '库存阈值'],
      [t('approval.fact.change'), '从 10 改成 20'],
      [t('approval.fact.target'), '库存模块设置'],
      [t('approval.fact.impact'), '只影响当前项目'],
    ]);
    const view = shellApprovalDetail({ tool: DIY_PLAN_TOOL, args: { ...args, approval } }, t) as PlanView;
    expect(view.type).toBe(ApprovalPlan);
    expect(view.props.rows).toEqual(rows);
  });
});

describe('审批详情座：外壳自己的族也画同一件 ApprovalPlan', () => {
  it('★ 录制那三行全部从参数来：站点 / 录制内容 / 保存到', () => {
    const rows = recordApprovalRows({ unit: 'demo', url: SITE, doing: '发布' }, t);

    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['站点', SITE],
      ['录制内容', '「发布」'],
      ['保存到', 'shots/rec-demo.jsonl'],
    ]);
  });

  it('★ 参数缺了照样是人话（不出现 undefined / NaN / 裸键名）', () => {
    const text = recordApprovalRows({}, t)
      .map((row) => `${row.label}=${row.value}`)
      .join(' · ');

    expect(text).toContain('没有提供站点地址');
    expect(text).toContain('一次操作');
    expect(text).toContain('录制结果文件');
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

  it('★ 那一屏画的就是 ApprovalPlan：三行、没有 warn（多余那句话不上屏）', () => {
    const view = planOf({ unit: 'demo', url: SITE, doing: '发布' });

    expect(view?.type).toBe(ApprovalPlan);
    expect(view?.props.rows).toHaveLength(3);
    expect(view?.props.warn).toBeUndefined();
  });
});

interface SeatNode {
  readonly type?: unknown;
  readonly props?: {
    readonly code?: unknown;
    readonly rows?: readonly unknown[];
    readonly warn?: unknown;
    readonly fallback?: unknown;
    readonly children?: unknown;
  } | null;
}

function seatFrom(
  snapshot: unknown,
  callId: string,
  renderShell = shellApprovalDetail,
): SeatNode | null {
  const useChat = ((selector: (value: unknown) => unknown) => selector(snapshot)) as never;
  const node = ApprovalDetail({ callId, useChat, renderShell, t }) as SeatNode | null;
  const child = node?.props?.children;
  return typeof child === 'object' && child !== null && !Array.isArray(child) ? (child as SeatNode) : node;
}

function seatOf(
  tool: string,
  args: Record<string, unknown>,
  renderShell = shellApprovalDetail,
): SeatNode | null {
  const root = { callId: 'c1', name: tool, phase: 'start', argsRaw: JSON.stringify(args) };
  return seatFrom({ nodes: { values: () => [{ kind: 'tool-call', data: { root } }] } }, 'c1', renderShell);
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

  it('★★ 程序调用里的子调用：审批的 callId 带 :ptc: 时钻到 subCalls 里认出这次调用（修前整格是空的）', () => {
    const args = { unit: 'demo', url: SITE, doing: '发布' };
    const sub = { callId: 'call_p:ptc:1', name: DIY_RECORD_PREPARE_TOOL, phase: 'start', argsRaw: JSON.stringify(args) };
    const root = { callId: 'call_p', name: 'run_code', phase: 'start', argsRaw: '{}', subCalls: [{ ...sub, subCalls: [] }] };

    const seat = seatFrom({ nodes: { values: () => [{ kind: 'tool-call', data: { root } }] } }, 'call_p:ptc:1');

    expect(seat?.props?.rows).toHaveLength(3);
    expect(seat?.props?.code).toBeUndefined();
  });

  it('★ 顶层那次调用自己也要认得出（没有 subCalls 时不改老行为）', () => {
    const seat = seatFrom(
      { nodes: { values: () => [{ kind: 'tool-call', data: { root: { callId: 'c9', name: 'bash', phase: 'start', argsRaw: '{"command":"ls"}' } } }] } },
      'c9',
    );

    expect(seat?.props?.code).toBe('ls');
  });
});

const PLUGIN_UNIT: UnitManifest = {
  id: 'plugin:opencli-plugin-inventory',
  title: { zh: 'inventory', en: 'inventory' },
  titleKey: 'dsh-workbench.unit.plugin_inventory.title',
  card: null,
  tools: [
    {
      name: 'inventory_build',
      writes: true,
      runtime: { plugin: 'inventory', command: 'build', args: ['enterprise', 'wait'] },
    },
    {
      name: 'inventory_builds',
      writes: false,
      runtime: { plugin: 'inventory', command: 'builds', args: ['job'] },
    },
  ],
  host: { inject: [] },
};

const pluginTools = pluginToolIndexOf([PLUGIN_UNIT]);
const pluginSeat = (tool: string, args: Record<string, unknown>) =>
  seatOf(tool, args, shellApprovalRenderer(() => [PLUGIN_UNIT]));

describe('插件命令的审批详情座：从清单与参数把"跑哪条命令、带什么"摆出来', () => {
  it('★ 索引只收带 opencli 那格的工具（手写模块的工具不进）', () => {
    expect([...pluginTools.keys()].sort()).toEqual(['inventory_build', 'inventory_builds']);
    expect(pluginTools.get('inventory_build')).toEqual({
      plugin: 'inventory',
      command: 'build',
      args: ['enterprise', 'wait'],
    });
    expect(pluginToolIndexOf([{ ...PLUGIN_UNIT, tools: [{ name: 'inventory_build', writes: true }] }]).size).toBe(0);
  });

  it('★★ 插件 / 命令 / 附注 / 命令声明过的参数各一行；没声明的格子不上屏', () => {
    const rows = pluginApprovalRows(
      {
        plugin: 'pagoda-permission',
        command: 'personnel-authorize',
        args: ['ASCode', 'authorizations'],
      },
      {
        ASCode: 'auth_6dc3eb9b7012119',
        authorizations: [{ code: '20191104004', roleCode: 'dify_developer' }],
        approval_note: '给陈孝群(20191104004)加开发者角色',
      },
      t,
    );

    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['插件', 'pagoda-permission'],
      ['命令', 'personnel-authorize'],
      ['agent 说明', '给陈孝群(20191104004)加开发者角色'],
      ['ASCode', 'auth_6dc3eb9b7012119'],
      ['authorizations', ['{"code":"20191104004","roleCode":"dify_developer"}']],
    ]);
  });

  it('★ 没给附注就没有那一行；折行压成一个空格（详情座里不重复标题的截断）', () => {
    const without = pluginApprovalRows({ plugin: 'demo', command: 'run', args: ['page'] }, { page: 1 }, t);
    expect(without.some((row) => row.label === 'agent 说明')).toBe(false);

    const folded = pluginApprovalRows(
      { plugin: 'demo', command: 'run', args: [] },
      { approval_note: '第一行\n  第二行' },
      t,
    );
    expect(folded.at(-1)).toEqual({ label: 'agent 说明', value: '第一行 第二行' });
  });

  it('★ 值怎么上屏：字符串原样、数字 / 布尔 / null 照写、对象与数组走紧凑 JSON（不出 [object Object]）', () => {
    const rows = pluginApprovalRows(
      { plugin: 'demo', command: 'run', args: ['page', 'dry', 'target', 'options', 'empty'] },
      { page: 3, dry: false, target: null, options: { k: 'v' }, empty: '' },
      t,
    );

    expect(rows.slice(2).map((row) => row.value)).toEqual(['3', 'false', 'null', '{"k":"v"}', '']);
    expect(rows.map((row) => row.value).join(' ')).not.toMatch(/undefined|NaN|\[object/);
  });

  it('★ 数组参数一项一行，单元素数组也走数组', () => {
    const rows = pluginApprovalRows(
      { plugin: 'demo', command: 'run', args: ['tags', 'ids'] },
      { tags: ['甲', '乙'], ids: [7] },
      t,
    );

    expect(rows.slice(2).map((row) => row.value)).toEqual([['甲', '乙'], ['7']]);
  });

  it('★★ 真调用：详情座认领插件命令画那张表，agent 塞的 command 进不来', () => {
    const node = pluginSeat('inventory_build', {
      enterprise: 'tencent',
      command: 'rm -rf /',
      approval_note: '把预发那条构建发出去',
    });

    expect(node?.type).toBe(ApprovalPlan);
    expect(node?.props?.code).toBeUndefined();
    const rows = (node?.props?.rows ?? []) as readonly { label: string; value: string }[];
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['插件', 'inventory'],
      ['命令', 'build'],
      ['agent 说明', '把预发那条构建发出去'],
      ['enterprise', 'tencent'],
    ]);
  });

  it('★ 不在索引里的工具照旧走 command 兜底（认领不能把那一档一起吃掉）', () => {
    expect(pluginSeat('bash', { command: 'rm -rf /tmp/x' })?.props?.code).toBe('rm -rf /tmp/x');
  });

  it('★ 清单每次画的时候现读：插件这一版没合成出来，下一版出来就跟着认领', () => {
    let manifests: readonly UnitManifest[] = [];
    const render = shellApprovalRenderer(() => manifests);

    expect(seatOf('inventory_build', { enterprise: 'tencent' }, render)?.props?.rows).toBeUndefined();

    manifests = [PLUGIN_UNIT];

    expect(seatOf('inventory_build', { enterprise: 'tencent' }, render)?.props?.rows).toHaveLength(3);
  });
});

describe('座位的查找顺序：模块自己的 renderer → 外壳那张表 → 参数里的 command → 空', () => {
  const DETAIL = code(read('../../../../shared/src/components/card/ApprovalDetail.tsx'));
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
    expect(CLIENT).toContain('renderShell: shellApprovalRenderer(units.declared');
    expect(CLIENT).toContain("'conversation.approval.detail'");
  });

  it('★ 外壳自己的套件不写宿主明细：事实只走详情座，标题里不许再有第二段', () => {
    expect(PANELS_INDEX).not.toContain('approvalDetail');
  });
});

describe('索引源审批：把源的名字、地址、操作与当前状态摆出来', () => {
  const payload = {
    sources: [
      {
        id: 'team',
        label: '团队',
        kind: 'git' as const,
        url: 'https://git.example/wb/market.git',
        policy: 'artifacts-in-repo' as const,
      },
    ],
    selected: 'team',
  };

  it('★ 设为可发布：源 / 地址 / 操作 / 当前状态', () => {
    expect(marketSourceRows(MARKET_ENABLE_TOOL, {}, payload, t)).toEqual([
      { label: '模块来源', value: '团队（team）' },
      { label: '地址', value: 'https://git.example/wb/market.git' },
      { label: '这次操作', value: '设为可发布' },
      { label: '当前状态', value: '可发布' },
    ]);
  });

  it('改回只读：即使传了 id 也按 id 找；没传就用当前选中的', () => {
    expect(marketSourceRows(MARKET_DISABLE_TOOL, {}, payload, t).map((row) => row.value)).toEqual([
      '团队（team）',
      'https://git.example/wb/market.git',
      '改回只读',
      '可发布',
    ]);
    expect(marketSourceRows(MARKET_DISABLE_TOOL, { id: 'nope' }, payload, t)[0]?.value).toBe('nope');
  });
});

describe('模块外部供给审批：要装的插件与库摆进详情座', () => {
  const unit: UnitManifest = {
    id: 'inventory',
    title: { zh: '库存', en: 'Inventory' },
    titleKey: 'dsh-workbench.unit.inventory.title',
    card: null,
    tools: [],
    host: { inject: [] },
    needs: [
      { kind: 'extension', runtime: 'opencli', name: 'inventory', purpose: '读库存数据' },
      { kind: 'lib', name: 'acme-sdk', version: '^2.1', purpose: '调库存接口' },
      { kind: 'env', name: 'INVENTORY_TOKEN', purpose: '登录' },
    ],
  };

  it('★ 只画要装的（extension / lib）；env / bin 不上屏', () => {
    expect(moduleSupplyRows(unit, 'inventory', t)).toEqual([
      { label: '模块', value: 'inventory' },
      { label: '插件', value: 'inventory —— 读库存数据' },
      { label: '库', value: 'acme-sdk ^2.1 —— 调库存接口' },
    ]);
  });

  it('没声明就没有；清单没读回来就说读不到 —— 不猜、不写空行', () => {
    expect(moduleSupplyRows({ ...unit, needs: [] }, 'inventory', t)).toEqual([
      { label: '模块', value: 'inventory' },
      { label: '需要安装的内容', value: '这个模块没有声明插件与库' },
    ]);
    expect(moduleSupplyRows(undefined, 'inventory', t)[1]).toEqual({
      label: '需要安装的内容',
      value: '无法读取这个模块的依赖声明',
    });
  });

  it('★ 座位画的正是这张表（外壳拿浏览器侧清单认出这次调用）', () => {
    const seat = seatOf(MODULES_INSTALL_TOOL, { id: 'inventory' }, shellApprovalRenderer(() => [unit]));

    expect(seat?.props?.rows).toHaveLength(3);
    expect(seat?.props?.code).toBeUndefined();
  });
});

function moduleSeatOf(
  face: UnitClientFace | undefined,
  args: Record<string, unknown> = { id: '136' },
  renderShell?: ((input: Parameters<typeof shellApprovalDetail>[0], t: Translate) => unknown) | undefined,
): SeatNode | null {
  const root = { callId: 'c1', name: 'demo_write', phase: 'start', argsRaw: JSON.stringify(args) };
  const snapshot = { nodes: { values: () => [{ kind: 'tool-call', data: { root } }] } };
  const useChat = ((selector: (value: unknown) => unknown) => selector(snapshot)) as never;
  return ApprovalDetail({
    callId: 'c1',
    useChat,
    units: face === undefined ? [] : [face],
    renderShell: renderShell as never,
    t,
  }) as SeatNode | null;
}

function rowsOf(node: SeatNode | null): readonly { readonly label: string; readonly value: unknown }[] {
  return (node?.props?.rows ?? []) as readonly { readonly label: string; readonly value: unknown }[];
}

const planData = (objectLabel?: string): ApprovalPlanData => ({
  object: '#136',
  change: '激活 → 已解决',
  target: '演示平台 · 预发',
  impact: '只改这一条；不改其他',
  ...(objectLabel === undefined ? {} : { objectLabel }),
  extra: [{ label: '当前状态', value: '激活' }],
  warn: '提交后不可撤回',
});

const planFace = (overrides: Partial<NonNullable<UnitClientFace['approval']>> = {}): UnitClientFace => ({
  unit: 'demo',
  approval: {
    tools: ['demo_write'],
    plan: () => planData('缺陷'),
    ...overrides,
  } as NonNullable<UnitClientFace['approval']>,
});

describe('模块审批详情：四行是下限，render 是上限', () => {
  it('★ 默认画四行 + extra + warn，第一格用领域标签', () => {
    const node = moduleSeatOf(planFace());
    const rows = rowsOf(node);

    expect(node?.type).toBe(ApprovalPlan);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['缺陷', '#136'],
      ['修改后', '激活 → 已解决'],
      ['目标位置', '演示平台 · 预发'],
      ['影响范围', '只改这一条；不改其他'],
      ['当前状态', '激活'],
    ]);
    expect(node?.props?.warn).toBe('提交后不可撤回');
  });

  it('★ 没给 objectLabel 就用默认「修改项」', () => {
    const node = moduleSeatOf(planFace({ plan: () => planData() }));

    expect(rowsOf(node)[0]).toEqual({ label: '修改项', value: '#136' });
  });

  it('★ change / impact / extra / warn 都能传数组，交给同一张表排版', () => {
    const node = moduleSeatOf(
      planFace({
        plan: () => ({
          object: '#136',
          change: ['激活 → 已解决', '补一条回归'],
          target: '演示平台 · 预发',
          impact: ['只改这一条', '不动其他'],
          extra: [{ label: '当前状态', value: ['激活', '已复核'] }],
          warn: ['提交后不可撤回', '不要重复提交'],
        }),
      }),
    );
    const rows = rowsOf(node);

    expect(rows.map((row) => row.value)).toEqual([
      '#136',
      ['激活 → 已解决', '补一条回归'],
      '演示平台 · 预发',
      ['只改这一条', '不动其他'],
      ['激活', '已复核'],
    ]);
    expect(node?.props?.warn).toEqual(['提交后不可撤回', '不要重复提交']);
  });

  it('★ render 接管详情区，拿到 plan；返回 null 退回四行表', () => {
    const face = planFace({ render: ({ plan }: { plan: ApprovalPlanData }) => `custom ${plan.object}` });
    const custom = moduleSeatOf(face);

    expect(custom?.type).toBe(CardBoundary);
    expect(custom?.props?.children).toBe('custom #136');
    expect(custom?.props?.fallback).toBeDefined();

    const blank = moduleSeatOf(planFace({ render: () => null }));
    expect(blank?.type).toBe(ApprovalPlan);
    expect(rowsOf(blank)).toHaveLength(5);
  });

  it('★ render 抛错退回四行表；plan 抛错/返回空显示详情缺失', () => {
    const thrown = moduleSeatOf(
      planFace({
        render: () => {
          throw new Error('boom');
        },
      }),
    );
    expect(thrown?.type).toBe(ApprovalPlan);
    expect(rowsOf(thrown)).toHaveLength(5);

    const planThrows = moduleSeatOf(
      planFace({
        plan: () => {
          throw new Error('boom');
        },
      }),
    );
    expect(planThrows?.type).toBe(ApprovalPlan);
    expect(rowsOf(planThrows)).toHaveLength(0);
    expect(String(planThrows?.props?.warn)).toContain('没有说明本次会改动什么');

    const planNull = moduleSeatOf(planFace({ plan: () => null }));
    expect(planNull?.type).toBe(ApprovalPlan);
    expect(rowsOf(planNull)).toHaveLength(0);
  });

  it('★ 旧模块只有 render：照旧画 render；没有 plan 也不退到 command', () => {
    const render = () => 'legacy detail';
    const legacy: UnitClientFace = {
      unit: 'demo',
      approval: { tools: ['demo_write'], render },
    };
    const node = moduleSeatOf(legacy, { id: '136', command: 'rm -rf /tmp/x' });
    const child = node?.props?.children as { readonly type?: unknown } | undefined;

    expect(node?.type).toBe(CardBoundary);
    expect(child?.type).toBe(render);
    expect(node?.props?.code).toBeUndefined();
  });

  it('★ 模块写工具没有 plan / render：画详情缺失警告，不退到 args.command', () => {
    const manifest: UnitManifest = {
      id: 'demo',
      title: { zh: '演示', en: 'Demo' },
      titleKey: 'dsh-workbench.unit.demo.title',
      card: null,
      tools: [{ name: 'demo_write', writes: true }],
      host: { inject: [] },
    };
    const node = moduleSeatOf(undefined, { id: '136', command: 'rm -rf /tmp/x' }, shellApprovalRenderer(() => [manifest]));
    const shell = node?.props?.children as SeatNode | undefined;

    expect(shell?.type).toBe(ApprovalPlan);
    expect(rowsOf(shell ?? null)).toHaveLength(0);
    expect(String(shell?.props?.warn)).toContain('没有说明本次会改动什么');
    expect(node?.props?.code).toBeUndefined();
  });
});
