import { describe, expect, it } from 'vitest';
import type { Translate, UnitManifest } from '@dsh-workbench/shared';
import { dictionaries } from '@dsh-workbench/shared';
import type { MarketRow } from '../market-row-types';
import { installedRows, marketRows } from '../market-rows';
import { workbenchRow } from '../market-workbench-row';
import { listReadCardOf, rowProblemCardOf, selfUpdateFailureCardOf } from '../market-problem-card';
import { actionLabelKey } from '../market-view-text';

const CORE = '@dsh-workbench/core';

const t: Translate = (key, params) => {
  const text = (dictionaries.zh as Record<string, string>)[key] ?? key;
  if (params === undefined) return text;
  return Object.keys(params).reduce(
    (out, name) => out.replaceAll(`{${name}}`, String(params[name])),
    text,
  );
};

const MANIFEST: UnitManifest = {
  id: 'issues',
  titleKey: 'issues.mine',
  card: { order: 10 },
  tools: [],
  host: { inject: [] },
};

function row(over: Partial<MarketRow> = {}): MarketRow {
  return {
    id: 'issues',
    titleKey: 'issues.mine',
    label: 'issues',
    state: 'installed',
    canInstall: false,
    canUpdate: false,
    canUninstall: true,
    ...over,
  };
}

describe('市场行上的失败卡', () => {
  it('★ 启动失败：说启动失败与影响面，输出留给折叠区，复制给 agent 带位置与原因', () => {
    const card = rowProblemCardOf(
      t,
      row({ state: 'broken', problem: { kind: 'startup', detail: 'Error: boom\nstack' } }),
    );

    expect(card?.title).toBe('这个模块启动失败');
    expect(card?.fact).toBe('它在启动时报了错，其他模块不受影响。');
    expect(card?.actionLabel).toBe('重试');
    expect(card?.output).toBe('Error: boom\nstack');
    expect(card?.outputLabel).toBe('查看输出');
    expect(card?.fixLabel).toBe('复制给 agent');
    expect(card?.fix).toContain('模块市场');
    expect(card?.fix).toContain('原因：Error: boom');
  });

  it('★ 工作台安装损坏：命令原样放进卡里，复制的是命令，agent 提示词也带命令', () => {
    const broken = workbenchRow({
      pkg: CORE,
      installed: '',
      broken: true,
      rescue: 'dsh plugin --profile workbench add x',
    });
    const card = rowProblemCardOf(t, broken ?? row());

    expect(card?.title).toBe('工作台的安装已损坏');
    expect(card?.fact).toContain('请复制并执行下面的命令重新安装');
    expect(card?.command).toBe('dsh plugin --profile workbench add x');
    expect(card?.showCommand).toBe(true);
    expect(card?.fix).toBe('dsh plugin --profile workbench add x');
    expect(card?.fixLabel).toBe('复制安装命令');
    expect(card?.askAgent).toContain('dsh plugin --profile workbench add x');
  });

  it('★ 工作台安装损坏、但没有恢复命令：不给复制命令，只说让 agent 重新安装', () => {
    const broken = workbenchRow({ pkg: CORE, installed: '', broken: true });
    const card = rowProblemCardOf(t, broken ?? row());

    expect(card?.command).toBe('');
    expect(card?.showCommand).toBe(false);
    expect(card?.fix).toBe('');
    expect(card?.fact).toBe('无法读取它的安装信息，工作台可能无法启动。请让 agent 重新安装。');
  });

  it('★ 依赖没有重新安装：说清重启后再试，输出就是失败原因', () => {
    const failed = workbenchRow(
      { pkg: CORE, installed: '0.1.19' },
      { state: 'ok', at: '2026-11-27T00:00:00.000Z', version: '0.1.19', reinstall: { state: 'failed', attempts: 1, reason: 'ERR_PNPM' } },
    );
    const card = rowProblemCardOf(t, failed ?? row());

    expect(card?.title).toBe('更新已完成，依赖没有重新安装');
    expect(card?.fact).toBe('请重启工作台后重试；仍然失败时，按输出中的步骤手动安装。');
    expect(card?.output).toBe('ERR_PNPM');
    expect(card?.actionLabel).toBe('重试');
  });

  it('★ 配置和实际安装不一致：两个版本都写进事实，按钮叫重新安装', () => {
    const card = rowProblemCardOf(
      t,
      row({ problem: { kind: 'drift', declared: '0.4.2', installed: '0.4.1' } }),
    );

    expect(card?.title).toBe('工作台配置和实际安装不一致');
    expect(card?.fact).toBe('工作台配置记录的是 0.4.2，实际安装的是 0.4.1。请按配置记录的版本重新安装。');
    expect(card?.actionLabel).toBe('重新安装');
    expect(card?.output).toBe('');
  });

  it('★ 清单读不出来：重试 + 复制详情给 agent，证据叫查看详情', () => {
    const card = listReadCardOf(t, 'EACCES: /x/installed.json');

    expect(card.title).toBe('无法读取安装清单');
    expect(card.fact).toBe('已安装列表可能不完整。请重试；仍然失败时，把详情复制给 agent。');
    expect(card.output).toBe('EACCES: /x/installed.json');
    expect(card.outputLabel).toBe('查看详情');
    expect(card.hideOutputLabel).toBe('收起详情');
    expect(card.fixLabel).toBe('复制给 agent');
  });

  it('★ 更新失败：标题只有状态，不解释还能不能用；原因进输出', () => {
    const card = selfUpdateFailureCardOf(t, '换版没成 / ERR');

    expect(card.title).toBe('更新失败');
    expect(card.fact).toBe('');
    expect(card.output).toBe('换版没成 / ERR');
    expect(card.actionLabel).toBe('重试');
    expect(card.fix).toContain('更新失败');
  });
});

