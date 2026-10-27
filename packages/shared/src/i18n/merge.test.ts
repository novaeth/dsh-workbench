import { describe, expect, it } from 'vitest';
import { mergeMessages, mergeMessagesSkipping } from './merge.js';

const base = { zh: { 'board.title': '看板' }, en: { 'board.title': 'Board' } };

describe('mergeMessages', () => {
  it('把套件的键并进来；外壳原有的键不动', () => {
    const merged = mergeMessages(base, [
      {
        unit: 'issues',
        messages: { zh: { 'issues.mine': '我的缺陷' }, en: { 'issues.mine': 'My defects' } },
      },
    ]);

    expect(merged.zh).toEqual({ 'board.title': '看板', 'issues.mine': '我的缺陷' });
    expect(merged.en).toEqual({ 'board.title': 'Board', 'issues.mine': 'My defects' });
    expect(base.zh).toEqual({ 'board.title': '看板' });
  });

  it('没贡献文案的套件直接跳过', () => {
    expect(mergeMessages(base, [{ unit: 'nothing' }])).toEqual(base);
  });

  it('★ 键前缀必须等于套件 id（否则"这个键是谁的"说不清）', () => {
    expect(() =>
      mergeMessages(base, [
        { unit: 'issues', messages: { zh: { 'builds.title': '构建' }, en: { 'builds.title': 'Builds' } } },
      ]),
    ).toThrow(/必须以 "issues\." 开头/);
  });

  it('★ 与外壳自己的键撞名 → 抛，并报出双方是谁', () => {
    const legacy = { zh: { 'issues.title': '缺陷' }, en: { 'issues.title': 'Defects' } };

    expect(() =>
      mergeMessages(legacy, [
        { unit: 'issues', messages: { zh: { 'issues.title': '缺陷' }, en: { 'issues.title': 'Defects' } } },
      ]),
    ).toThrow(/文案键冲突：issues\.title 由 工作台 与 issues/);
  });

  it('★ 套件自己的两语言不同构 → 抛（外壳的类型管不到别的套件）', () => {
    expect(() =>
      mergeMessages(base, [
        {
          unit: 'issues',
          messages: { zh: { 'issues.a': '甲', 'issues.b': '乙' }, en: { 'issues.a': 'A' } },
        },
      ]),
    ).toThrow(/两语言不同构/);
  });

  it('★ 空文案 → 抛（空值会静默显示成空白）', () => {
    expect(() =>
      mergeMessages(base, [
        { unit: 'issues', messages: { zh: { 'issues.a': '   ' }, en: { 'issues.a': 'A' } } },
      ]),
    ).toThrow(/是空的/);
  });
});

describe('mergeMessagesSkipping', () => {
  const good = {
    unit: 'issues',
    messages: { zh: { 'issues.mine': '我的缺陷' }, en: { 'issues.mine': 'My defects' } },
  };
  const bad = {
    unit: 'inventory',
    messages: { zh: { 'wrong.prefix': '错了' }, en: { 'wrong.prefix': 'nope' } },
  };
  const later = {
    unit: 'builds',
    messages: { zh: { 'builds.recent': '最近构建' }, en: { 'builds.recent': 'Recent builds' } },
  };

  it('★ 一份坏文案只废它自己：好的照并、坏的报出来', () => {
    const { dictionaries, problems } = mergeMessagesSkipping(base, [good, bad, later]);

    expect(dictionaries.zh).toEqual({
      'board.title': '看板',
      'issues.mine': '我的缺陷',
      'builds.recent': '最近构建',
    });
    expect(dictionaries.en['builds.recent']).toBe('Recent builds');
    expect(problems).toHaveLength(1);
    expect(problems[0]?.unit).toBe('inventory');
    expect(problems[0]?.reason).toMatch(/必须以 "inventory\." 开头/);
  });

  it('★ 坏的在前、好的在后：后面那份不受影响（不会因为前者坏就整批拒收）', () => {
    const { dictionaries, problems } = mergeMessagesSkipping(base, [bad, good]);

    expect(dictionaries.zh['issues.mine']).toBe('我的缺陷');
    expect(problems.map((item) => item.unit)).toEqual(['inventory']);
  });

  it('都好时与 mergeMessages 逐字一致、没有问题', () => {
    const { dictionaries, problems } = mergeMessagesSkipping(base, [good, later]);

    expect(dictionaries).toEqual(mergeMessages(base, [good, later]));
    expect(problems).toEqual([]);
  });

  it('与外壳自己的键撞名的那份被跳过，且报的是撞名的双方', () => {
    const clash = {
      unit: 'board',
      messages: { zh: { 'board.title': '看板改' }, en: { 'board.title': 'Board!' } },
    };
    const { dictionaries, problems } = mergeMessagesSkipping(base, [clash]);

    expect(dictionaries.zh['board.title']).toBe('看板');
    expect(problems[0]?.reason).toMatch(/文案键冲突：board\.title 由 工作台 与 board/);
  });

  it('没带文案的那份直接跳过，不算问题', () => {
    const { dictionaries, problems } = mergeMessagesSkipping(base, [{ unit: 'nothing' }]);

    expect(dictionaries).toEqual(base);
    expect(problems).toEqual([]);
  });
});
