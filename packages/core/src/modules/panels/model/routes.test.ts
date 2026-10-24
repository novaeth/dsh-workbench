import { describe, expect, it } from 'vitest';
import { createValueHandoff } from '@dsh-workbench/shared/host';
import { panelsHandoffEntry } from './handoff';
import { panelRoutes } from './routes';
import type { PanelsService } from './service';

function fakePanels(own = false) {
  const seen: Array<string | null> = [];
  const machineSeen: Array<string | null> = [];
  const panels = {
    list: (path: string | null) => {
      if (path === null) machineSeen.push(path);
      else seen.push(path);
      return [{ id: 'inventory', shown: true }];
    },
    listPlugins: () => [],
    changedBy: () => new Map([['inventory', 2]]),
    boards: (path: string | null) => ({
      workspace: own && path !== null ? { shown: [], hidden: [] } : null,
      machine: null,
    }),
  } as unknown as PanelsService;
  return { panels, seen, machineSeen };
}

function fakeMachineOnly() {
  const machine: Array<string | null> = [];
  const panels = {
    changedBy: () => new Map([['inventory', 2]]),
    listPlugins: () => [],
    list: (path: string | null) => {
      machine.push(path);
      return path === null
        ? [
            { id: 'inventory', shown: true },
            { id: 'deploy', shown: false },
          ]
        : [{ id: 'inventory', shown: false }];
    },
    boards: () => ({ workspace: null, machine: null }),
  } as unknown as PanelsService;
  return { panels, machine };
}

describe('panelRoutes（panels）', () => {
  it('★ 工具刚交过 → 领走它，连服务都不调（面板的模块名单与 agent 看到的是同一份）', async () => {
    const { panels, seen, machineSeen } = fakePanels();
    const values = createValueHandoff();
    const entry = panelsHandoffEntry({ path: '/w/web' });
    if (entry === undefined) throw new Error('这个工作区算不出交接键');
    values.hand(entry, [{ id: 'issues', shown: false }]);

    const response = await panelRoutes(panels, values)['panels']?.(new URLSearchParams('path=/w/web'));

    expect(response).toMatchObject({
      ok: true,
      units: [{ id: 'issues', shown: false }],
      own: false,
    });
    expect(seen).toEqual([]);
    expect(machineSeen).toEqual([null]);
  });

  it('没交过 / 键不同（另一个工作区）→ 照旧问服务', async () => {
    const { panels, seen } = fakePanels();
    const values = createValueHandoff();
    const other = panelsHandoffEntry({ path: '/w/other' });
    if (other === undefined) throw new Error('这个工作区算不出交接键');
    values.hand(other, [{ id: 'issues' }]);

    const response = await panelRoutes(panels, values)['panels']?.(new URLSearchParams('path=/w/web'));

    expect(response).toMatchObject({ ok: true, units: [{ id: 'inventory', shown: true }] });
    expect(seen).toEqual(['/w/web']);
  });

  it('没有 path 的读者（不知道在哪个工作区）也照样能读，只是领不到交接', async () => {
    const { panels, seen, machineSeen } = fakePanels();

    const response = await panelRoutes(panels)['panels']?.(new URLSearchParams(''));

    expect(response).toMatchObject({ ok: true });
    expect(seen).toEqual([]);
    expect(machineSeen).toEqual([null, null]);
  });

  it('★ 回包里带上"机器级默认开了哪些"与"这个工作区有没有自己那份板"（市场与面板两屏各取所需）', async () => {
    const { panels, machine } = fakeMachineOnly();

    const response = (await panelRoutes(panels)['panels']?.(
      new URLSearchParams('path=/w/web'),
    )) as { defaults?: readonly string[]; own?: boolean } | undefined;

    expect(response?.defaults).toEqual(['inventory']);
    expect(response?.own).toBe(false);
    expect((response as { changed?: Record<string, number> } | undefined)?.changed).toEqual({
      inventory: 2,
    });
    expect(machine).toContain(null);

    const own = (await panelRoutes(fakePanels(true).panels)['panels']?.(
      new URLSearchParams('path=/w/web'),
    )) as { own?: boolean } | undefined;
    expect(own?.own).toBe(true);
  });
});
