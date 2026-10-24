import { describe, expect, it } from 'vitest';
import { editionOfPatch, withEdition } from '../sidebar-edition';

const OFFICIAL = `- id: ui-theme\n  config:\n    preference: dark\n`;

describe('editionOfPatch', () => {
  it('没有 ui-sidebar 那一行就是官方', () => {
    expect(editionOfPatch(OFFICIAL)).toBe('official');
    expect(editionOfPatch('[]\n')).toBe('official');
  });

  it('有 disabled: true 才是自定义', () => {
    expect(editionOfPatch(`${OFFICIAL}\n- id: ui-sidebar\n  disabled: true\n`)).toBe('custom');
    expect(editionOfPatch(`${OFFICIAL}\n- id: ui-sidebar\n  disabled: false\n`)).toBe('official');
  });

  it('insert 里的同名 id 不算', () => {
    const text = `- insert:\n    - id: ui-sidebar\n      disabled: true\n`;
    expect(editionOfPatch(text)).toBe('official');
  });
});

describe('withEdition', () => {
  it('自定义：追加一行，幂等', () => {
    const once = withEdition(OFFICIAL, 'custom');
    expect(editionOfPatch(once)).toBe('custom');
    expect(withEdition(once, 'custom')).toBe(once);
    expect(once).toContain('- id: ui-sidebar\n  disabled: true');
  });

  it('官方：把只有我们那一行的块整块删掉', () => {
    const custom = withEdition(OFFICIAL, 'custom');
    const back = withEdition(custom, 'official');
    expect(editionOfPatch(back)).toBe('official');
    expect(back).not.toContain('ui-sidebar');
    expect(back).toContain('ui-theme');
  });

  it('块里还有别的字段时只删 disabled', () => {
    const text = `${OFFICIAL}\n- id: ui-sidebar\n  name: '@deepseek-ai/dsh-client-ui-sidebar'\n  disabled: true\n`;
    const back = withEdition(text, 'official');
    expect(back).toContain("name: '@deepseek-ai/dsh-client-ui-sidebar'");
    expect(back).not.toContain('disabled: true');
    expect(editionOfPatch(back)).toBe('official');
  });

  it('空数组占位与末尾注释都保住', () => {
    const text = `[]\n# 我的设置\n- id: ui-theme\n  config:\n    preference: dark\n`;
    const custom = withEdition(text, 'custom');
    expect(custom).not.toContain('[]');
    expect(custom.split('\n')[0]).toBe('# 我的设置');
    expect(editionOfPatch(custom)).toBe('custom');
    const back = withEdition(custom, 'official');
    expect(back).toContain('# 我的设置');
    expect(back).toContain('ui-theme');
  });
});
