import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared/host';
import { createRecordStore } from '@dsh-workbench/shared/host';
import { registerPanelTools } from '@/modules/panels/model/tools';
import { registerMarketTools } from '@/modules/panels/model/market-tools';
import { registerDiyTools } from '@/modules/panels/model/diy-tools';
import { registerRecordTools } from '@/modules/panels/model/diy-record-tools';
import { registerLongTaskTools } from '@/modules/panels/model/long-task-tools';
import { registerToolboxTools } from '@/modules/panels/model/toolbox-tools';
import { createToolbox } from '@/modules/panels/model/toolbox';
import {
  DIY_BUILD_TOOLS,
  DIY_DEBUG_TOOLS,
  DIY_FLOW_TOOLS,
  DIY_PAGE_TOOLS,
  DIY_PROBE_TOOLS,
  DIY_RECORD_TOOLS,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_TOOLS,
} from '@/modules/panels/unit';

const TOOLBOX_CHAR_BUDGET = 394;
const MANAGE_CHAR_BUDGET = 1687;
const DIY_CHAR_BUDGET = 4960;
const DIY_PACK_BUDGETS = {
  'diy-flow': 450,
  'diy-probe': 270,
  'diy-build': 780,
  'diy-page': 2570,
  'diy-debug': 190,
  'diy-record': 770,
} as const;
const DIY_PACK_TOOLS = {
  'diy-flow': DIY_FLOW_TOOLS,
  'diy-probe': DIY_PROBE_TOOLS,
  'diy-build': DIY_BUILD_TOOLS,
  'diy-page': DIY_PAGE_TOOLS,
  'diy-debug': DIY_DEBUG_TOOLS,
  'diy-record': DIY_RECORD_TOOLS,
} as const;

type Surface = 'toolbox' | 'manage' | 'diy';

function registered(surface: Surface): DshToolDefinition[] {
  const seen: DshToolDefinition[] = [];
  const registry = {
    register: (definition: DshToolDefinition) => {
      seen.push(definition);
      return () => {};
    },
  };
  const ctx = {
    get: (key: string) => (key === 'tools' ? (registry as unknown as DshToolRegistry) : undefined),
    logger: { info: () => {}, warn: () => {} },
  } as unknown as DshHostContext;
  const none = {} as never;

  if (surface === 'toolbox') {
    registerToolboxTools(ctx, createToolbox({ manifests: () => [] }));
    return seen;
  }
  if (surface === 'manage') {
    registerPanelTools(ctx, none);
    registerMarketTools(ctx, none, none);
    registerLongTaskTools(ctx, undefined);
    return seen;
  }
  registerDiyTools(ctx, none, none, none);
  registerRecordTools(ctx, createRecordStore());
  return seen;
}

function promptTextOf(tool: DshToolDefinition): string {
  const parameters = tool.parameters as { properties?: Record<string, { description?: string }> };
  const params = Object.values(parameters.properties ?? {}).map((one) => one.description ?? '');
  return [tool.description, ...params].filter((one) => one !== '').join('\n');
}

const ALLOWED_SCHEMA_KEYS = new Set([
  'type',
  'oneOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'description',
  'title',
  'default',
  'examples',
]);

function schemaKeyOffenders(node: unknown, path: string): string[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return [];
  const record = node as Record<string, unknown>;
  const own = Object.keys(record)
    .filter((key) => !ALLOWED_SCHEMA_KEYS.has(key))
    .map((key) => `${path}.${key}`);
  const properties = record['properties'];
  const nested =
    typeof properties === 'object' && properties !== null
      ? Object.entries(properties as Record<string, unknown>).flatMap(([name, child]) =>
          schemaKeyOffenders(child, `${path}.properties.${name}`),
        )
      : [];
  const items = schemaKeyOffenders(record['items'], `${path}.items`);
  const oneOf = Array.isArray(record['oneOf'])
    ? record['oneOf'].flatMap((child, index) => schemaKeyOffenders(child, `${path}.oneOf[${String(index)}]`))
    : [];
  return [...own, ...nested, ...items, ...oneOf];
}

const TOTAL_OF = (surface: Surface): string =>
  `${String(registered(surface).length)} 把工具 / 共 ${String(
    registered(surface).reduce((sum, tool) => sum + promptTextOf(tool).length, 0),
  )} 字`;

