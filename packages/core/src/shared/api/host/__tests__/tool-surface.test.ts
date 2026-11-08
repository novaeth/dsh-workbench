import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import { createRecordStore } from '@dsh-workbench/shared/host';
import { registerPanelTools } from '@/modules/panels/model/tools';
import { registerMarketTools } from '@/modules/panels/model/market-tools';
import { registerDiyTools } from '@/modules/panels/model/diy-tools';
import { registerRecordTools } from '@/modules/panels/model/diy-record-tools';
import { registerLongTaskTools } from '@/modules/panels/model/long-task-tools';
import { registerToolboxTools } from '@/modules/panels/model/toolbox-tools';
import { createToolbox } from '@/modules/panels/model/toolbox';
import { TOOLBOX_TOOLS } from '@/modules/panels/unit';

const TOOLBOX_CHAR_BUDGET = 394;
const MANAGE_CHAR_BUDGET = 1651;
const DIY_CHAR_BUDGET = 5012;

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

  it('★ manage 包：面板 6 + 模块 9 + 市场 3 + 长任务 2，共 20 把；开包才付这份钱（2026-11-08 实测 1651）', () => {
    const tools = registered('manage');
    const total = tools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);

    expect(tools).toHaveLength(20);
    expect(total, `${TOTAL_OF('manage')} / 预算 ${String(MANAGE_CHAR_BUDGET)}`).toBeLessThanOrEqual(
      MANAGE_CHAR_BUDGET,
    );
  });

  it('★ diy 包：DIY 25 + 调试 4 + 录制 4，共 33 把；开包才付这份钱（2026-11-08 实测 5012）', () => {
    const tools = registered('diy');
    const total = tools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);

    expect(tools).toHaveLength(33);
    expect(total, `${TOTAL_OF('diy')} / 预算 ${String(DIY_CHAR_BUDGET)}`).toBeLessThanOrEqual(
      DIY_CHAR_BUDGET,
    );
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
