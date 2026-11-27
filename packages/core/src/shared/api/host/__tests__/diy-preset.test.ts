import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DshAgentPresetDefinition,
  DshAgentPresetRegistry,
  DshAgentPresetUnregister,
  DshHostContext,
} from '@dsh-workbench/shared/host';
import { registerDiyPreset } from '../diy-preset';

const STANDARD = {
  id: 'standard',
  order: 1,
  plugins: [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'standard' } },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    {
      id: 'tool-plugin-manager',
      name: '@deepseek-ai/dsh-plugin-manager/tools',
      disabled: { __jsExpr: "!ctx.get('profileContext')" },
    },
  ],
};

const CUSTOM = {
  id: 'my-mode',
  order: 2,
  plugins: [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'custom' } },
    { id: 'tool-mine', name: '@dsh-workbench/module-mine' },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  ],
};

type RegisterFn = (definition: DshAgentPresetDefinition) => Promise<DshAgentPresetUnregister>;

interface Harness {
  readonly ctx: DshHostContext;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly info: ReturnType<typeof vi.fn>;
  readonly cleanups: (() => void)[];
}

const noopRegister: RegisterFn = async () => async () => undefined;

function harness(services: Record<string, unknown>, register: RegisterFn = noopRegister): Harness {
  const warn = vi.fn();
  const info = vi.fn();
  const cleanups: (() => void)[] = [];
  const registry: DshAgentPresetRegistry = { list: async () => [], register };
  const ctx = {
    get: (name: string) => (name === 'agentPresets' ? registry : services[name]),
    effect: (effect: () => void | (() => void)) => {
      const off = effect();
      if (typeof off === 'function') cleanups.push(off);
      return () => undefined;
    },
    logger: { warn, info },
    provide: () => () => undefined,
    inject: () => () => undefined,
    webServer: { register: () => () => undefined },
  } as unknown as DshHostContext;
  return { ctx, warn, info, cleanups };
}

const loaderOf = (...configs: unknown[]) => ({
  entries: () =>
    configs.map((config, index) => ({
      id: `include:preset-${index}`,
      options: { name: '@deepseek-ai/dsh-agent-preset', config },
    })),
});

interface Port {
  readonly current: () => string;
  readonly watch: (listener: () => void) => () => void;
  readonly notify: () => void;
  setSource: (source: string) => void;
}

function portOf(source = 'standard'): Port {
  let value = source;
  let listener: (() => void) | undefined;
  return {
    current: () => value,
    watch: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    notify: () => listener?.(),
    setSource: (next) => {
      value = next;
    },
  };
}

const flush = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

const idsOf = (definition: DshAgentPresetDefinition): readonly unknown[] =>
  definition.plugins.map((row) => (row as { id?: string }).id);

afterEach(() => {
  vi.useRealTimers();
});

