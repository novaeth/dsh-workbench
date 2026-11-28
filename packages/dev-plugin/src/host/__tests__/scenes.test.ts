import { describe, expect, it } from 'vitest';
import { validateWorld } from '@dsh-workbench/testkit';
import { SCENES } from '../scenes';

describe('夹具场景', () => {
  it('★ 每个场景都是合法世界（不变量 + provenance）', () => {
    expect(SCENES.length).toBeGreaterThan(0);
    for (const scene of SCENES) {
      expect(validateWorld(scene.world)).toEqual({ ok: true });
      expect(scene.world.provenance.kind).not.toBe('');
    }
  });

  it('场景 id 唯一、标签非空', () => {
    const ids = new Set<string>();
    for (const scene of SCENES) {
      expect(ids.has(scene.id)).toBe(false);
      ids.add(scene.id);
      expect(scene.label).not.toBe('');
    }
  });
});
