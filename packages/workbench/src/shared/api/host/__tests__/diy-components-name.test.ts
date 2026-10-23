import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  faceStateOf,
  listedNamesOf,
  nearNamesOf,
  renderNameText,
  renderSurfaceText,
  skillDirOf,
} from '../diy-components';
import { kit, primitives } from './diy-components-samples';

describe('workbench_diy_components · 给名字', () => {
  it('★ 给名字：回绝对路径 + 那份类型文件的原文；找不到就回近似的名字', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-comp-'));
    try {
      const file = join(dir, 'Button.d.ts');
      writeFileSync(file, '/** Render a button. */\nexport declare const Button: 1;\n');
      const found = renderNameText('Button', { file, from: 'primitives' }, { primitives, kit });
      expect(found).toContain(`Button → ${file}（原语）`);
      expect(found).toContain('/** Render a button. */');
      expect(found).toContain('原语件要先在 dsh.client.external 里声明它');
      const bare = join(dir, 'Bare.d.ts');
      writeFileSync(bare, 'export declare function bare(one: string): void;\n');
      const noDoc = renderNameText('Bare', { file: bare, from: 'kit' }, { primitives, kit });
      expect(noDoc).toContain('声明没说明文字');
      expect(noDoc).toContain('LINKAGE.md');
      const missing = renderNameText('Buton', null, { primitives, kit });
      expect(missing).toContain('没有「Buton」');
      expect(missing).toContain('Button');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('workbench_diy_components · kit 那批的说明文字', () => {
  it('skillDirOf 从深处往上找 skills/workbench-module-diy（找不到回 null）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-wb-skill-'));
    try {
      expect(skillDirOf(root)).toBeNull();
      const skill = join(root, 'skills', 'workbench-module-diy');
      mkdirSync(skill, { recursive: true });
      writeFileSync(join(skill, 'KIT.md'), '# KIT\n');
      const deep = join(root, 'dist', 'host');
      mkdirSync(deep, { recursive: true });
      expect(skillDirOf(deep)).toBe(skill);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('★ 没说明的 kit 件：说清"该有而没有"（多半是外壳比工具旧），只给跨件文档，不塞别人的话', () => {
    const bare = join(mkdtempSync(join(tmpdir(), 'dsh-wb-bare-')), 'useVisibleBusy.d.ts');
    writeFileSync(bare, 'export declare function useVisibleBusy(active: boolean, floorMs: number): BusyView;\n');
    try {
      const text = renderNameText('useVisibleBusy', { file: bare, from: 'kit' }, { primitives, kit });
      expect(text).toContain('声明没说明文字（没有 JSDoc）');
      expect(text).toContain('多半是你手上这份外壳比工具旧');
      expect(text).toContain('KIT.md');
      expect(text).not.toContain('指引里没有专门讲');
    } finally {
      rmSync(bare, { force: true });
    }
  });
});

describe('workbench_diy_components · 找不到的时候别撒谎', () => {
  it('★ 名字在清单里、只是扫不到文件：说"扫不到类型文件"，不说"没有这个东西"', () => {
    const noFiles = { buckets: { components: ['Card'], hooks: ['useApiResource'] }, files: {} };
    const text = renderNameText('Card', null, { kit: noFiles });

    expect(text).toContain('「Card」在清单里');
    expect(text).toContain('扫不到它的类型文件');
    expect(text).not.toContain('没有「Card」');
  });

  it('★ 原语侧同理（onlyPrimitives 里点过名，但没有 files）', () => {
    const noFiles = { onlyPrimitives: { components: ['Button'] }, files: {}, installed: { version: '0.2.1-rc.2' } };
    const text = renderNameText('Button', null, { primitives: noFiles });

    expect(text).toContain('「Button」在清单里');
    expect(text).not.toContain('没有「Button」');
  });

  it('清单里真没有：说"没有"，并给近似名（打错也认）', () => {
    const text = renderNameText('Buton', null, { primitives, kit });

    expect(text).toContain('没有「Buton」这个东西');
    expect(text).toContain('近似的名字：Button');
  });

  it('listedNamesOf 把三个来源并起来：files / buckets / onlyPrimitives（去重、排序）', () => {
    expect(listedNamesOf({ primitives, kit })).toEqual(
      ['Button', 'Card', 'IconSearchOutlineRegular', 'Modal', 'relativeTime', 'useAnchoredPosition', 'useApiResource'].sort(),
    );
  });
});

describe('workbench_diy_components · 不知道 ≠ 没有（2026-10-20 真机假阴性）', () => {
  const notInstalled = { installed: null, pinned: null, modules: [], snippet: { devDependency: { name: '@deepseek-ai/dsh-client-ui-primitives', version: '0.2.1-rc.2' } } };

  it('★ 原语没装：kit 那一面照旧拍板("kit 里没有")，只有"在不在原语里"说不了 + 给补法', () => {
    const text = renderNameText('MockStrip', null, { kit, primitives: notInstalled });

    expect(text).toContain('「MockStrip」kit 里没有');
    expect(text).toContain('原语那一面读不到（没装）');
    expect(text).toContain('"@deepseek-ai/dsh-client-ui-primitives": "0.2.1-rc.2"');
    expect(text).not.toContain('没法确认');
    expect(text).not.toContain('没有「MockStrip」');
  });

  it('★ 现编的乱码也一样：能拍板的先拍板，不含糊过去', () => {
    const text = renderNameText('ZzzNotAThing', null, { kit, primitives: notInstalled });

    expect(text).toContain('「ZzzNotAThing」kit 里没有');
    expect(text).not.toContain('没法确认');
  });

  it('两个面都读不到，才是"没法确认"', () => {
    const text = renderNameText('Whatever', null, { kit: { files: {}, roots: {} }, primitives: notInstalled });

    expect(text).toContain('没法确认「Whatever」在不在');
    expect(text).not.toContain('kit 里没有');
  });

  it('★ 只查了 kit（scope=kit）：说"原语那一面这次没查"，不是"没有"', () => {
    const text = renderNameText('Button', null, { kit });

    expect(text).toContain('「Button」kit 里没有');
    expect(text).toContain('原语那一面没查');
    expect(text).toContain('不给 scope 就都查');
    expect(text).not.toContain('没有「Button」');
  });

  it('两个面都查了、都读得到，才敢说"没有"', () => {
    expect(renderNameText('Nope', null, { kit, primitives })).toContain('没有「Nope」这个东西');
  });

  it('faceStateOf：没查 / 读得到 / 读不到 三态都说对', () => {
    expect(faceStateOf({}, 'kit')).toBe('not-queried');
    expect(faceStateOf({ primitives: notInstalled }, 'primitives')).toBe('unreadable');
    expect(faceStateOf({ primitives }, 'primitives')).toBe('ok');
    expect(faceStateOf({ kit: { files: {}, roots: {} } }, 'kit')).toBe('unreadable');
    expect(faceStateOf({ kit }, 'kit')).toBe('ok');
  });

  it('★ 近似名不再拿单字母凑数（kit 面里真有 h / cx / zh）', () => {
    expect(nearNamesOf('IconSearchOutlineRegular', ['h', 'cx', 'zh', 'en', 'Card'])).toEqual([]);
    expect(nearNamesOf('h', ['h', 'Card'])).toEqual(['h']);
  });

  it('★ 原语没装时：输出里给一遍补法（只一遍），页脚不拿 Button 这类举例', () => {
    const text = renderSurfaceText({ kit, primitives: notInstalled }, { scope: 'all', all: false });

    expect(text).toContain('原语：没装 —— devDependencies 加');
    expect(text).toContain('0.2.1-rc.2');
    expect(text.match(/devDependencies 加/gu)).toHaveLength(1);
    expect(text).not.toContain('name=Button');
  });
});

describe('workbench_diy_components · 清单就是清单（诊断不进这里）', () => {
  it('★ 就算载荷里带着 problems，渲染出来也不出现判据 / 诊断字样', () => {
    const dirty = {
      primitives,
      kit: { ...kit, problems: ['@neg/module-kit: 用了这份外壳里没有的 kit.components.StateBlock'] },
    };

    const summary = renderSurfaceText(dirty, { scope: 'all', all: false });
    const one = renderNameText('Card', { file: '/w/shared/dist/components/Card.d.ts', from: 'kit' }, dirty);
    for (const text of [summary, one]) {
      expect(text).not.toContain('problems');
      expect(text).not.toContain('判据');
      expect(text).not.toContain('StateBlock:');
      expect(text).not.toContain('红着');
    }
  });
});
