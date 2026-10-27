import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { dictionaries, mergeMessages, readDeclaration, unitTitleKey } from '@dsh-workbench/shared';
import { UNIT_TITLES_OWNER, unitTitlesOf } from '../unit-titles';

function manifest(id: string, title?: { zh: string; en: string }): UnitManifest {
  return {
    id,
    ...(title === undefined ? {} : { title }),
    titleKey: unitTitleKey(id),
    card: { order: 10 },
    tools: [],
    host: { inject: [] },
  };
}

describe('unitTitlesOf：清单里的名字 → 外壳的词表', () => {
  it('★ 中英各一条，键是外壳合成的那个（模块自己不用写名字键）', () => {
    expect(unitTitlesOf([manifest('hello', { zh: '示例模块', en: 'Sample module' })])).toEqual({
      unit: UNIT_TITLES_OWNER,
      messages: {
        zh: { [unitTitleKey('hello')]: '示例模块' },
        en: { [unitTitleKey('hello')]: 'Sample module' },
      },
    });
  });

  it('没有名字的清单（老夹具 / 没通过校验的）跳过，不编', () => {
    expect(unitTitlesOf([manifest('ghost')]).messages).toEqual({ zh: {}, en: {} });
    expect(unitTitlesOf([manifest('blank', { zh: ' ', en: '' })]).messages).toEqual({ zh: {}, en: {} });
  });

  it('★ 并进外壳词表之后 t() 就翻得出 —— 面板列表和市场行都靠这一步', () => {
    const merged = mergeMessages(dictionaries, [
      unitTitlesOf([
        manifest('a', { zh: '发布看板', en: 'Board' }),
        manifest('b', { zh: '库存', en: 'Inventory' }),
      ]),
    ]);

    expect(merged.zh[unitTitleKey('a')]).toBe('发布看板');
    expect(merged.en[unitTitleKey('a')]).toBe('Board');
    expect(merged.zh[unitTitleKey('b')]).toBe('库存');
  });

  it('★ 名字键跟着单元走，跟有没有卡片无关；注册完 t() 一定翻得出', () => {
    const read = (card: { order: number } | null): UnitManifest => {
      const one = readDeclaration('fixture', {
        apiVersion: 3,
        unit: 'gitops',
        title: { zh: 'GitOps', en: 'GitOps' },
        card,
        tools: [],
        host: { inject: [] },
      });
      if (one.manifest === undefined) throw new Error(one.problems.join('；'));
      return one.manifest;
    };
    const carded = read({ order: 10 });
    const bare = read(null);

    expect(carded.titleKey).toBe(unitTitleKey('gitops'));
    expect(bare.titleKey).toBe(unitTitleKey('gitops'));

    const merged = mergeMessages(dictionaries, [unitTitlesOf([carded, bare])]);
    expect(merged.zh[bare.titleKey]).toBe('GitOps');
    expect(merged.en[carded.titleKey]).toBe('GitOps');
  });

  it('清单换了一批名字：再合一次就是新的（旧键不残留由外壳整体重注册保证）', () => {
    const before = mergeMessages(dictionaries, [
      unitTitlesOf([manifest('a', { zh: '旧名字', en: 'Old' })]),
    ]);
    const after = mergeMessages(dictionaries, [
      unitTitlesOf([manifest('a', { zh: '新名字', en: 'New' })]),
    ]);

    expect(before.zh[unitTitleKey('a')]).toBe('旧名字');
    expect(after.zh[unitTitleKey('a')]).toBe('新名字');
  });
});
