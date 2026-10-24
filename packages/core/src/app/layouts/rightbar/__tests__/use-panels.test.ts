import { describe, expect, it } from 'vitest';
import { shouldDropPanels } from '../use-panels';

describe('shouldDropPanels', () => {
  it('同一工作区的重读（事实推送 / ⟳）不许丢名单', () => {
    expect(shouldDropPanels('/repo/operate-web', '/repo/operate-web')).toBe(false);
  });

  it('换工作区要丢', () => {
    expect(shouldDropPanels('/repo/auth-tob-web', '/repo/operate-web')).toBe(true);
  });

  it('还没有工作区 → 有了：算换（重读），但空名单本身没什么可丢的', () => {
    expect(shouldDropPanels('/repo/operate-web', null)).toBe(true);
    expect(shouldDropPanels(null, null)).toBe(false);
  });
});
