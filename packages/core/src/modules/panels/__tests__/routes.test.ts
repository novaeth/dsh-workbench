import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import { createPanelsService } from '../model/service';
import { panelRoutes } from '../model/routes';

function unit(id: string, order: number): UnitManifest {
  return {
    id,
    titleKey: `${id}.title`, card: { order },
    tools: [],
    host: { inject: [] },
  };
}

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-route-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function mount(manifests: readonly UnitManifest[]) {
  return createPanelsService({ manifests: () => manifests, store: createWorkspaceStore({ root: dir }) });
}

describe('panelRoutes', () => {
  it('GET panels 返回服务里那份列表，而且只有这一个路由（没有写入口）', async () => {
    const panels = mount([unit('issues', 10), unit('ci', 20)]);
    const routes = panelRoutes(panels);

    expect(Object.keys(routes)).toEqual(['panels']);
    const payload = (await routes.panels?.(new URLSearchParams())) as { ok: boolean; units: Array<{ id: string }> };

    expect(payload.ok).toBe(true);
    expect(payload.units.map((entry) => entry.id)).toEqual(['issues', 'ci']);
  });

  it('配置改了以后投影跟着变（不是快照），而且是**按工作区**读的', async () => {
    const panels = mount([unit('issues', 10)]);
    const routes = panelRoutes(panels);
    const A = '/w/a';

    panels.show('issues', A);

    const payload = (await routes.panels?.(new URLSearchParams({ path: A }))) as {
      units: Array<{ shown: boolean }>;
    };
    expect(payload.units[0]?.shown).toBe(true);
    const other = (await routes.panels?.(new URLSearchParams({ path: '/w/b' }))) as {
      units: Array<{ shown: boolean }>;
    };
    expect(other.units[0]?.shown).toBe(false);
  });
});
