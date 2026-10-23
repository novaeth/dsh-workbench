import { describe, expect, it } from 'vitest';
import type { BoardModule, UnitManifest } from '@dsh-workbench/shared';
import { mergeMessages } from '@dsh-workbench/shared';
import { CRASH_FACE, CRASH_UNIT_ID, FIXTURE_FACE, FIXTURE_UNIT_ID, fixtureRoster, fixtureSeed } from '../fixture-unit-mock';
import { buildBoardMocks } from '@/app/layouts/rightbar/board-mock';
import { buildPanelMocks } from '@/app/layouts/rightbar/panel-mock';
import { buildMarketMocks } from '@/app/layouts/rightbar/market-mock';

const ROSTER: readonly UnitManifest[] = [
  {
    id: 'issues',
    card: { titleKey: 'issues.mine', order: 10 },
    tools: [],
    host: { inject: [] },
  },
];

const idsOf = (mocks: readonly { readonly id: string }[]): string[] => mocks.map((mock) => mock.id);

describe('示例单元（夹具的模板）', () => {
  it('花名册里没有带卡片的模块时，拿它当模板', () => {
    const roster = fixtureRoster([]);

    expect(roster).toEqual([FIXTURE_FACE.manifest]);
    expect(roster[0]?.card).not.toBeNull();
    expect(roster[0]?.id).toBe(FIXTURE_UNIT_ID);
  });

  it('★ 真模块优先：装了什么就用什么当模板（夹具上显示的是你自己的模块名）', () => {
    expect(fixtureRoster(ROSTER)).toBe(ROSTER);
    expect(fixtureSeed(ROSTER, [])).toEqual([]);
  });

  it('★ 一个模块都没装时，三张场景表照样铺满（与真花名册同样覆盖）', () => {
    const bare = fixtureRoster([]);

    expect(idsOf(buildBoardMocks(bare))).toEqual(idsOf(buildBoardMocks(ROSTER)));
    expect(idsOf(buildPanelMocks(bare))).toEqual(idsOf(buildPanelMocks(ROSTER)));
    expect(idsOf(buildMarketMocks(bare))).toEqual(idsOf(buildMarketMocks(ROSTER)));
    expect(buildMarketMocks(bare).length).toBeGreaterThan(10);
    expect(idsOf(buildMarketMocks([]))).toEqual(['empty']);
  });

  it('看板的"多张卡"场景：注册表空时摆示例卡，有真模块时摆真的', () => {
    const seed = fixtureSeed([], []);

    expect(seed).toHaveLength(1);
    expect(seed[0]?.id).toBe(FIXTURE_UNIT_ID);
    expect(typeof seed[0]?.View).toBe('function');
  });

  it('文案过得了合并那道关（键带单元前缀、zh/en 同构、能翻出标题）', () => {
    const merged = mergeMessages(
      { zh: {}, en: {} },
      [{ unit: FIXTURE_UNIT_ID, messages: FIXTURE_FACE.messages }],
    );

    expect(merged.zh[`${FIXTURE_UNIT_ID}.cardTitle`]).toBe('示例模块');
    expect(merged.en[`${FIXTURE_UNIT_ID}.cardTitle`]).toBe('Sample module');
  });

  it('★ 崩溃夹具：wbCrash 开着时第一张就是必炸的那张（其余照旧）', () => {
    const real: BoardModule = {
      id: 'issues',
      titleKey: 'issues.mine',
      order: 10,
      View: () => null,
    };
    const seed = fixtureSeed(ROSTER, [real], true);

    expect(seed.map((item) => item.id)).toEqual([CRASH_UNIT_ID, 'issues']);
    expect(() => (seed[0]?.View as () => unknown)()).toThrow(/wbCrash/);
    expect(seed[1]?.View).toBe(real.View);
    expect(CRASH_FACE.manifest.id).toBe(CRASH_UNIT_ID);
  });

  it('★ 崩溃夹具没开时一个字都不改（真机上它不存在）', () => {
    const real: BoardModule = {
      id: 'issues',
      titleKey: 'issues.mine',
      order: 10,
      View: () => null,
    };

    expect(fixtureSeed(ROSTER, [real]).map((item) => item.id)).toEqual(['issues']);
    expect(fixtureSeed([], [], false).map((item) => item.id)).toEqual([FIXTURE_UNIT_ID]);
  });
});
