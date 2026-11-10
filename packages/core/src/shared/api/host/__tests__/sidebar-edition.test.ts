import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { editionOfPatch, sidebarEditionApply, withEdition } from '../sidebar-edition';

const OFFICIAL = `- id: ui-theme\n  config:\n    preference: dark\n`;

const CUSTOM = `${OFFICIAL}\n- id: ui-sidebar\n  disabled: true\n`;

const crlf = (text: string): string => text.replace(/\n/g, '\r\n');

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

describe('CRLF 的 cordis.patch.yml（Windows 记事本编辑 / autocrlf 检出）', () => {
  it('★ 档位照读：disabled: true 就是自定义', () => {
    expect(editionOfPatch(crlf(CUSTOM))).toBe('custom');
    expect(editionOfPatch(crlf(`${OFFICIAL}\n- id: ui-sidebar\n  disabled: false\n`))).toBe('official');
    expect(editionOfPatch(crlf(CUSTOM).replace('  disabled: true', '  disabled: true # 关掉右栏'))).toBe('custom');
  });

  it('★ insert 里的同名 id 照旧不算（CRLF 下也算得对）', () => {
    expect(editionOfPatch(crlf('- insert:\n    - id: ui-sidebar\n      disabled: true\n'))).toBe('official');
  });

  it('★ 已经是自定义再点自定义：不追加第二个块，也不吐出混行尾', () => {
    const next = withEdition(crlf(CUSTOM), 'custom');
    expect(next.match(/- id: ui-sidebar/g)).toHaveLength(1);
    expect(next).not.toContain('\r');
    expect(editionOfPatch(next)).toBe('custom');
  });

  it('★ CRLF 下也能切回官方，且不带残留', () => {
    const back = withEdition(crlf(CUSTOM), 'official');
    expect(back).not.toContain('ui-sidebar');
    expect(back).toContain('ui-theme');
    expect(back).not.toContain('\r');
    expect(editionOfPatch(back)).toBe('official');
  });

  it('★ 落到盘上：CRLF 文件改档位，写进去再读回来还是目标档位', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-sidebar-'));
    try {
      const path = join(dir, 'cordis.patch.yml');
      writeFileSync(path, crlf(CUSTOM), 'utf8');
      expect(await sidebarEditionApply({ profileDir: dir }, { edition: 'official' })).toEqual({
        ok: true,
        edition: 'official',
        reloadRequired: true,
      });
      const back = readFileSync(path, 'utf8');
      expect(back).not.toContain('ui-sidebar');
      expect(back).not.toContain('\r');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
