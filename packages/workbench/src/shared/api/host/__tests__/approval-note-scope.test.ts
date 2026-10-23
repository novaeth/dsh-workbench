import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRegistry, UnitManifest } from '@dsh-workbench/shared';
import type { UnitMountDeps, UnitMountResult } from '@dsh-workbench/shared/host';
import { APPROVAL_NOTE_ARG, createWorkspaceStore } from '@dsh-workbench/shared/host';
import { declaredNotesOf, mountUnits } from '../mount-units';
import { createUnitRegistry } from '../unit-registry';

const PKG_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const WRITE = 'wb_demo_write';
const READ = 'wb_demo_read';
const OPTED = 'wb_demo_opted';
const UNDECLARED = 'wb_demo_undeclared';

const MANIFEST: UnitManifest = {
  id: 'demo-unit',
  card: null,
  tools: [
    { name: WRITE, writes: true },
    { name: READ, writes: false },
    { name: OPTED, writes: true },
  ],
  host: { inject: [] },
};

function definition(name: string, parameters?: Record<string, unknown>): DshToolDefinition {
  return {
    name,
    description: 'demo',
    parameters: parameters ?? {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: () => [] },
    execute: async () => ({}),
  };
}

class FakeCtx {
  #turns = 0;

  readonly registry: DshToolRegistry;

  readonly logger = { info: () => {}, warn: () => {} };

  constructor(registry: DshToolRegistry) {
    this.registry = registry;
  }

  get<T = unknown>(name: string): T | undefined {
    if (name === 'tools') return this.registry as T;
    return name === 'demo-service' ? ({ ok: true } as T) : undefined;
  }

  provide(): () => void {
    return () => {};
  }

  effect(): () => void {
    return () => {};
  }

  inject(): () => void {
    return () => {};
  }

  on(): () => void {
    return () => {};
  }

  turn(): number {
    this.#turns += 1;
    return this.#turns;
  }
}

interface Rig {
  readonly byName: (name: string) => DshToolDefinition | undefined;
  readonly made: Readonly<Record<string, DshToolDefinition>>;
  readonly scoped: () => DshHostContext | undefined;
  readonly rawRegister: DshToolRegistry['register'];
  readonly registry: DshToolRegistry;
  readonly ctx: DshHostContext;
  readonly declaredNotes: ReadonlySet<string>;
}

function rig(): Rig {
  const seen: DshToolDefinition[] = [];
  const registry: DshToolRegistry = {
    register(definition) {
      seen.push(definition);
      return () => {};
    },
  };
  let scoped: DshHostContext | undefined;
  const real = new FakeCtx(registry);
  const ctx = real as unknown as DshHostContext;

  const made: Record<string, DshToolDefinition> = {
    [WRITE]: definition(WRITE),
    [READ]: definition(READ),
    [OPTED]: definition(OPTED, {
      type: 'object',
      properties: { [APPROVAL_NOTE_ARG]: { type: 'number' } },
      required: [APPROVAL_NOTE_ARG],
      additionalProperties: false,
    }),
    [UNDECLARED]: definition(UNDECLARED),
  };

  const units = createUnitRegistry({ declarationOf: () => undefined });
  units.registerPlugin({
    unit: MANIFEST.id,
    manifest: MANIFEST,
    mount(deps: UnitMountDeps): UnitMountResult {
      scoped = deps.ctx;
      const tools = deps.ctx.get<DshToolRegistry>('tools');
      return {
        routes: {},
        registerTools: () =>
          tools === undefined ? [] : Object.values(made).map((one) => tools.register(one)),
      };
    },
  });

  const plan = mountUnits(units.all(), {
    ctx,
    manifests: () => units.manifests(),
    store: createWorkspaceStore({ root: null }),
  });
  for (const item of plan.mounted) item.result.registerTools();

  return {
    byName: (name) => seen.find((one) => one.name === name),
    made,
    scoped: () => scoped,
    rawRegister: registry.register,
    registry,
    ctx,
    declaredNotes: plan.declaredNotes,
  };
}

