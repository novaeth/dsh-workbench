import { describe, expect, it } from 'vitest';
import { MODULE_VERSIONS_ROUTE } from '@dsh-workbench/shared/contract/protocol/bundle-install';
import { MARKET_INSTALLED_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import { PANELS_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import {
  CAPABILITY_ROUTE,
  HEALTH_ROUTE,
  REAL_SCENE,
  SCENES,
  sceneById,
} from '../scenes';

const MARKET_ROUTES = [
  HEALTH_ROUTE,
  CAPABILITY_ROUTE,
  MODULE_VERSIONS_ROUTE,
  MARKET_INSTALLED_ROUTE,
  PANELS_ROUTE,
];

function sceneOf(id: string) {
  const scene = sceneById(id);
  if (scene === undefined) throw new Error(`没有这个场景：${id}`);
  return scene;
}

describe('假宿主的场景表', () => {
  it('场景数与旧夹具对齐（旧的 ~96 屏，这里不少于 90）', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(90);
  });

  it('id 与标签都不重复，也不占用「真实」', () => {
    const ids = SCENES.map((scene) => scene.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(SCENES.map((scene) => scene.label)).size).toBe(SCENES.length);
    expect(ids).not.toContain(REAL_SCENE);
  });

  it('每个场景都答得出市场那一屏要的读口', () => {
    for (const scene of SCENES) {
      for (const route of MARKET_ROUTES) {
        expect(scene.routes[route], `${scene.id}: ${route}`).toBeDefined();
      }
    }
  });

  it('★ 正常读口场景都带工作台本体那一行（真实宿主里它不可能不存在）', () => {
    for (const scene of SCENES) {
      if (scene.id.startsWith('boot-')) continue;
      const reply = scene.routes[MODULE_VERSIONS_ROUTE] as { ok: boolean; workbench?: unknown };
      if (reply.ok === false) continue;
      expect(reply.workbench, scene.id).toBeDefined();
    }
  });

  it('空态那个场景的已装、插件、面板都是空的', () => {
    const routes = sceneOf('market-empty').routes;

    expect((routes[MODULE_VERSIONS_ROUTE] as { modules: readonly unknown[] }).modules).toHaveLength(0);
    expect((routes[MARKET_INSTALLED_ROUTE] as { modules: readonly unknown[] }).modules).toHaveLength(0);
    expect((routes[PANELS_ROUTE] as { units: readonly unknown[] }).units).toHaveLength(0);
  });

  it('读失败那个场景回的是真错误信封', () => {
    const reply = sceneOf('market-read-failed').routes[MODULE_VERSIONS_ROUTE] as {
      ok: boolean;
      error?: { code: string; message: string };
    };

    expect(reply.ok).toBe(false);
    expect(reply.error?.message).not.toBe('');
  });
});
