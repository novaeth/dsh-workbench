import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@dsh-workbench/shared';
import type { WorkbenchVersion } from '@/kernel/contract/bundle-install';
import { MARKET_DOT, MARKET_STATE_KEY, installedRows, marketActions, marketRows } from '../market-rows';
import { marketHintOf } from '../market-hint';
import { ACTION_LABEL_KEY } from '../market-view-text';
import { workbenchRow } from '../market-workbench-row';
import type { MarketRow } from '../market-rows';

const CORE = '@dsh-workbench/core';
const AT = '2026-10-23T01:00:00.000Z';

describe('市场里「工作台」自己那一行（四种处境）', () => {
  it('① 源上有新版 → 行上给一颗「更新」，段还是它自己那一段', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' });

    expect(row).toMatchObject({
      state: 'outdated',
      canUpdate: true,
      moduleUpdate: { installed: '0.1.18', latest: '0.1.19' },
      version: { installed: '0.1.18', latest: '0.1.19' },
      pkg: CORE,
    });
    expect(marketActions(row as MarketRow)).toEqual(['update-workbench']);
  });

  it('① 官方版本表说这一版跟当前 dsh 不兼容 → 不给更新，说明原因', () => {
    const row = workbenchRow({
      pkg: CORE,
      installed: '0.1.18',
      latest: '0.1.19',
      latestBlocked: 'incompatible',
    });

    expect(row).toMatchObject({
      state: 'outdated',
      canUpdate: false,
      hint: 'panels.market.workbenchUpdateNeedsDsh',
      moduleUpdate: { installed: '0.1.18', latest: '0.1.19', blocked: 'incompatible' },
    });
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('② 已经最新 → 只显示版本，不给按钮（也不许说"有新版"）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', latest: '0.1.19' });

    expect(row).toMatchObject({ state: 'installed', canUpdate: false, version: { installed: '0.1.19' } });
    expect(row?.moduleUpdate).toBeUndefined();
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('② 连源上的版本都问不到（没有 latest）→ 照样只是没按钮，不是"有新版"', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19' });

    expect(row?.state).toBe('installed');
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('③ 本仓那份（link: 装的）→ 不给更新，打「本地」标（源上有新版也不比）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19', local: true });

    expect(row).toMatchObject({ state: 'installed', canUpdate: false, local: true, version: { installed: '0.1.18' } });
    expect(row?.note).toBeUndefined();
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('④ 盘上是新版、运行中还是旧的 → 状态就是「重启后生效」（黄点，不是绿点「已安装」）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', running: '0.1.18' });

    expect(row).toMatchObject({
      state: 'pending-restart',
      canUpdate: false,
      version: { installed: '0.1.19' },
    });
    expect(row?.hint).toBeUndefined();
    expect(MARKET_DOT['pending-restart']).toBe('warning');
    expect(MARKET_STATE_KEY['pending-restart']).toBe('panels.market.pendingRestart');
    expect(marketActions(row as MarketRow)).toEqual(['later-restart']);
    expect(
      marketActions({ ...(row as MarketRow), canRestart: true }),
    ).toEqual(['restart-workbench', 'later-restart']);
    expect(
      marketActions({ ...(row as MarketRow), canRestart: true, restartDismissed: true }),
    ).toEqual([]);
  });

  it('④ 已经重启过（运行中 = 盘上）→ 就是绿的「已安装」，那半句不再挂', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', running: '0.1.19' });

    expect(row?.state).toBe('installed');
    expect(row?.hint).toBeUndefined();
  });

  it('④ 老宿主没报"运行中那一版" → 不瞎说（宁可不说，也不乱劝人重启）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19' });

    expect(row?.hint).toBeUndefined();
  });

  it('④ 本仓那份（link:）→ 不按"盘上 vs 运行中"判，只打「本地」标', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', running: '0.1.19', local: true });

    expect(row?.hint).toBeUndefined();
    expect(row).toMatchObject({ local: true, state: 'installed' });
    expect(row?.note).toBeUndefined();
  });

  it('④ 更新完又出了更新的版本 → 直接给「更新」，中间没有"还没生效"那一档', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', latest: '0.1.20' });

    expect(row?.hint).toBeUndefined();
    expect(marketActions(row as MarketRow)).toEqual(['update-workbench']);
  });

  it('⑤ 旧数据还没迁 → 黄点「旧数据待迁移」，给「迁移旧数据」和「不再提醒」', () => {
    const row = workbenchRow({
      pkg: CORE,
      installed: '0.1.19',
      followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false },
    });

    expect(row).toMatchObject({
      state: 'pending-followup',
      hint: 'panels.market.migrationHint',
      followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false },
    });
    expect(MARKET_STATE_KEY['pending-followup']).toBe('panels.market.pendingFollowUp');
    expect(marketActions(row as MarketRow)).toEqual(['migrate-workbench', 'dismiss-followup']);
  });

  it('⑤ 重启和待迁移同时存在 → 先重启，这一拍不给迁移按钮', () => {
    const row = workbenchRow({
      pkg: CORE,
      installed: '0.1.19',
      running: '0.1.18',
      followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false },
    });

    expect(row).toMatchObject({ state: 'pending-restart', followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false } });
    expect(row?.hint).toBeUndefined();
    expect(marketActions(row as MarketRow)).toEqual(['later-restart']);
  });

  it('⑤ 有新版也有旧数据 → 先迁移 + 不再提醒，不摆更新', () => {
    const row = workbenchRow({
      pkg: CORE,
      installed: '0.1.19',
      latest: '0.1.20',
      followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false },
    });

    expect(row).toMatchObject({ state: 'pending-followup', canUpdate: true });
    expect(marketActions(row as MarketRow)).toEqual(['migrate-workbench', 'dismiss-followup']);
  });

  it('⑤ 硬性的待办 → 只给处理动作，不给「不再提醒」', () => {
    const row = workbenchRow({
      pkg: CORE,
      installed: '0.1.19',
      followUp: { id: 'data-root-migration', kind: 'data-migration', hard: true },
    });

    expect(row?.state).toBe('pending-followup');
    expect(marketActions(row as MarketRow)).toEqual(['migrate-workbench']);
  });

  it('读不到装的是哪一份 → 这一行不出现（宁可不摆，也不摆一行瞎猜的）', () => {
    expect(workbenchRow(undefined)).toBeUndefined();
    expect(workbenchRow(null)).toBeUndefined();
    expect(workbenchRow({ pkg: CORE, installed: '' })).toBeUndefined();
  });

  it('★ profile 里还写着、盘上读不到 → 这一行不消失：说「装坏了」，并给可复制的救法', () => {
    const rescue = `dsh plugin --profile workbench add ${CORE}@latest`;
    const row = workbenchRow({ pkg: CORE, installed: '', broken: true, rescue });

    expect(row).toMatchObject({
      workbench: true,
      state: 'broken',
      broken: true,
      canInstall: false,
      canUpdate: false,
      canUninstall: false,
      pkg: CORE,
      note: { key: 'panels.market.workbenchBroken', params: { command: rescue }, tone: 'alert' },
    });
    expect(row?.note?.params.command).toBe(rescue);
    expect(MARKET_STATE_KEY['broken']).toBe('panels.market.broken');
    expect(MARKET_DOT['broken']).toBe('error');
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('★ 盘上读不到、又拼不出救法命令 → 照样是那一行，只说装坏了，不摆一条空命令', () => {
    const row = workbenchRow({ pkg: CORE, installed: '', broken: true });

    expect(row?.state).toBe('broken');
    expect(row?.note).toEqual({ key: 'panels.market.workbenchBrokenNoFix', params: {}, tone: 'alert' });
    expect(JSON.stringify(row)).not.toContain('undefined');
  });

  it('★ 更新刚跑完：装好了静默（只报版本），还排着队就说还排着队', () => {
    const done = workbenchRow({ pkg: CORE, installed: '0.1.19' }, { state: 'ok', at: AT }, undefined);

    expect(done?.note).toBeUndefined();
    expect(done?.hint).toBeUndefined();
    expect(done?.state).toBe('installed');

    const queued = workbenchRow(
      { pkg: CORE, installed: '0.1.18', latest: '0.1.19' },
      { state: 'queued', at: new Date().toISOString() },
      undefined,
    );

    expect(queued).toMatchObject({
      state: 'outdated',
      canUpdate: false,
      note: { key: 'panels.market.selfUpdateQueued', params: {}, tone: 'plain' },
    });
    expect(queued?.hint).toBeUndefined();
  });

  it('★ 没装成（本地还原 / 联网回滚）→ 说清还原到哪一版 + 原因，并留着「再试一次」', () => {
    for (const state of ['restored', 'rolled-back'] as const) {
      const row = workbenchRow(
        { pkg: CORE, installed: '0.1.18' },
        { state, at: AT, version: '0.1.18', reason: 'occupied' },
        undefined,
      );

      expect(row).toMatchObject({
        state: 'installed',
        canUpdate: true,
        hint: 'panels.market.selfUpdateReasonOccupied',
        note: {
          key:
            state === 'restored'
              ? 'panels.market.selfUpdateRestored'
              : 'panels.market.selfUpdateRolledBack',
          params: { version: '0.1.18' },
          tone: 'alert',
        },
      });
      expect(marketActions(row as MarketRow)).toEqual(['update-workbench']);
    }
  });

  it('★ 失败 → 原因 + 日志原文那条救法（可复制）+「再试一次」；没有原文就只说原因', () => {
    const withFix = workbenchRow(
      { pkg: CORE, installed: '0.1.18' },
      { state: 'failed', at: AT, version: '0.1.18', reason: 'incomplete', tail: '换版没成 / 救法：dsh plugin add x' },
      undefined,
    );

    expect(withFix).toMatchObject({
      canUpdate: true,
      hint: 'panels.market.selfUpdateReasonIncomplete',
      note: { key: 'panels.market.selfUpdateFailed', params: { fix: '救法：dsh plugin add x' }, tone: 'alert' },
    });
    expect(marketActions(withFix as MarketRow)).toEqual(['update-workbench']);

    const bare = workbenchRow({ pkg: CORE, installed: '0.1.18' }, { state: 'failed', at: AT }, undefined);

    expect(bare?.note).toEqual({ key: 'panels.market.selfUpdateFailedNoFix', params: {}, tone: 'alert' });
    expect(bare?.hint).toBe('panels.market.selfUpdateReasonUnknown');
  });

  it('★ 同一条 marker 已经告知过 → 下次打开那一行只报版本，不再打扰', () => {
    const update = { state: 'failed' as const, at: AT, version: '0.1.18' };
    const again = workbenchRow({ pkg: CORE, installed: '0.1.18' }, update, AT);

    expect(again?.note).toBeUndefined();
    expect(again?.hint).toBeUndefined();
    expect(workbenchRow({ pkg: CORE, installed: '0.1.18' }, update, undefined)?.note?.key).toBe(
      'panels.market.selfUpdateFailedNoFix',
    );
  });

  it('★ 没读到 marker（老宿主 / 还没读过那一格）→ 那一行跟以前一模一样', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' });

    expect(row?.note).toBeUndefined();
    expect(row?.hint).toBeUndefined();
    expect(marketActions(row as MarketRow)).toEqual(['update-workbench']);
  });

  it('★ 那颗钮就叫「更新」：Desktop 与 dsh web 一样，重启交给用户自己点', () => {
    expect(ACTION_LABEL_KEY['update-workbench']).toBe('panels.market.update');
    expect(dictionaries.zh['panels.market.update']).toBe('更新');
    expect(dictionaries.en['panels.market.update']).toBe('Update');
    expect((dictionaries.zh as Record<string, string>)['panels.market.updateAndRestart']).toBeUndefined();
    expect((dictionaries.en as Record<string, string>)['panels.market.updateAndRestart']).toBeUndefined();
    expect(readFileSync(new URL('../market-section.tsx', import.meta.url), 'utf8')).not.toContain(
      'updateLabelKey',
    );
  });

  it('★ 有就绪态那一行说的是「已就绪，重启后生效」；还在装的时候一个字都不许说「已更新」', () => {
    const swapped = { pkg: CORE, installed: '0.1.19', latest: '0.1.19', running: '0.1.18' };
    const ready = workbenchRow(swapped, { state: 'pending-restart', at: AT, from: '0.1.18', to: '0.1.19', version: '0.1.19' });

    expect(ready?.state).toBe('pending-restart');
    expect(ready?.note).toEqual({
      key: 'panels.market.selfUpdatePendingRestart',
      params: {},
      tone: 'plain',
    });
    const readyText = dictionaries.zh['panels.market.selfUpdatePendingRestart'] ?? '';
    expect(readyText).toContain('已就绪');
    expect(readyText).toContain('重启后生效');
    expect(readyText).not.toContain('已更新');
    expect(dictionaries.en['panels.market.selfUpdatePendingRestart'] ?? '').not.toBe('');
    const installing = { pkg: CORE, installed: '0.1.18', latest: '0.1.19', running: '0.1.18' };
    expect(workbenchRow(installing, { state: 'running', at: AT, from: '0.1.18', to: '0.1.19' })?.note).toBeUndefined();
  });

  it('★ 词条判据：自更新这几条人话里不许出现内部词', () => {
    const keys = [
      'panels.market.selfUpdatePendingRestart',
      'panels.market.selfUpdateQueued',
      'panels.market.selfUpdateRestored',
      'panels.market.selfUpdateRolledBack',
      'panels.market.selfUpdateFailed',
      'panels.market.selfUpdateFailedNoFix',
      'panels.market.pendingRestart',
      'panels.market.restartNeeded',
    ];
    const forbidden = ['profile', '组合包', 'node_modules', 'pnpm'];
    for (const key of keys) {
      for (const [language, dictionary] of [['zh', dictionaries.zh], ['en', dictionaries.en]] as const) {
        const text = ((dictionary as Record<string, string>)[key] ?? '').toLowerCase();
        expect(text, `${language}.${key}`).not.toBe('');
        for (const word of forbidden) {
          expect(text, `${language}.${key} → ${word}`).not.toContain(word);
        }
      }
    }
  });

  it('★ 还排着队 / 正在换的时候：那一行不给第二次点击的机会', () => {
    const version = { pkg: CORE, installed: '0.1.18', latest: '0.1.19' };
    const queued = workbenchRow(version, { state: 'queued', at: new Date().toISOString() }, undefined);
    const running = workbenchRow(version, { state: 'running', at: new Date().toISOString() }, undefined);
    const stale = workbenchRow(version, { state: 'running', at: '2020-01-01T00:00:00.000Z' }, undefined);
    const expired = workbenchRow(version, { state: 'queued', at: AT }, undefined);

    expect(queued?.canUpdate).toBe(false);
    expect(marketActions(queued as MarketRow)).toEqual([]);
    expect(running?.canUpdate).toBe(false);
    expect(marketActions(running as MarketRow)).toEqual([]);
    expect(stale?.canUpdate).toBe(true);
    expect(marketActions(stale as MarketRow)).toEqual(['update-workbench']);
    expect(expired?.canUpdate).toBe(true);
    expect(marketActions(expired as MarketRow)).toEqual(['update-workbench']);
  });
});

