import { describe, expect, it } from 'vitest';
import type { DshLoaderEntry } from '../../api/dsh.js';
import { DIY_PRESET_ID } from '../../contract/protocol/diy.js';
import { DiyPresetSourceError, diyPresetFrom, standardPresetConfigOf } from '../diy-preset.js';

const SKILLS = '/opt/workbench/skills';

function standard(overrides: { plugins?: unknown[] } = {}) {
  return {
    id: 'standard',
    order: 1,
    plugins: overrides.plugins ?? [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'x' } },
      { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { applyPatch: false } },
      { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
      { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
      {
        id: 'tool-plugin-manager',
        name: '@deepseek-ai/dsh-plugin-manager/tools',
        disabled: { __jsExpr: "!ctx.get('profileContext')" },
      },
    ],
  };
}

const idsOf = (value: { plugins: readonly unknown[] }) =>
  value.plugins.map((row) => (row as { id?: string }).id);

describe('diyPresetFrom（从 dsh 的 standard 现场派生）', () => {
  it('★ 三处差分都在：skill 两行搬到末尾、tool-cordis 补上、plugin-manager 打开', () => {
    const derived = diyPresetFrom(standard(), SKILLS);
    expect(idsOf(derived)).toEqual([
      'persona',
      'tool-fs',
      'tool-plugin-manager',
      'tool-cordis',
      'skill-filesystem',
      'tool-skill',
    ]);
    const manager = derived.plugins.find((row) => (row as { id?: string }).id === 'tool-plugin-manager') as {
      disabled?: unknown;
    };
    expect(manager.disabled).toBe(false);
    const skills = derived.plugins.find((row) => (row as { id?: string }).id === 'skill-filesystem') as {
      config?: { customSkillDirs?: string[] };
    };
    expect(skills.config?.customSkillDirs).toEqual([SKILLS]);
  });

  it('★ 兄弟行原样跟着走：dsh 加工具 / 改 config 不需要重新生成任何文件', () => {
    const source = standard();
    const derived = diyPresetFrom(source, SKILLS);
    const fs = derived.plugins.find((row) => (row as { id?: string }).id === 'tool-fs') as {
      config?: { applyPatch?: boolean };
    };
    expect(fs.config?.applyPatch).toBe(false);
    expect(derived.id).toBe(DIY_PRESET_ID);
    expect(derived.name).toBe('工作台 DIY 模式');
    expect(derived.order).toBe(9);
  });

  it('★ 输入的一份都不改（克隆后再动；否则会把 dsh 自己的 standard 也搬走两行）', () => {
    const source = standard();
    const manager = source.plugins.find((row) => (row as { id?: string }).id === 'tool-plugin-manager') as {
      disabled?: unknown;
    };
    const skills = source.plugins.find((row) => (row as { id?: string }).id === 'skill-filesystem') as {
      config?: unknown;
    };
    diyPresetFrom(source, SKILLS);
    expect(idsOf(source)).toEqual([
      'persona',
      'tool-fs',
      'skill-filesystem',
      'tool-skill',
      'tool-plugin-manager',
    ]);
    expect(manager.disabled).toEqual({ __jsExpr: "!ctx.get('profileContext')" });
    expect(skills.config).toBeUndefined();
  });

  it('dsh 已经把 tool-cordis 列进 standard：不再补第二行', () => {
    const derived = diyPresetFrom(
      standard({
        plugins: [
          { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
          { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
          { id: 'tool-cordis', name: '@deepseek-ai/dsh-tool-cordis' },
        ],
      }),
      SKILLS,
    );
    expect(idsOf(derived).filter((id) => id === 'tool-cordis')).toHaveLength(1);
  });

  it('★ 锚点变了就当场报错并点名（静默少一行 = DIY 会话少一把工具，且不报错）', () => {
    expect(() =>
      diyPresetFrom(
        standard({ plugins: [{ id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' }] }),
        SKILLS,
      ),
    ).toThrow(/skill-filesystem/);
    expect(() =>
      diyPresetFrom(
        standard({ plugins: [{ id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' }] }),
        SKILLS,
      ),
    ).toThrow(/tool-skill/);
    expect(() => diyPresetFrom({ id: 'standard' }, SKILLS)).toThrow(DiyPresetSourceError);
  });

  it('★ standard 里出现重复 id 就不派生（别把一份带重复行的 preset 交给 dsh）', () => {
    expect(() =>
      diyPresetFrom(
        standard({
          plugins: [
            { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
            { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
            { id: 'persona', name: '@deepseek-ai/dsh-persona' },
            { id: 'persona', name: '@deepseek-ai/dsh-persona' },
          ],
        }),
        SKILLS,
      ),
    ).toThrow(/persona/);
  });
});

describe('standardPresetConfigOf（从 loader 的行里认 standard）', () => {
  it('★ 认 agent-preset 插件 + config.id=standard，不是靠行 id 的 include 前缀', () => {
    const found = standardPresetConfigOf([
      { id: 'include:persona', options: { name: '@deepseek-ai/dsh-persona' } },
      {
        id: 'include:preset-standard',
        options: { name: '@deepseek-ai/dsh-agent-preset', config: standard() },
      },
    ] as unknown as Iterable<DshLoaderEntry>);
    expect(found).toBeDefined();
  });

  it('被关掉的那一行不算 / 没有 standard 就不猜', () => {
    expect(
      standardPresetConfigOf([
        {
          id: 'include:preset-standard',
          disabled: true,
          options: { name: '@deepseek-ai/dsh-agent-preset', config: standard() },
        },
      ] as unknown as Iterable<DshLoaderEntry>),
    ).toBeUndefined();
    expect(standardPresetConfigOf([])).toBeUndefined();
  });
});