describe('行数据带上问题与状态词', () => {
  it('★ 能力读数是 failed：行带 startup 问题，状态词换成「启动失败」', () => {
    const [startup] = marketRows(
      [MANIFEST],
      { issues: { unit: 'issues', status: 'failed', needs: [], detail: 'boom' } },
      {},
      new Set(),
      {},
      new Set(),
    );

    expect(startup?.problem).toEqual({ kind: 'startup', detail: 'boom' });
    expect(startup?.stateKey).toBe('panels.market.startupFailed');
  });

  it('★ 配置记录的版本与实际安装不一致：行带 drift 问题', () => {
    const [drift] = installedRows(
      [{ unit: 'issues', pkg: 'pkg-issues', installed: '1.0.0', declared: '2.0.0' }],
      [MANIFEST],
      new Set(),
    );

    expect(drift?.problem).toEqual({ kind: 'drift', declared: '2.0.0', installed: '1.0.0' });
  });

  it('★ 工作台安装损坏 / 依赖没重装：行分别带 workbench-broken 与 reinstall', () => {
    const broken = workbenchRow({ pkg: CORE, installed: '', broken: true, rescue: 'dsh plugin add x' });
    expect(broken?.problem).toEqual({ kind: 'workbench-broken', command: 'dsh plugin add x' });

    const reinstall = workbenchRow(
      { pkg: CORE, installed: '0.1.19' },
      { state: 'ok', at: '2026-11-27T00:00:00.000Z', version: '0.1.19', reinstall: { state: 'failed', attempts: 1, reason: 'ERR' } },
    );
    expect(reinstall?.problem).toEqual({ kind: 'reinstall', detail: 'ERR' });
  });

  it('★ drift 行上那颗 install-version 也叫「重新安装」，和卡里同名', () => {
    expect(
      actionLabelKey(row({ problem: { kind: 'drift', declared: '2.0.0', installed: '1.0.0' } }), 'install-version'),
    ).toBe('panels.market.reinstall');
  });
});