describe('registerDiyPreset（启动时现场注册）', () => {
  it('★ 从用户选中的模式派生并注册：skill 目录指向本包，tool-cordis 补上', async () => {
    const off = vi.fn(async () => undefined);
    const register = vi.fn<RegisterFn>(async () => off);
    const { ctx, info } = harness({ loader: loaderOf(STANDARD) }, register);
    registerDiyPreset(ctx, portOf());
    await flush();
    expect(register).toHaveBeenCalledTimes(1);
    const definition = register.mock.calls[0]?.[0] as DshAgentPresetDefinition;
    expect(definition.id).toBe('workbench-diy');
    const skills = definition.plugins.find((row) => (row as { id?: string }).id === 'skill-filesystem') as {
      config?: { customSkillDirs?: string[] };
    };
    expect(skills.config?.customSkillDirs?.[0]).toMatch(/[\\/]skills$/);
    expect(definition.plugins.some((row) => (row as { id?: string }).id === 'tool-cordis')).toBe(true);
    expect(definition.description).toContain('基于「标准模式」');
    expect(info).toHaveBeenCalled();
  });

  it('★ 来源换成别的模式：派生结果带上那个模式的独有行', async () => {
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx } = harness({ loader: loaderOf(STANDARD, CUSTOM) }, register);
    registerDiyPreset(ctx, portOf('my-mode'));
    await flush();
    const definition = register.mock.calls[0]?.[0] as DshAgentPresetDefinition;
    expect(idsOf(definition)).toContain('tool-mine');
    const persona = definition.plugins.find((row) => (row as { id?: string }).id === 'persona') as {
      config?: { prefix?: string };
    };
    expect(persona.config?.prefix).toBe('custom');
  });

  it('★ 设置变了就换一份：先撤旧的再注册新的，来源没变不折腾', async () => {
    const order: string[] = [];
    const off = vi.fn(async () => {
      order.push('off');
    });
    const register = vi.fn<RegisterFn>(async (definition) => {
      order.push(`register:${String(definition.plugins.some((row) => (row as { id?: string }).id === 'tool-mine'))}`);
      return off;
    });
    const port = portOf();
    const { ctx } = harness({ loader: loaderOf(STANDARD, CUSTOM) }, register);
    registerDiyPreset(ctx, port);
    await flush();
    port.notify();
    await flush();
    expect(register).toHaveBeenCalledTimes(1);
    port.setSource('my-mode');
    port.notify();
    await flush();
    expect(register).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['register:false', 'off', 'register:true']);
  });

  it('★ 选中的模式不在 dsh 里：改用 standard 派生并说清楚', async () => {
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx, warn } = harness({ loader: loaderOf(STANDARD) }, register);
    registerDiyPreset(ctx, portOf('gone'));
    await flush();
    const definition = register.mock.calls[0]?.[0] as DshAgentPresetDefinition;
    expect(idsOf(definition)).not.toContain('tool-mine');
    expect(definition.description).toContain('原来源不可用');
    expect(definition.description).toContain('基于标准模式');
    expect(definition.description).not.toContain('（基于「标准模式」）');
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('gone');
  });

  it('★ 选中的模式派生不了（缺锚点）：也退回 standard，不把半份预设交出去', async () => {
    const broken = {
      id: 'broken',
      plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona' }],
    };
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx, warn } = harness({ loader: loaderOf(STANDARD, broken) }, register);
    registerDiyPreset(ctx, portOf('broken'));
    await flush();
    expect(register).toHaveBeenCalledTimes(1);
    const definition = register.mock.calls[0]?.[0] as DshAgentPresetDefinition;
    expect(definition.description).toContain('原来源无法派生');
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('broken');
  });

  it('★ 卸载时把注册撤掉（不把 preset 留在名册里）', async () => {
    const off = vi.fn(async () => undefined);
    const register = vi.fn<RegisterFn>(async () => off);
    const { ctx, cleanups } = harness({ loader: loaderOf(STANDARD) }, register);
    registerDiyPreset(ctx, portOf());
    await flush();
    expect(cleanups).toHaveLength(1);
    cleanups[0]?.();
    await flush();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('standard 还没出现就先等（250ms 一轮），不急着注册', async () => {
    vi.useFakeTimers();
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx, cleanups } = harness({ loader: loaderOf() }, register);
    registerDiyPreset(ctx, portOf());
    await flush();
    expect(register).not.toHaveBeenCalled();
    expect(cleanups).toHaveLength(1);
    cleanups[0]?.();
  });

  it('★ 锚点变了又退不回去：warn 并放弃注册', async () => {
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx, warn } = harness(
      {
        loader: loaderOf({
          id: 'standard',
          plugins: [{ id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' }],
        }),
      },
      register,
    );
    registerDiyPreset(ctx, portOf());
    await flush();
    expect(register).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('派生');
  });

  it('注册被拒（例如已经有同名 preset）只 warn，不抛到宿主', async () => {
    const register = vi.fn<RegisterFn>(async () => {
      throw new Error('Duplicate agent preset: workbench-diy');
    });
    const { ctx, warn } = harness({ loader: loaderOf(STANDARD) }, register);
    registerDiyPreset(ctx, portOf());
    await flush();
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('注册');
  });

  it('没有 loader / agentPresets 的服务也不炸（先等，卸载时收干净）', async () => {
    vi.useFakeTimers();
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx, cleanups } = harness({}, register);
    expect(() => registerDiyPreset(ctx, portOf())).not.toThrow();
    await flush();
    expect(register).not.toHaveBeenCalled();
    cleanups[0]?.();
  });
});