describe('工具面是常驻上下文：话要一句顶一句', () => {
  it('★ 参数 schema 只用 dsh 认的关键字（多一个 maxLength / pattern 这种：整把工具注册当场被判 UNSUPPORTED_SCHEMA，夹具里看不出来）', () => {
    const offenders = (['toolbox', 'manage', 'diy'] as const).flatMap((surface) =>
      registered(surface).flatMap((tool) => schemaKeyOffenders(tool.parameters, tool.name)),
    );

    expect(offenders).toEqual([]);
  });
  it('★ 默认工具面 = 三把控制工具（list / open / close），描述与参数说明按实测钉住：2026-11-08 开工具包之后，常驻面从 manage 那一包 20 把收到这里（ADR-0020 的装配期收窄 + 工具包按需）', () => {
    const tools = registered('toolbox');
    const total = tools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);

    expect(tools.map((tool) => tool.name)).toEqual([...TOOLBOX_TOOLS]);
    expect(total, `${TOTAL_OF('toolbox')} / 预算 ${String(TOOLBOX_CHAR_BUDGET)}`).toBeLessThanOrEqual(
      TOOLBOX_CHAR_BUDGET,
    );
  });

  it('★ list 描述只留发现：优先级那句住在系统提示词段（workbench:tool-priority），工具面不重复（2026-11-26）', () => {
    const description = registered('toolbox').find((tool) => tool.name === TOOLBOX_LIST_TOOL)?.description ?? '';

    expect(description).toContain('列出工作台工具包');
    expect(description).toContain('不确定开哪个包');
    expect(description).not.toContain('优先用工作台工具');
  });

  it('★ manage 包：面板 6 + 模块 9 + 市场 3 + 长任务 2，共 21 把；开包才付这份钱（2026-11-08 实测 1687）', () => {
    const tools = registered('manage');
    const total = tools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);

    expect(tools).toHaveLength(21);
    expect(total, `${TOTAL_OF('manage')} / 预算 ${String(MANAGE_CHAR_BUDGET)}`).toBeLessThanOrEqual(
      MANAGE_CHAR_BUDGET,
    );
  });

  it('★ 拆包前的 DIY 族（可注册子集）：33 把；现在默认只付 diy-flow 这份', () => {
    const tools = registered('diy');
    const total = tools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);

    expect(tools).toHaveLength(33);
    expect(total, `${TOTAL_OF('diy')} / 预算 ${String(DIY_CHAR_BUDGET)}`).toBeLessThanOrEqual(
      DIY_CHAR_BUDGET,
    );
  });

  it('★ 每个 DIY 子包各有预算；默认面只有 diy-flow，明显小于拆包前', () => {
    const tools = registered('diy');

    for (const [id, budget] of Object.entries(DIY_PACK_BUDGETS)) {
      const names = new Set<string>(DIY_PACK_TOOLS[id as keyof typeof DIY_PACK_TOOLS]);
      const packTools = tools.filter((tool) => names.has(tool.name));
      const total = packTools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);
      expect(total, `${id} / 预算 ${String(budget)}`).toBeLessThanOrEqual(budget);
    }

    const flowNames = new Set<string>(DIY_FLOW_TOOLS);
    const flowTotal = tools
      .filter((tool) => flowNames.has(tool.name))
      .reduce((sum, tool) => sum + promptTextOf(tool).length, 0);
    expect(flowTotal).toBeLessThanOrEqual(DIY_PACK_BUDGETS['diy-flow']);
    expect(flowTotal).toBeLessThan(DIY_CHAR_BUDGET / 4);
  });

  it('每把工具都有描述（空描述 = 模型只能靠名字猜）', () => {
    const empty = (['toolbox', 'manage', 'diy'] as const)
      .flatMap((surface) => registered(surface))
      .filter((tool) => tool.description.trim() === '')
      .map((tool) => tool.name);

    expect(empty).toEqual([]);
  });

  it('★ 控制工具的 schema 里没有 `action`（ADR-0046：一个动词一把，多路复用会在一个 schema 里混读与写）', () => {
    const withAction = registered('toolbox')
      .filter((tool) => 'action' in ((tool.parameters as { properties?: Record<string, unknown> }).properties ?? {}))
      .map((tool) => tool.name);

    expect(withAction).toEqual([]);
  });
});
