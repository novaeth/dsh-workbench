import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import { registerPanelTools } from '@/modules/panels/model/tools';
import { registerMarketTools } from '@/modules/panels/model/market-tools';
import { registerDiyTools } from '@/modules/panels/model/diy-tools';
import { registerLongTaskTools } from '@/modules/panels/model/long-task-tools';

const RESIDENT_CHAR_BUDGET = 1710;
const WORKSHOP_CHAR_BUDGET = 4232;

function registeredTools(workshop = false): DshToolDefinition[] {
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

  if (workshop) {
    registerDiyTools(ctx, none, none, none);
    return seen;
  }
  registerPanelTools(ctx, none);
  registerMarketTools(ctx, none, none);
  registerLongTaskTools(ctx, undefined);
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

describe('工具面是常驻上下文：话要一句顶一句', () => {
  it('★ 参数 schema 只用 dsh 认的关键字（多一个 maxLength / pattern 这种：整把工具注册当场被判 UNSUPPORTED_SCHEMA，夹具里看不出来）', () => {
    const offenders = registeredTools().flatMap((tool) => schemaKeyOffenders(tool.parameters, tool.name));

    expect(offenders).toEqual([]);
  });
  it('★ 常驻工具面（面板 6 + 市场 10 + 长任务 2，共 20 把）的描述与参数说明按实测重算：2026-10-21 加长任务那两把（ADR-0070），把上限从旧那个 1833 收到当下的实测 1579；2026-10-23 模块名去标识化后实测 1592；2026-10-27 加 workbench_market_enable（索引源设为可发布）后实测 1636；再加 workbench_market_disable（设为只读）后实测 1682；再加 workbench_market_sources（只读索引源清单）后实测 1710（口径见 内部设计记录：棘轮跟着实测走）', () => {
    const tools = registeredTools();
    const total = tools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);

    expect(total, `${String(tools.length)} 把工具 / 共 ${String(total)} 字 / 预算 ${String(RESIDENT_CHAR_BUDGET)}`).toBeLessThanOrEqual(
      RESIDENT_CHAR_BUDGET,
    );
  });

  it('★ DIY 那 29 把另算一份（+调试约定四把，ADR-0055；枚举 opencli 后按实测重算 —— ADR-0062；组件那把见 ADR-0063 §5；2026-10-20 删 probe、改由那族的只读线档承担，按实测 3721 → 3658（删掉 workbench_diy_list，入口收成 _status）；2026-10-24 加 workbench_diy_publish（发布闸）；2026-10-26 加 workbench_diy_changelog（发布前的更新日志）、publish 加 refresh（只刷市集元数据），描述收短后实测 4176；2026-10-26 publish 加 author（没写作者时审批屏显示推断的署名），实测 4226；2026-10-27 publish 加 source（多索引源时指定发到哪个）后实测 4275；同一天把更新日志并进 publish（changelogNote / changelogType，删 workbench_diy_changelog）后实测 4131；2026-10-28 publish 加 labels（还没有市集标签时必须给 1–2 个）后实测 4232，预算跟实测走）', () => {
    const tools = registeredTools(true);
    const total = tools.reduce((sum, tool) => sum + promptTextOf(tool).length, 0);

    expect(tools).toHaveLength(29);
    expect(total, `${String(tools.length)} 把工具 / 共 ${String(total)} 字 / 预算 ${String(WORKSHOP_CHAR_BUDGET)}`).toBeLessThanOrEqual(
      WORKSHOP_CHAR_BUDGET,
    );
  });

  it('每把工具都有描述（空描述 = 模型只能靠名字猜）', () => {
    const empty = registeredTools()
      .filter((tool) => tool.description.trim() === '')
      .map((tool) => tool.name);

    expect(empty).toEqual([]);
  });

});