describe('工作台那一行：不混进模块里，也不单占一段', () => {
  it('★ 它不是模块行：模块名单（marketRows / installedRows）里永远不会出现它', () => {
    const manifests = [
      {
        id: 'issues',
        titleKey: 'issues.mine', card: { order: 10 },
        tools: [],
        host: { inject: [] },
        needs: [{ kind: 'extension', runtime: 'opencli', name: 'x', commands: ['y'], purpose: '测试' }],
      },
    ] as const;
    const capabilities = {
      issues: { unit: 'issues', status: 'ok' as const, needs: [] },
    };
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' });

    expect(row?.workbench).toBe(true);
    expect(marketRows(manifests, capabilities).map((item) => item.id)).toEqual(['issues']);
    expect(installedRows([{ unit: 'issues', pkg: '@a/issues', installed: '0.1.0' }], manifests, new Set()).map((item) => item.id)).toEqual(['issues']);
  });

  it('★ 它不再有自己那一段（段头说一遍、行里再说一遍 = 白占地方）', () => {
    const view = readFileSync(new URL('../MarketView.tsx', import.meta.url), 'utf8');

    expect(view).not.toContain('sectionWorkbench');
    for (const language of ['zh', 'en'] as const) {
      expect(dictionaries[language]['panels.market.sectionWorkbench' as never]).toBeUndefined();
    }
  });

  it('★ 左栏那枚「有新版本」也认它（否则面板上有新版、侧栏一声不响）', () => {
    const manifests = [
      {
        id: 'issues',
        titleKey: 'issues.mine', card: { order: 10 },
        tools: [],
        host: { inject: [] },
        needs: [{ kind: 'extension', runtime: 'opencli', name: 'x', commands: ['y'], purpose: '测试' }],
      },
    ] as const;
    const capabilities = {
      issues: { unit: 'issues', status: 'ok' as const, needs: [] },
    };
    const hintOf = (workbench: WorkbenchVersion | null) =>
      marketHintOf({ manifests, capabilities, modules: [], workbench });

    expect(hintOf(null)).toBeNull();
    expect(hintOf({ pkg: CORE, installed: '0.1.18' })).toBeNull();
    expect(hintOf({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' })).toEqual({
      labelKey: 'panels.market.hasNew',
      tone: 'warning',
    });
    expect(hintOf({ pkg: CORE, installed: '0.1.18', latest: '0.1.19', local: true })).toBeNull();
    expect(hintOf({ pkg: CORE, installed: '0.1.19', running: '0.1.18' })).toEqual({
      labelKey: 'panels.market.pendingRestart',
      tone: 'warning',
    });
    expect(hintOf({ pkg: CORE, installed: '0.1.19', followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false } })).toEqual({
      labelKey: 'panels.market.pendingFollowUp',
      tone: 'warning',
    });
    expect(hintOf({ pkg: CORE, installed: '', broken: true, rescue: 'dsh plugin add x' })).toEqual({
      labelKey: 'panels.market.hasProblem',
      tone: 'danger',
    });
  });
});

