import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshAgentPresetDefinition, DshAgentPresetRegistry, DshAgentPresetUnregister, DshHostContext } from '@dsh-workbench/shared/host';
import { registerDiyPreset } from '../diy-preset';

const STANDARD = {
  id: 'standard',
  plugins: [
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    {
      id: 'tool-plugin-manager',
      name: '@deepseek-ai/dsh-plugin-manager/tools',
      disabled: { __jsExpr: "!ctx.get('profileContext')" },
    },
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

const loaderOf = (config: unknown) => ({
  entries: () => [{ id: 'include:preset-standard', options: { name: '@deepseek-ai/dsh-agent-preset', config } }],
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  vi.useRealTimers();
});

describe('registerDiyPreset（启动时现场注册）', () => {
  it('★ 从 loader 的 standard 行派生并注册：skill 目录指向本包，tool-cordis 补上', async () => {
    const off = vi.fn(async () => undefined);
    const register = vi.fn<RegisterFn>(async () => off);
    const { ctx, info } = harness({ loader: loaderOf(STANDARD) }, register);
    registerDiyPreset(ctx);
    await flush();
    expect(register).toHaveBeenCalledTimes(1);
    const definition = register.mock.calls[0]?.[0] as DshAgentPresetDefinition;
    expect(definition.id).toBe('workbench-diy');
    const skills = definition.plugins.find((row) => (row as { id?: string }).id === 'skill-filesystem') as {
      config?: { customSkillDirs?: string[] };
    };
    expect(skills.config?.customSkillDirs?.[0]).toMatch(/\/skills$/);
    expect(definition.plugins.some((row) => (row as { id?: string }).id === 'tool-cordis')).toBe(true);
    expect(info).toHaveBeenCalled();
  });

  it('★ 卸载时把注册撤掉（不把 preset 留在名册里）', async () => {
    const off = vi.fn(async () => undefined);
    const register = vi.fn<RegisterFn>(async () => off);
    const { ctx, cleanups } = harness({ loader: loaderOf(STANDARD) }, register);
    registerDiyPreset(ctx);
    await flush();
    expect(cleanups).toHaveLength(1);
    cleanups[0]?.();
    await flush();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('standard 还没出现就先等（250ms 一轮），不急着注册', async () => {
    vi.useFakeTimers();
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx, cleanups } = harness({ loader: { entries: () => [] } }, register);
    registerDiyPreset(ctx);
    await flush();
    expect(register).not.toHaveBeenCalled();
    expect(cleanups).toHaveLength(1);
    cleanups[0]?.();
  });

  it('★ 锚点变了就 warn 并放弃注册（不把半份预设交出去）', async () => {
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
    registerDiyPreset(ctx);
    await flush();
    expect(register).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('派生失败');
  });

  it('注册被拒（例如已经有同名 preset）只 warn，不抛到宿主', async () => {
    const register = vi.fn<RegisterFn>(async () => {
      throw new Error('Duplicate agent preset: workbench-diy');
    });
    const { ctx, warn } = harness({ loader: loaderOf(STANDARD) }, register);
    registerDiyPreset(ctx);
    await flush();
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('注册');
  });

  it('没有 loader / agentPresets 的服务也不炸（先等，卸载时收干净）', async () => {
    vi.useFakeTimers();
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const { ctx, cleanups } = harness({}, register);
    expect(() => registerDiyPreset(ctx)).not.toThrow();
    await flush();
    expect(register).not.toHaveBeenCalled();
    cleanups[0]?.();
  });
});
