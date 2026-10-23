import { createElement as h } from 'react';
import { MockStrip } from '@/dev/MockStrip';

import type { BoardFixtures } from './board-mock';

export function BoardMockStrip({ fixtures, show }: { fixtures: BoardFixtures; show: boolean }) {
  const current = fixtures.mock;
  if (!show || current === undefined) return null;

  return (
    <MockStrip
      note={`夹具：只切形状，不碰真实配置；卡片上的数据看卡片夹具 —— ${current.note}`}
      mocks={fixtures.mocks}
      index={fixtures.index}
      onPick={fixtures.pick}
    />
  );
}
