import { describe, expect, it } from 'vitest';
import type { DshLoaderEntry } from '../../../api/dsh.js';
import { DIY_PRESET_ID } from '../../../contract/protocol/diy.js';
import {
  DiyPresetSourceError,
  diyPresetFrom,
  diyPresetSourcesOf,
  presetConfigOf,
  standardPresetConfigOf,
} from '../diy-preset.js';

const SKILLS = '/opt/workbench/skills';

function standard(overrides: { id?: string; plugins?: unknown[] } = {}) {
  return {
    id: overrides.id ?? 'standard',
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

const entriesOf = (...configs: unknown[]): Iterable<DshLoaderEntry> =>
  configs.map((config, index) => ({
    id: `include:preset-${index}`,
    options: { name: '@deepseek-ai/dsh-agent-preset', config },
  })) as unknown as Iterable<DshLoaderEntry>;

describe('diyPresetFrom（从用户选中的模式现场派生）', () => {
  it('★ 三处差分都在：skill 两行搬到末尾、tool-cordis 补上、plugin-manager 打开', () => {
    const derived = diyPresetFrom(standard(), SKILLS, 'standard');
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

  it('★ 兄弟行原样跟着走：来源模式加工具 / 改 config 不需要重新生成任何文件', () => {
    const source = standard();
    const derived = diyPresetFrom(source, SKILLS, 'standard');
    const fs = derived.plugins.find((row) => (row as { id?: string }).id === 'tool-fs') as {
      config?: { applyPatch?: boolean };
    };
    expect(fs.config?.applyPatch).toBe(false);
    expect(derived.id).toBe(DIY_PRESET_ID);
    expect(derived.name).toBe('工作台 DIY 模式');
    expect(derived.order).toBe(9);
  });

  it('★ 换成别的来源：差分照旧，原名与顺序不跟着来源走', () => {
    const derived = diyPresetFrom(standard({ id: 'my-mode' }), SKILLS, 'my-mode');
    expect(derived.id).toBe(DIY_PRESET_ID);
    expect(derived.name).toBe('工作台 DIY 模式');
  });

  it('★ 输入的一份都不改（克隆后再动；否则会把 dsh 自己的模式也搬走两行）', () => {
    const source = standard();
    const manager = source.plugins.find((row) => (row as { id?: string }).id === 'tool-plugin-manager') as {
      disabled?: unknown;
    };
    const skills = source.plugins.find((row) => (row as { id?: string }).id === 'skill-filesystem') as {
      config?: unknown;
    };
    diyPresetFrom(source, SKILLS, 'standard');
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

  it('来源里已经把 tool-cordis 列进去了：不再补第二行', () => {
    const derived = diyPresetFrom(
      standard({
        plugins: [
          { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
          { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
          { id: 'tool-cordis', name: '@deepseek-ai/dsh-tool-cordis' },
        ],
      }),
      SKILLS,
      'standard',
    );
    expect(idsOf(derived).filter((id) => id === 'tool-cordis')).toHaveLength(1);
  });

  it('★ 锚点变了就当场报错并点名来源（静默少一行 = DIY 会话少一把工具，且不报错）', () => {
    expect(() =>
      diyPresetFrom(
        standard({ plugins: [{ id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' }] }),
        SKILLS,
        'my-mode',
      ),
    ).toThrow(/my-mode.*skill-filesystem/);
    expect(() =>
      diyPresetFrom(
        standard({ plugins: [{ id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' }] }),
        SKILLS,
        'my-mode',
      ),
    ).toThrow(/my-mode.*tool-skill/);
    expect(() => diyPresetFrom({ id: 'standard' }, SKILLS, 'my-mode')).toThrow(DiyPresetSourceError);
  });

  it('★ 来源里出现重复 id 就不派生（别把一份带重复行的 preset 交给 dsh）', () => {
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
        'standard',
      ),
    ).toThrow(/persona/);
  });
});

describe('presetConfigOf（从 loader 的行里认模式）', () => {
  it('★ 认 agent-preset 插件 + config.id，不是靠行 id 的 include 前缀', () => {
    const found = presetConfigOf(
      [
        { id: 'include:persona', options: { name: '@deepseek-ai/dsh-persona' } },
        {
          id: 'include:preset-standard',
          options: { name: '@deepseek-ai/dsh-agent-preset', config: standard() },
        },
      ] as unknown as Iterable<DshLoaderEntry>,
      'standard',
    );
    expect(found).toBeDefined();
  });

  it('被关掉的那一行不算 / 没有这个 id 就不猜', () => {
    expect(
      presetConfigOf(
        [
          {
            id: 'include:preset-standard',
            disabled: true,
            options: { name: '@deepseek-ai/dsh-agent-preset', config: standard() },
          },
        ] as unknown as Iterable<DshLoaderEntry>,
        'standard',
      ),
    ).toBeUndefined();
    expect(presetConfigOf([], 'standard')).toBeUndefined();
    expect(presetConfigOf(entriesOf(standard()), 'nope')).toBeUndefined();
    expect(standardPresetConfigOf(entriesOf(standard()))).toBeDefined();
  });
});

describe('diyPresetSourcesOf（可选的来源模式）', () => {
  it('★ 按 order 排，显示名与说明跟着声明走；DIY 自己不在候选里', () => {
    const rows = diyPresetSourcesOf(
      entriesOf(
        { ...standard(), id: 'late', order: 5, name: '后来的模式', description: '说明' },
        { ...standard(), id: 'early', order: 2 },
        { ...standard(), id: 'cordis', order: 3 },
        { ...standard(), id: DIY_PRESET_ID, order: 1 },
      ),
    );
    expect(rows.map((row) => row.id)).toEqual(['early', 'late']);
    expect(rows.map((row) => row.id)).not.toContain('cordis');
    expect(rows[1]).toEqual({
      id: 'late',
      name: '后来的模式',
      description: '说明',
      order: 5,
      usable: true,
    });
  });

  it('★ 缺 skill 两行 / 行不合法 / 重复 id 都标成不可用（界面据此禁选）', () => {
    const rows = diyPresetSourcesOf(
      entriesOf(
        { id: 'no-anchor', plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona' }] },
        {
          id: 'dup',
          plugins: [
            { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
            { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
            { id: 'persona', name: '@deepseek-ai/dsh-persona' },
            { id: 'persona', name: '@deepseek-ai/dsh-persona' },
          ],
        },
        { id: 'no-name', plugins: [{ id: 'skill-filesystem' }, { id: 'tool-skill' }] },
      ),
    );
    expect(rows.map((row) => [row.id, row.usable])).toEqual([
      ['dup', false],
      ['no-anchor', false],
      ['no-name', false],
    ]);
  });

  it('同名 id 只留一条；没有 plugins 表的声明也列出来但不可用', () => {
    const rows = diyPresetSourcesOf(
      entriesOf(standard(), standard(), { id: 'broken', order: 9 }),
    );
    expect(rows.map((row) => [row.id, row.usable])).toEqual([
      ['standard', true],
      ['broken', false],
    ]);
  });
});
