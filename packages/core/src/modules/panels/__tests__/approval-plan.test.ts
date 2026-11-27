import { describe, expect, it } from 'vitest';
import { confirmVerdictFor } from '../model/approval-plan';
import { panelsApprovalFor } from '../model/approval-policy';
import { DIY_PLAN_TOOL } from '../unit';

const BODY = {
  see: ['哪几样低于 10 件'],
  do: ['点一下看明细'],
  agent: ['每天九点对一次账'],
  data: ['公司库存表，只读'],
};

const call = (destination: string, extra: Record<string, unknown> = {}) => ({
  name: DIY_PLAN_TOOL,
  arguments: { destination, summary: '盯库存低于 10 的', ...BODY, ...extra },
  session: 's1',
});

describe('三个计划去向都在方案提交时问一句', () => {
  it('★★ 标题带上这次复述', () => {
    const verdict = panelsApprovalFor()(call('board'));

    expect(verdict?.kind).toBe('ask');
    const question = verdict?.kind === 'ask' ? verdict.question.zh : '';
    expect(question).toBe('盯库存低于 10 的的方案');
  });

  it('★ 标题超过十五个字会截断', () => {
    const verdict = panelsApprovalFor()(call('board', { summary: '一二三四五六七八九十甲乙丙丁戊己' }));
    const question = verdict?.kind === 'ask' ? verdict.question.zh : '';

    expect(question).toBe('一二三四五六七八九十甲乙丙丁戊…的方案');
  });

  it('★ 不认可的去向不弹审批，交给计划工具拒绝', () => {
    for (const destination of ['once', 'ready', 'reroute']) {
      expect(panelsApprovalFor()(call(destination)), destination).toEqual({ kind: 'allow' });
    }
  });

  it('★★ 没有看板的模块也要点头：只是卡上没有字符画', () => {
    const verdict = panelsApprovalFor()(call('headless'));
    const question = verdict?.kind === 'ask' ? verdict.question.zh : '';

    expect(verdict?.kind).toBe('ask');
    expect(question).toBe('盯库存低于 10 的的方案');
  });

  it('★ 没有复述就不问（问也没内容给她看）', () => {
    expect(panelsApprovalFor()(call('board', { summary: '' }))).toEqual({ kind: 'allow' });
  });

  it('★ 改已有模块也要点头（改的是已经装上的东西）', () => {
    expect(panelsApprovalFor()(call('tweak'))?.kind).toBe('ask');
  });

  it('★★ 只定去向的那一次不弹（卡上还是空的），带上方案的那一次才弹', () => {
    const bare = { name: DIY_PLAN_TOOL, arguments: { destination: 'board', summary: '盯库存' }, session: 's1' };

    expect(panelsApprovalFor()(bare)).toEqual({ kind: 'allow' });
    expect(panelsApprovalFor()(call('board'))?.kind).toBe('ask');
  });

  it('★ 字符画也算方案在场', () => {
    const verdict = panelsApprovalFor()(
      call('board', { see: [], do: [], shots: [{ caption: '卡片', ascii: '┌──┐' }] }),
    );

    expect(verdict?.kind).toBe('ask');
  });
});

describe('审批只问会真正记下的那一次', () => {
  const at = (step: { readonly id: string; readonly title?: string } | null) =>
    panelsApprovalFor(undefined, undefined, undefined, undefined, () => step);

  it('★★ 还没开始流程就带方案：不弹，直接拒，并说清先交什么', () => {
    const verdict = at(null)(call('board'));

    expect(verdict?.kind).toBe('deny');
    expect(verdict?.kind === 'deny' ? verdict.reason : '').toContain('确认方案');
  });

  it('★ 停在查看数据来源：拒，并点名当前这一步', () => {
    const verdict = at({ id: 'probe', title: '查看数据来源' })(call('board'));

    expect(verdict?.kind).toBe('deny');
    expect(verdict?.kind === 'deny' ? verdict.reason : '').toContain('查看数据来源');
  });

  it('★★ 停在确认方案：才弹', () => {
    const verdict = at({ id: 'plan', title: '确认方案' })(call('board'));

    expect(verdict?.kind).toBe('ask');
    expect(confirmVerdictFor(call('board'), () => ({ id: 'plan', title: '确认方案' }))?.kind).toBe('ask');
  });

  it('★★ 改模块第一步就是确认方案：第一次带方案也要问', () => {
    const verdict = at(null)(call('tweak'));

    expect(verdict?.kind).toBe('ask');
  });
});