describe('★ 附注的射程：装配期一格都不加，只有插件命令族要它', () => {
  it('★ 清单 writes: true ⇒ 原样注册：还是模块自己那份对象，没有 approval_note', () => {
    const h = rig();
    const parameters = h.byName(WRITE)?.parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    };

    expect(h.byName(WRITE)).toBe(h.made[WRITE]);
    expect(parameters.properties[APPROVAL_NOTE_ARG]).toBeUndefined();
    expect(parameters.required ?? []).not.toContain(APPROVAL_NOTE_ARG);
  });

  it('★ 读工具（writes: false）一个字节都不动：注册的还是模块自己那份对象', () => {
    const h = rig();

    expect(h.byName(READ)).toBe(h.made[READ]);
  });

  it('不在任何清单里的工具名 ⇒ 不动（认不出就不碰）', () => {
    const h = rig();

    expect(h.byName(UNDECLARED)).toBe(h.made[UNDECLARED]);
  });

  it('★ 模块自己声明那一格 ⇒ 原样通过：通道还在，想加就自己加', () => {
    const h = rig();

    expect(h.byName(OPTED)).toBe(h.made[OPTED]);
    expect((h.byName(OPTED)?.parameters as { required: string[] }).required).toEqual([APPROVAL_NOTE_ARG]);
  });

  it('★ 谁真的声明了那一格，注册时就记账：没声明的工具塞了附注也不上屏', () => {
    const h = rig();

    expect([...h.declaredNotes]).toEqual([OPTED]);
  });

  it('★ 并集那一句：宿主把每个 unit 的账本汇总，去掉/重复都不出错', () => {
    const merged = declaredNotesOf([
      { declaredNotes: new Set(['a']) },
      { declaredNotes: new Set(['b', 'a']) },
      { declaredNotes: new Set() },
    ]);

    expect([...merged].sort()).toEqual(['a', 'b']);
    expect([...declaredNotesOf([])].length).toBe(0);
  });

  it('★ 唯一的生产接线：审批那一处必须交代"这把工具声明了没有"', () => {
    const callers = sourceFiles(join(PKG_ROOT, 'src'))
      .filter((path) => !path.includes('__tests__') && !path.endsWith('.test.ts'))
      .filter((path) => readFileSync(path, 'utf8').includes('approvalFor('))
      .map((path) => relative(join(PKG_ROOT, 'src'), path));

    expect(callers).toEqual(['shared/api/host/approval-gate.ts']);
    expect(readFileSync(join(PKG_ROOT, 'src/shared/api/host/approval-gate.ts'), 'utf8')).toContain('declaredNote');
  });

  it('★ 外壳里只有插件命令那一处还在包附注（唯一来源：多一处或少了它，这条就红）', () => {
    const holders = sourceFiles(join(PKG_ROOT, 'src'))
      .filter((path) => !path.includes('__tests__') && !path.endsWith('.test.ts'))
      .filter((path) => readFileSync(path, 'utf8').includes('withApprovalNote'))
      .map((path) => relative(join(PKG_ROOT, 'src'), path));

    expect(holders).toEqual(['shared/api/host/plugin-tools.ts']);
  });

  it('★ 只包发给套件的那一份：dsh 那个注册表对象本身没被动过', () => {
    const h = rig();

    expect(h.ctx.get<DshToolRegistry>('tools')?.register).toBe(h.rawRegister);
    expect(h.scoped()?.get<DshToolRegistry>('tools')).not.toBe(h.registry);
  });

  it('套件看到的 ctx 其余成员照旧（别的服务、logger、provide 都还在）', () => {
    const h = rig();
    const ctx = h.scoped();

    expect(ctx?.get('demo-service')).toEqual({ ok: true });
    expect(typeof ctx?.provide).toBe('function');
    expect(ctx?.logger).toBeDefined();
    expect(ctx?.get('nothing-here')).toBeUndefined();
  });

  it('★ 类实例上的方法照旧能用（真实 ctx 是这种形状：方法里碰私有字段，this 必须是原来那个）', () => {
    const h = rig();
    const ctx = h.scoped() as unknown as { turn(): number };

    expect(ctx.turn()).toBe(1);
    expect(ctx.turn()).toBe(2);
  });
});