describe('工作台那一行上的人话', () => {
  it('★ 名字与「本地」标签两种语言都有，且不许出现内部词', () => {
    const internal = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    for (const language of ['zh', 'en'] as const) {
      for (const key of ['panels.market.workbenchName', 'panels.market.localMark'] as const) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        for (const word of internal) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
    }
    expect(dictionaries.zh['panels.market.workbenchName']).toBe('工作台');
    expect(dictionaries.en['panels.market.workbenchName']).toBe('Workbench');
  });

  it('★ 「装坏了」那两句两种语言都有：有命令的带 {command}，两种语言都不混排、不出内部词', () => {
    const internal = ['profile', 'bundle', 'payload', 'schema'];
    const han = (text: string): boolean => /[\u4e00-\u9fff]/.test(text);
    const englishRun = (text: string): boolean =>
      /[A-Za-z]+(?:\s+[A-Za-z]+)+/.test(text.replace('{command}', ''));
    for (const language of ['zh', 'en'] as const) {
      const withCommand = dictionaries[language]['panels.market.workbenchBroken'] ?? '';
      const noFix = dictionaries[language]['panels.market.workbenchBrokenNoFix'] ?? '';
      for (const [key, sentence] of [
        ['panels.market.workbenchBroken', withCommand],
        ['panels.market.workbenchBrokenNoFix', noFix],
      ] as const) {
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        expect(han(sentence), `${language}:${key}:han`).toBe(language === 'zh');
        expect(englishRun(sentence), `${language}:${key}:english`).toBe(language === 'en');
        for (const word of internal) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
      expect(withCommand, `${language}:withCommand`).toContain('{command}');
      expect(noFix, `${language}:noFix`).not.toContain('{command}');
    }
    expect(dictionaries.zh['panels.market.workbenchBroken']).toContain('读不到工作台那一份（装坏了）');
  });

  it('★ 自更新那四档的话两种语言都有：不混排、不出内部词', () => {
    const keys = [
      'panels.market.selfUpdateQueued',
      'panels.market.selfUpdateFailed',
      'panels.market.selfUpdateFailedNoFix',
      'panels.market.selfUpdateRestored',
      'panels.market.selfUpdateRolledBack',
      'panels.market.selfUpdateReasonOccupied',
      'panels.market.selfUpdateReasonIncomplete',
      'panels.market.selfUpdateReasonRollbackFailed',
      'panels.market.selfUpdateReasonUnknown',
    ] as const;
    const internal = ['profile', 'bundle', 'payload', 'schema', 'adapter', 'probe'];
    const han = (text: string): boolean => /[\u4e00-\u9fff]/.test(text);
    for (const language of ['zh', 'en'] as const) {
      for (const key of keys) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        expect(han(sentence), `${language}:${key}:han`).toBe(language === 'zh');
        for (const word of internal) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
    }
    expect(dictionaries.zh['panels.market.selfUpdateQueued']).toContain('退出 Desktop');
    expect(dictionaries.zh['panels.market.selfUpdateFailed']).toContain('{fix}');
  });
});

describe('迁移现场那一次：行上要说清"这次得先退出"', () => {
  it('★ 正在装（running）且是迁移现场 → 行上给那句提示', () => {
    const row = workbenchRow(
      { pkg: CORE, installed: '0.1.18', latest: '0.1.19' },
      { state: 'running', to: '0.1.19', migration: true },
    );

    expect(row?.hint).toBe('panels.market.selfUpdateMigration');
  });

  it('★ 不是迁移现场（已经迁过）→ 一句提示都不给', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' }, { state: 'running' });
    expect(row?.hint).toBeUndefined();
  });

  it('★ 失败时说清失败的因由，而不是那句迁移提示（因由优先）', () => {
    const row = workbenchRow(
      { pkg: CORE, installed: '0.1.18', latest: '0.1.19' },
      { state: 'failed', to: '0.1.19', migration: true, reason: 'incomplete', at: AT },
    );

    expect(row?.hint).toBe('panels.market.selfUpdateReasonIncomplete');
  });
});
