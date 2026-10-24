import { createElement as h } from 'react';
import { devSurface } from '@/shared/dev-surface';

import type { BoardFixtures } from './board-mock';

export function BoardMockStrip({ fixtures, show }: { fixtures: BoardFixtures; show: boolean }) {
  const current = fixtures.mock;
  if (!show || current === undefined) return null;
  const MockStrip = devSurface.Strip;

  return (
    <MockStrip
      note={`夹具：只切形状，不碰真实配置；卡片上的数据看卡片夹具 —— ${current.note}`}
      mocks={fixtures.mocks}
      index={fixtures.index}
      onPick={fixtures.pick}
    />
  );
}
