import { pkg, read, walk } from '../lib.mjs';

const diyToolsSource = () =>
  ['src/modules/panels/model/diy-tools.ts', 'src/modules/panels/model/diy-context.ts']
    .map((rel) => read(pkg(rel)))
    .join('\n');

export const checks = [
  {
    title: '★ DIY 那一跳不新造安装实现（只走 provision 装 + prefs 打开两条已有写通道）',
    run(_ctx, report) {
      const diyHop = read(pkg('scripts/diy-workshop.mjs'));
      const shellsOut = /child_process|execFileSync|\bspawn\(|pnpm (add|install)/.test(diyHop);
      report(
        '★ DIY 那一跳不新造安装实现（只走 provision 装 + prefs 打开两条已有写通道）',
        diyHop.includes("post('/provision'") && diyHop.includes("post('/prefs/panels'") && !shellsOut,
        shellsOut ? '它自己开始装东西了' : '',
      );
    },
  },
  {
    title: '★ DIY 那一跳是窄门工具：只装本工作区里的模块（不接任意路径），装完顺手在会话的工作区上板',
    run(_ctx, report) {
      const tools = diyToolsSource();
      const unit = read(pkg('src/modules/panels/unit.ts'));
      const index = read(pkg('src/modules/panels/index.ts'));
      const doorKept =
        tools.includes('insideRoot(root, found.dir)') &&
        tools.includes('modulesIn(root') &&
        !/args\.(?:path|spec)\b/.test(tools);
      report(
        '★ DIY 那一跳是窄门工具：只装本工作区里的模块（不接任意路径），装完顺手在会话的工作区上板',
        doorKept &&
          tools.includes('market.installBundle(found.dir)') &&
          tools.includes('showOrReason(panels, found.unit, root)') &&
          unit.includes('DIY_TOOL') &&
          index.includes('registerDiyTools('),
        doorKept ? '' : '它开始接调用方给的路径了 / 窄门守卫或上板那一步没了',
      );
    },
  },
  {
    title: '★ 那一跳是幂等的：装过就不再装（同名重装只会得到"要重启"，而那一支连重载都不做）',
    run(_ctx, report) {
      const tools = diyToolsSource();
      report(
        '★ 那一跳是幂等的：装过就不再装（同名重装只会得到"要重启"，而那一支连重载都不做）',
        tools.includes('if (found.installed)') && tools.includes('alreadyInstalled: true'),
        '少了这一支，agent 每轮都会再装一遍，用户就会看到"要重启"',
      );
    },
  },
  {
    title: '★ 这一族只在 DIY 模式里出现（清单按会话 preset 收窄，不看工作区），调到时还有一道自己的落点闸',
    run(_ctx, report) {

      const tools = diyToolsSource();
      const index = read(pkg('src/modules/panels/index.ts'));
      const visibility =
        index.includes('context.preset === DIY_PRESET_ID') && !index.includes('inWorkshopSession(ctx, workspace)');
      const door = tools.includes('workspaceOf(ctx, exec)') && tools.includes('throw new Error');
      report(
        '★ 这一族只在 DIY 模式里出现（清单按会话 preset 收窄，不看工作区），调到时还有一道自己的落点闸',
        visibility && door,
        !visibility
          ? '清单不是按会话 preset 收窄的（或又退回按工作区收窄）⇒ 没选 DIY 模式的会话也会看到 DIY 那一族'
          : '执行期那道闸没了：没有落点也照发命令',
      );
    },
  },
  {
    title: '★ 窄门工具的审批与事实都接上了（DIY 整族显式 allow；装的那把仍认领事实）',
    run(_ctx, report) {

      const approvalSource = read(pkg('src/modules/panels/model/approval.ts'));
      report(
        '★ 窄门工具的审批与事实都接上了（DIY 整族显式 allow；装的那把仍认领事实）',
        approvalSource.includes('DIY_TOOLS') &&
          approvalSource.includes("kind: 'allow'") &&
          read(pkg('src/modules/panels/model/handoff.ts')).includes('DIY_INSTALL_TOOL'),
        'DIY 族没显式 allow（会被外壳按"写工具没认领"当场拒），或装那把不再认领事实了',
      );
    },
  },
  {
    title: '★ DIY 那一族一起被收走（两份清单里逐个列着，收窄时一个都不能漏）',
    run(_ctx, report) {
      const unit = read(pkg('src/modules/panels/unit.ts'));
      const index = read(pkg('src/modules/panels/index.ts'));
      const constants = [...unit.matchAll(/export const (DIY_[A-Z_]+)_TOOL = '(workbench_diy_[a-z_]+)'/g)];
      const listed = new Set([...unit.matchAll(/^\s+(DIY_[A-Z_]+)_TOOL,$/gm)].map((one) => one[1]));
      const names = new Set(constants.map((one) => one[2]));
      const missing = constants.filter((one) => !listed.has(one[1]));

      const browserSource = read(pkg('src/modules/panels/model/diy-browser-tools.ts'));
      const rows = [...browserSource.matchAll(/tool:\s*(DIY_[A-Z_]+_TOOL)/g)].map((one) => one[1]);
      const familyStart = unit.indexOf('export const DIY_TOOLS = [');
      const familyBlock = unit.slice(familyStart, unit.indexOf('] as const', familyStart));
      const family = new Set([...familyBlock.matchAll(/(DIY_[A-Z_]+)_TOOL/g)].map((one) => `${one[1]}_TOOL`));
      const browserMissing = rows.filter((one) => !family.has(one));
      const REMOVED = [
        'DIY_LOOK_TOOL',
        'DIY_SELECT_TOOL',
        'DIY_RELOAD_TOOL',
        'DIY_VIEWPORT_TOOL',
        'DIY_NET_WATCH_TOOL',
        'DIY_NET_READ_TOOL',
        'DIY_NET_STOP_TOOL',
      ];
      const stale = REMOVED.filter((one) => unit.includes(one));

      const gateList = '[...DIY_TOOLS, ...DIY_DEBUG_TOOLS, ...DIY_RECORD_TOOLS]';
      const wrong =
        missing.length > 0
          ? `没进清单的：${missing.map((one) => one[2]).join('、')}`
          : browserMissing.length > 0
            ? `枚举表里有、DIY_TOOLS 里没有：${browserMissing.join('、')}`
            : stale.length > 0
              ? `被删的七把还在：${stale.join('、')}`
              : !index.includes(gateList)
                ? `收窄名单不是这一份：${gateList}`
                : '';
      report(
        '★ DIY 那一族一起被收走（两份清单里逐个列着，收窄时一个都不能漏；浏览器那 14 把对着枚举表核）',
        names.size >= 32 &&
          rows.length === 14 &&
          new Set(rows).size === 14 &&
          index.includes(gateList) &&
          missing.length === 0 &&
          browserMissing.length === 0 &&
          stale.length === 0,
        wrong === '' ? `DIY 工具 ${String(names.size)} 把（枚举表 ${String(rows.length)} 把）` : wrong,
      );
    },
  },
  {
    title: '★ 没有调试约定 ⇒ 看 / 动 / 网络 / 日志整族当场拒（拒之前一条命令都不发；别人也不许自己开一条路碰屏）',
    run(_ctx, report) {

      const page = read(pkg('src/modules/panels/model/diy-page.ts'));
      const pre = page.slice(
        page.indexOf('const held = store?.live'),
        page.indexOf('const handshake = await readyPageOf'),
      );
      const gate = page.includes('requirePact !== false') && pre.includes('held === null') && pre.includes('debugMissingPactText');
      const door = pkg('src/modules/panels/model/diy-debug-tools.ts');
      const bypass = walk(pkg('src/modules/panels/model'))
        .filter((one) => !one.endsWith('.test.ts'))
        .filter((one) => one !== door && read(one).includes('requirePact: false'));

      const familySource = read(pkg('src/modules/panels/model/diy-browser-tools.ts'));
      const readLineGuarded =
        familySource.includes('BROWSER_READ_SESSION') &&
        !familySource.includes("raw['session']") &&
        !familySource.includes('BROWSER_SCREEN_SESSION');

      const index = read(pkg('src/modules/panels/index.ts'));
      const cleanupWired =
        index.includes('withObserverCleanup(createDebugStore()') &&
        read(pkg('src/modules/panels/model/diy-observers.ts')).includes('stopNetworkExact') &&
        read(pkg('src/modules/panels/model/diy-observers.ts')).includes('settle');
      const wrong =
        bypass.length > 0
          ? `这些文件自己绕过了那道闸：${bypass.map((one) => one.replace(`${pkg('src/modules/panels/model')}/`, '')).join('、')}`
          : !gate
            ? 'pageAt 里要么没有"无约定即拒"，要么它排在握手之后（没点头就已经碰了屏）'
            : !readLineGuarded
              ? '只读线档要么没认 BROWSER_READ_SESSION、要么收了调用方给的会话名、要么提了屏那条会话 —— 那都是绕开这道闸的路'
              : !cleanupWired
                ? '收工没收观察：`panels/index.ts` 里 provide 的必须是包过 `withObserverCleanup` 的那份 store'
                : '';
      report(
        '★ 没有调试约定 ⇒ 看 / 动 / 网络 / 日志整族当场拒（拒之前一条命令都不发；别人也不许自己开一条路碰屏；收工顺手收观察）',
        gate && bypass.length === 0 && readLineGuarded && cleanupWired,
        wrong,
      );
    },
  },
  {
    title: '★ 录制交接只碰自己那一扇窗，且收工收干净（ADR-0064）',
    run(_ctx, report) {

      const unit = read(pkg('src/modules/panels/unit.ts'));
      const block = (name) => {
        const from = unit.indexOf(`export const ${name} = [`);
        return from === -1 ? '' : unit.slice(from, unit.indexOf('] as const', from));
      };
      const record = read(pkg('src/modules/panels/model/diy-record.ts'));
      const approval = read(pkg('src/modules/panels/model/approval.ts'));
      const index = read(pkg('src/modules/panels/index.ts'));
      const writes = block('WRITE_TOOLS');
      const reads = block('READ_TOOLS');
      const wrong = !writes.includes('DIY_RECORD_PREPARE_TOOL')
        ? 'prepare 不在写侧（那就没有审批那一拍，开窗不用点头）'
        : !reads.includes('DIY_RECORD_READ_TOOL') || !reads.includes('DIY_RECORD_STOP_TOOL')
          ? 'read / stop 不在读侧（读一次也要点头了）'
          : !approval.includes('DIY_RECORD_PREPARE_TOOL')
            ? 'approval.ts 里没有 prepare 的问句（写工具没认领 = 当场 deny，这把工具等于没有）'
            : /BROWSER_SCREEN_SESSION|BROWSER_READ_SESSION/.test(record)
              ? '录制那一族碰了别的会话名（它只能碰 workbench-rec）'
              : !record.includes('stopNetworkExact') || !record.includes('releaseRecord')
                ? '收工没收干净：停捕获与收标签都要走 releaseRecord'
                : !index.includes('DIY_RECORD_SERVICE') ||
                    !index.includes('diyRecordRoutes(record)') ||
                    !index.includes('registerRecordTools(ctx, record)')
                  ? '这一族没在 index.ts 里接上（服务 / 路由 / 工具三处）'
                  : '';
      report(
        '★ 录制交接只碰自己那一扇窗，且收工收干净（ADR-0064）',
        wrong === '',
        wrong === '' ? 'prepare 在写侧 · read/stop 在读侧 · 只碰 workbench-rec · 收工停捕获 + 收标签 · 三处接线都在' : wrong,
      );
    },
  },
];
