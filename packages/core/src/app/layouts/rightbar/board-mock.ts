import { useMemo, useState } from 'react';
import type { UnitManifest } from '@dsh-workbench/shared';
import { mockModeOn } from '@/shared/hooks/mock-mode';

import type { BoardShape } from './board-shape';

export interface BoardMockExpect {
  readonly cards: number;
  readonly empty: boolean;
}

export interface BoardMock {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly shape: BoardShape;
  readonly expect?: BoardMockExpect;
}

const REAL: BoardMock = {
  id: 'real',
  label: '真实',
  note: '不接管：宿主配置里开着什么就摆什么。',
  shape: { kind: 'real' },
};

const EMPTY: BoardMock = {
  id: 'empty',
  label: '空看板',
  note: '一个模块都没开：内容区那条空态与它的两条出路。',
  shape: { kind: 'empty' },
  expect: { cards: 0, empty: true },
};

const UNREAD: BoardMock = {
  id: 'unread',
  label: '配置还没读到',
  note: '还没读到配置：内容区说一句"正在读取面板配置…"，头部 ⟳ 留着（按一下立刻重读）。',
  shape: { kind: 'unread' },
  expect: { cards: 0, empty: false },
};

const KIT: BoardMock = {
  id: 'kit',
  label: '公共组件预览',
  note: '把 shared 那套哑组件按"样式 + 交互"摆一遍（下拉的常规档与无边框档、搜索、分组、禁用、加载、手填退化、卡片头、状态、行、活动流、长任务那一行）：不碰配置、不读数据。',
  shape: { kind: 'kit' },
  expect: { cards: 1, empty: false },
};

export function buildBoardMocks(roster: readonly UnitManifest[]): readonly BoardMock[] {
  const hasCard = roster.some((manifest) => manifest.card !== null);
  const copies: readonly BoardMock[] = !hasCard
    ? []
    : [
        {
          id: 'one',
          label: '一张卡',
          note: '常态：面板上只有一个模块时的样子。',
          shape: { kind: 'copies', count: 1 },
          expect: { cards: 1, empty: false },
        },
        {
          id: 'two',
          label: '两张卡',
          note: '同一个模块摆两份 —— 量卡片之间的间距与分界（卡片夹具条已收起）。',
          shape: { kind: 'copies', count: 2 },
          expect: { cards: 2, empty: false },
        },
        {
          id: 'many',
          label: '八张卡（要滚）',
          note: '同一个模块摆八份 —— 量滚动、滚动条与底部留白（卡片夹具条已收起）。',
          shape: { kind: 'copies', count: 8 },
          expect: { cards: 8, empty: false },
        },
        {
          id: 'crash',
          label: '坏卡 + 好卡',
          note: '一张渲染必炸的卡 + 你装的模块（配 ?wbCrash=1 才摆得出来）：要看到坏的那张只剩一句"这个模块起不来"，别的卡与面板壳都还在。',
          shape: { kind: 'all' },
          expect: { cards: 1, empty: false },
        },
      ];

  return [REAL, KIT, ...copies, EMPTY, UNREAD];
}

export interface BoardFixtures {
  readonly mock: BoardMock | undefined;
  readonly mocks: readonly BoardMock[];
  readonly index: number;
  readonly pick: (next: number) => void;
  readonly shape: BoardShape;
}

const REAL_SHAPE: BoardShape = { kind: 'real' };

export function useBoardMock(roster: readonly UnitManifest[]): BoardFixtures {
  const [on] = useState(() => mockModeOn(window.location.search));
  const mocks = useMemo(() => (on ? buildBoardMocks(roster) : []), [on, roster]);
  const [index, setIndex] = useState(0);
  const mock = mocks[index];

  return { mock, mocks, index, pick: setIndex, shape: mock?.shape ?? REAL_SHAPE };
}
