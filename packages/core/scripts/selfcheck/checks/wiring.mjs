import { pkg, read, sourceIndex } from '../lib.mjs';

const marketPanel = () => read(pkg('src/app/layouts/market/panel.tsx'));

export const checks = [
  {
    title: '★ 卡片的 ⟳ 都要能转（refreshing → wb-spinning，两个套件同一颗按钮不许长得不一样）',
    run(ctx, report) {

      ctx.sources = sourceIndex();
      const cardRefreshSites = [];
      for (const { name, source } of ctx.sources) {
        for (const line of source.split('\n')) {
          if (line.includes('wb-cardRefresh')) cardRefreshSites.push({ file: name, line: line.trim() });
        }
      }
      const silentRefreshes = cardRefreshSites.filter((site) => !site.line.includes('wb-spinning'));
      report(
        '★ 卡片的 ⟳ 都要能转（refreshing → wb-spinning，两个套件同一颗按钮不许长得不一样）',
        cardRefreshSites.length > 0 && silentRefreshes.length === 0,
        silentRefreshes.length === 0
          ? `${cardRefreshSites.length} 处都带 wb-spinning`
          : silentRefreshes.map((site) => `${site.file}: ${site.line}`).join(' · '),
      );
    },
  },
  {
    title: '★ 面板刷新凭据只许 ⟳ 自增（配置变更走事实，不许借它去刷所有卡）',
    run(ctx, report) {

      const rightbarSource = read(pkg('src/app/layouts/rightbar/Rightbar.tsx'));
      const panelTokenBumps = (rightbarSource.match(/setPanelToken\(/g) ?? []).length;
      report(
        '★ 面板刷新凭据只许 ⟳ 自增（配置变更走事实，不许借它去刷所有卡）',
        panelTokenBumps === 1,
        `Rightbar.tsx 里出现了 ${panelTokenBumps} 处 setPanelToken(（应当只有 ⟳ 那一处）`,
      );
    },
  },
  {
    title: '★ 市场页装完/卸完只重取、不强探（宿主在动作里已经强探过并回写了缓存）',
    run(ctx, report) {

      const marketOnChanged = marketPanel().match(/onChanged=\{[^}]*\}/g) ?? [];
      report(
        '★ 市场页装完/卸完只重取、不强探（宿主在动作里已经强探过并回写了缓存）',
        marketOnChanged.length === 1 && marketOnChanged[0] === 'onChanged={reload}',
        `market/panel.tsx 里的绑定是 ${marketOnChanged.join(' ') || '（没找到）'}（应当是 onChanged={reload}）`,
      );
    },
  },
  {
    title: '★ 进市场页不强探（有结论且新鲜就一次都不探；只有"没结论 / 过旧"才后台补一次）',
    run(ctx, report) {

      const source = marketPanel();
      const marketEnterProbe =
        source.match(/if \(!shouldProbeOnEnter\(\{[\s\S]{0,120}?markNextProbeSilent\(\);[\s\S]{0,80}?forceProbe\(\);/g) ?? [];
      report(
        '★ 进市场页不强探（有结论且新鲜就一次都不探；只有"没结论 / 过旧"才后台补一次）',
        marketEnterProbe.length === 1 && source.includes('shouldProbeOnEnter('),
        marketEnterProbe.length === 1
          ? '进页面那次补探先过 shouldProbeOnEnter 判据（别退回"挂载即强探"）'
          : `进页面那次补探的写法变了（找到 ${marketEnterProbe.length} 处）—— 判据应当是 shouldProbeOnEnter`,
      );
    },
  },
  {
    title: '★ 能力结论只有一份（读者各自 useState 存一份 = 左栏标签与市场页能互相矛盾）',
    run(ctx, report) {

      const capabilitySource = read(pkg('src/shared/hooks/use-capabilities.ts'));
      const capabilityState = capabilitySource.match(/useState\(/g) ?? [];
      const capabilityShared = capabilitySource.includes('useSyncExternalStore(');
      report(
        '★ 能力结论只有一份（读者各自 useState 存一份 = 左栏标签与市场页能互相矛盾）',
        capabilityState.length === 0 && capabilityShared,
        `use-capabilities.ts：useState ${capabilityState.length} 处 · useSyncExternalStore ${capabilityShared ? '用着' : '没在'}（结论只该有一份，读者只读它）`,
      );
    },
  },
  {
    title: '★ 左栏那枚徽标认模块包的新版、也认市场里的异常（入口漏带模块版本 = 模块有新版时标签永远不亮）',
    run(ctx, report) {

      const source = marketPanel();
      const entryHintCalls = source.match(/marketHintOf\(/g) ?? [];
      const entryHintReadsVersions = source.includes('useModuleVersions(');
      report(
        '★ 左栏那枚徽标认模块包的新版、也认市场里的异常（入口漏带模块版本 = 模块有新版时标签永远不亮）',
        entryHintCalls.length === 1 && entryHintReadsVersions,
        `market/panel.tsx：marketHintOf ${entryHintCalls.length} 处 · useModuleVersions ${entryHintReadsVersions ? '用着' : '没在'}（入口的徽标只该走那一处判据，版本读数取自共享 store）`,
      );
    },
  },
  {
    title: '★ 模块版本结论只有一份（读者各自 useState 存一份 = 左栏标签与市场页能互相矛盾）',
    run(ctx, report) {
      const moduleVersionsSource = read(pkg('src/app/layouts/market/use-module-versions.ts'));
      const moduleVersionsState = moduleVersionsSource.match(/useState\(/g) ?? [];
      const moduleVersionsShared = moduleVersionsSource.includes('useSyncExternalStore(');
      report(
        '★ 模块版本结论只有一份（读者各自 useState 存一份 = 左栏标签与市场页能互相矛盾）',
        moduleVersionsState.length === 0 && moduleVersionsShared,
        `use-module-versions.ts：useState ${moduleVersionsState.length} 处 · useSyncExternalStore ${moduleVersionsShared ? '用着' : '没在'}（结论只该有一份，读者只读它）`,
      );
    },
  },
  {
    title: '★ 面板名单只在换工作区时清空（事实推送重读清空 = 整块板的卡都重打平台）',
    run(ctx, report) {

      const panelsSource = read(pkg('src/app/layouts/rightbar/use-panels.ts'));
      const panelClears = panelsSource.match(/setEnabled\(null\)/g) ?? [];
      const clearAt = panelsSource.indexOf('setEnabled(null)');
      const guardedClear = clearAt >= 0 && panelsSource.slice(Math.max(0, clearAt - 200), clearAt).includes('shouldDropPanels(');
      report(
        '★ 面板名单只在换工作区时清空（事实推送重读清空 = 整块板的卡都重打平台）',
        panelClears.length === 1 && guardedClear,
        panelClears.length === 0
          ? 'use-panels.ts 里没有 setEnabled(null)（重读的语义变了？）'
          : `${panelClears.length} 处 setEnabled(null)，${guardedClear ? '在 shouldDropPanels 判断里' : '不在 shouldDropPanels 判断里'}（应当只有 1 处且在判断里）`,
      );
    },
  },
  {
    title: '★ 值交接只有 agent 工具能交（路由 / 服务 / hook 里 .hand( = 面板自己的读在续命那份值）',
    run(ctx, report) {

      const handSites = [];
      for (const { name, source } of ctx.sources) {
        for (const line of source.split('\n')) {
          if (line.includes('.hand(')) handSites.push({ file: name, line: line.trim() });
        }
      }
      const strayHands = handSites.filter(
        (site) => !/^modules\/[^/]+\/model\/tools/.test(site.file) && !/\.test\.tsx?$/.test(site.file),
      );
      report(
        '★ 值交接只有 agent 工具能交（路由 / 服务 / hook 里 .hand( = 面板自己的读在续命那份值）',
        handSites.length > 0 && strayHands.length === 0,
        strayHands.length > 0
          ? strayHands.map((site) => `${site.file}: ${site.line}`).join(' · ')
          : `${handSites.length} 处 hand 都在工具落点`,
      );
    },
  },
  {
    title: '★ 忙态有下限时长（卡片刷新与添加弹窗的判定态都过 useVisibleBusy；取数层不许过 —— 轮询的格子会常亮）',
    run(ctx, report) {

      const busySites = [];
      for (const { name, source } of ctx.sources) {
        if (source.includes('useVisibleBusy(')) busySites.push(name);
      }
      const floorSites = [
        'shared/hooks/use-visible-busy.ts',
        'shared/hooks/use-unit-board.ts',
        'app/layouts/market/use-add-module.ts',
        'app/layouts/rightbar/ModulesPage.tsx',
        'app/layouts/rightbar/MarketView.tsx',
        'app/layouts/workbench-settings/ConfigSyncItem.tsx',
        'app/layouts/workbench-settings/NewWorkbenchItem.tsx',
        'app/layouts/workbench-settings/SidebarEditionItem.tsx',
      ];
      const missingBusy = floorSites.filter((file) => !busySites.includes(file));
      const strayBusy = busySites.filter(
        (file) => !floorSites.includes(file) && !file.endsWith('.test.ts'),
      );
      report(
        '★ 忙态有下限时长（卡片刷新与添加弹窗的判定态都过 useVisibleBusy；取数层不许过 —— 轮询的格子会常亮）',
        missingBusy.length === 0 && strayBusy.length === 0,
        missingBusy.length > 0
          ? `这几处没下限：${missingBusy.join(' · ')}`
          : strayBusy.length > 0
            ? `这几处不该有：${strayBusy.join(' · ')}`
            : `${busySites.length} 处都在名单里`,
      );
    },
  },
  {
    title: '★ 每个阻断态都把 busy 交给那颗「重试」（漏一处 = 那个套件点了没反应）',
    run(ctx, report) {

      const silentRetries = [];
      for (const { name, source } of ctx.sources) {
        if (!name.endsWith('.tsx') || name.endsWith('.test.tsx')) continue;
        let cursor = source.indexOf('<BlockerState');
        while (cursor !== -1) {
          const close = source.indexOf('/>', cursor);
          const element = source.slice(cursor, close === -1 ? undefined : close);
          if (!element.includes('busy=')) {
            silentRetries.push(`${name}:${source.slice(0, cursor).split('\n').length}`);
          }
          cursor = source.indexOf('<BlockerState', cursor + 1);
        }
      }
      report(
        '★ 每个阻断态都把 busy 交给那颗「重试」（漏一处 = 那个套件点了没反应）',
        silentRetries.length === 0,
        silentRetries.length > 0 ? `这几处没接：${silentRetries.join(' · ')}` : '全部接上',
      );
    },
  },
  {
    title: '★ 每个套件都交"读工具惊动哪些事实"（factsOf；漏了的套件读工具永远不惊动面板）',
    run(ctx, report) {

      const factUnits = [...ctx.boardUnits, 'panels'];
      const withoutFacts = factUnits.filter((id) => {
        const source = read(pkg(`src/modules/${id}/index.ts`));
        return !source.includes('factsOf');
      });
      report(
        '★ 每个套件都交"读工具惊动哪些事实"（factsOf；漏了的套件读工具永远不惊动面板）',
        withoutFacts.length === 0,
        withoutFacts.length === 0 ? `${factUnits.join(' · ')} 都交了` : `没交：${withoutFacts.join(' · ')}`,
      );
    },
  },
];
