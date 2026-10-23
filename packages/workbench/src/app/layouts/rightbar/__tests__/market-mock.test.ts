import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { buildMarketMocks } from '../market-mock';
import { installedPluginRows } from '../market-plugin-rows';
import { installedRows, marketActions, marketRows, sharedActions, sharedRows } from '../market-rows';
import { workbenchRow } from '../market-workbench-row';

const ROSTER: readonly UnitManifest[] = [
  {
    id: 'issues',
    card: { titleKey: 'issues.mine', order: 10 },
    tools: [],
    host: { inject: [] },
  },
];
const MARKET_MOCKS = buildMarketMocks(ROSTER);

describe('MARKET_MOCKS', () => {
  it('★ 每个场景都演示了它说的那个处境与按钮', () => {
    for (const mock of MARKET_MOCKS) {
      const rows = marketRows(mock.manifests, mock.capabilities, mock.updates);

      expect(rows, mock.id).toHaveLength(mock.expect.rows);
      if (mock.expect.installed !== undefined) {
        const installedList = installedRows(
          mock.installed ?? [],
          mock.manifests,
          new Set(rows.map((row) => row.id)),
        );
        expect(installedList, mock.id).toHaveLength(mock.expect.installed);
        if (mock.expect.installedState !== undefined) {
          expect(installedList[0]?.state, mock.id).toBe(mock.expect.installedState);
        }
        if (mock.expect.installedActions !== undefined) {
          expect(marketActions(installedList[0] as never), mock.id).toEqual(
            mock.expect.installedActions,
          );
        }
        if (mock.expect.installedNote === true) {
          expect(installedList[0]?.note?.key, mock.id).toBe('panels.market.moduleRefused');
        }
        if (mock.expect.installedHint !== undefined) {
          expect(installedList[0]?.hint, mock.id).toBe(mock.expect.installedHint);
          expect(installedList[0]?.note, mock.id).toBeUndefined();
        }
      }
      if (mock.expect.shared !== undefined) {
        expect(sharedRows(mock.manifests, mock.capabilities), mock.id).toHaveLength(mock.expect.shared);
      }
      if (mock.expect.version !== undefined) {
        expect(rows[0]?.version, mock.id).toEqual(mock.expect.version);
      }
      if (mock.expect.local !== undefined) {
        expect(rows[0]?.local, mock.id).toBe(mock.expect.local);
      }
      if (mock.expect.noteKey !== undefined) {
        expect(rows[0]?.note?.key, mock.id).toBe(mock.expect.noteKey);
      }
      if (mock.expect.plugins !== undefined) {
        const pluginList = installedPluginRows(mock.plugins ?? []);
        expect(pluginList, mock.id).toHaveLength(mock.expect.plugins);
        if (mock.expect.pluginActions !== undefined) {
          expect(marketActions(pluginList[0] as never), mock.id).toEqual(mock.expect.pluginActions);
        }
        if (mock.expect.pluginNote === true) {
          expect(pluginList[0]?.note, mock.id).toBeDefined();
        }
        if (mock.expect.pluginNote === false) {
          expect(pluginList[0]?.note, mock.id).toBeUndefined();
        }
        if (mock.expect.pluginNoteKey !== undefined) {
          expect(pluginList[0]?.note?.key, mock.id).toBe(mock.expect.pluginNoteKey);
        }
        if (mock.expect.pluginState !== undefined) {
          expect(pluginList[0]?.state, mock.id).toBe(mock.expect.pluginState);
        }
        if (mock.expect.notice === true) {
          expect(mock.notice ?? '', mock.id).not.toBe('');
        }
      }
      if (mock.expect.sharedActions !== undefined) {
        expect(sharedActions(sharedRows(mock.manifests, mock.capabilities)[0] as never), mock.id).toEqual(
          mock.expect.sharedActions,
        );
      }
      if (mock.expect.workbenchState !== undefined) {
        const self = workbenchRow(mock.workbench);
        expect(self?.state, mock.id).toBe(mock.expect.workbenchState);
        expect(marketActions(self as never), mock.id).toEqual(mock.expect.workbenchActions);
        if (mock.expect.workbenchNoteKey !== undefined) {
          expect(self?.note?.key, mock.id).toBe(mock.expect.workbenchNoteKey);
        }
      }
      if (mock.expect.state === undefined) continue;
      expect(rows[0]?.state, mock.id).toBe(mock.expect.state);
      expect(marketActions(rows[0] as never), mock.id).toEqual(mock.expect.actions);

      if (mock.expect.titleChars !== undefined) {
        expect(rows[0]?.titleKey.length, mock.id).toBeGreaterThanOrEqual(mock.expect.titleChars);
      }
    }
  });

  it('★ 每一行的名字都不为空（夹具不该演示一个空白标题）', () => {
    for (const mock of MARKET_MOCKS) {
      for (const row of marketRows(mock.manifests, mock.capabilities, mock.updates)) {
        expect(row.titleKey.trim(), mock.id).not.toBe('');
      }
    }
  });

  it('★ 边界场景覆盖了这四类：超长名字 / 超长原因 / 很多行 / 多个共用', () => {
    const ids = MARKET_MOCKS.map((mock) => mock.id);

    expect(ids).toContain('long-title');
    expect(ids).toContain('long-error');
    expect(ids).toContain('many');
    expect(ids).toContain('shared-many');
    expect(ids).toContain('long-env');
  });

  it('★ 插件那一段的两种边界各有场景：本地装的（只给卸载）与"卸了但文件还留着"', () => {
    const ids = MARKET_MOCKS.map((mock) => mock.id);

    expect(ids).toContain('plugin-local');
    expect(ids).toContain('plugin-kept');
    expect(ids).toContain('plugin-alias');
    expect(ids).toContain('plugin-broken');
  });

  it('★ 工作台自己那一行的四种处境各有场景：有新版 / 已最新 / 本仓那份 / 刚更新完（只有新版、没按钮）', () => {
    const ids = MARKET_MOCKS.map((mock) => mock.id);

    expect(ids).toContain('workbench-update');
    expect(ids).toContain('workbench-current');
    expect(ids).toContain('workbench-local');
    expect(ids).toContain('workbench-updated');
    const actionSets = MARKET_MOCKS.flatMap((mock) =>
      mock.expect.workbenchState === undefined ? [] : [(mock.expect.workbenchActions ?? []).join(',')],
    );
    expect(new Set(actionSets)).toEqual(new Set(['update-workbench', '']));
  });

  it('id 与按钮字都不重复（一个状态一个按钮）', () => {
    const ids = MARKET_MOCKS.map((mock) => mock.id);
    const labels = MARKET_MOCKS.map((mock) => mock.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('★ 夹具里也不漏插件名（交互层的口径，夹具不该破坏它）', () => {
    for (const mock of MARKET_MOCKS) {
      expect(JSON.stringify(marketRows(mock.manifests, mock.capabilities, mock.updates)), mock.id).not.toContain('fixture');
    }
  });

  it('每个处境都有场景（漏一个，评审就看不见那个状态）', () => {
    const states = new Set(MARKET_MOCKS.flatMap((mock) => (mock.expect.state === undefined ? [] : [mock.expect.state])));
    const actionSets = new Set(MARKET_MOCKS.map((mock) => (mock.expect.actions ?? []).join(',')));

    const installedActionSets = new Set(
      MARKET_MOCKS.flatMap((mock) =>
        (mock.expect.installedActions ?? []).length === 0
          ? []
          : [(mock.expect.installedActions ?? []).join(',')],
      ),
    );

    const installedStates = new Set(
      MARKET_MOCKS.flatMap((mock) =>
        mock.expect.installedState === undefined ? [] : [mock.expect.installedState],
      ),
    );

    expect(states).toEqual(new Set(['installed', 'outdated', 'missing', 'unknown', 'checking']));
    expect(installedStates).toEqual(new Set(['inactive', 'unusable', 'outdated']));
    expect(installedActionSets).toEqual(new Set(['remove-bundle', 'update-bundle,remove-bundle']));
    expect(actionSets).toEqual(new Set(['uninstall', 'update,uninstall', 'update-bundle,uninstall', 'install', '',]));
  });
});
