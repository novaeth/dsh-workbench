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

  it('★ 面板场景各自落在看板或面板配置，不混成一组', () => {
    const panel = SCENES.filter((scene) => scene.id.startsWith('panel-'));
    expect(panel.length).toBeGreaterThan(0);
    for (const scene of panel) {
      expect(scene.group === '面板' || scene.group === '面板配置').toBe(true);
    }
    const groupOf = (id: string): string | undefined => panel.find((scene) => scene.id === id)?.group;
    expect(groupOf('panel-empty')).toBe('面板');
    expect(groupOf('panel-unread')).toBe('面板');
    expect(groupOf('panel-one')).toBe('面板');
    expect(groupOf('panel-rows')).toBe('面板配置');
    expect(groupOf('panel-no-card')).toBe('面板配置');
    const board = panel.filter((scene) => scene.group === '面板').map((scene) => scene.id);
    expect(board).toEqual([
      'panel-one',
      'panel-empty',
      'panel-unread',
      'panel-manifests-reading',
      'panel-read-failed',
      'panel-manifests-failed',
      'panel-many-cards',
      'panel-card-crash',
      'panel-step',
    ]);
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
