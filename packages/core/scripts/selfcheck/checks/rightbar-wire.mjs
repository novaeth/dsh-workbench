const rightbarWire = (ctx) => {
  const face = () => ctx.corner?.options.inject?.() ?? {};
  return {
    columnState: () => face().hooks?.rightbar?.getSnapshot?.(),
    selectColumn: face().selectColumn,
    registered: () => ctx.registrations.some((r) => r.options.name === 'rightbar'),
  };
};

export const checks = [
  {
    title: '★ 角落入口交出 selectColumn()（那两颗钮靠它切列）',
    run(ctx, report) {
      const { columnState, selectColumn, registered } = rightbarWire(ctx);
      report(
        '★ 角落入口交出 selectColumn()（那两颗钮靠它切列）',
        typeof selectColumn === 'function' && registered() && columnState()?.column === 'workbench',
        `column=${String(columnState()?.column)} · 注册=${String(registered())}`,
      );
    },
  },
  {
    title: '★ 点文件链接：先让位（注册真的撤下来了），不是把报错丢给用户',
    run(ctx, report) {
      const { registered } = rightbarWire(ctx);

      ctx.closesBefore = ctx.rightbarCloses;
      ctx.officialRightbar.openResource('dsh-resource://file/session/s1/notes.md', {
        params: { line: 7 },
      });
      report(
        '★ 点文件链接：先让位（注册真的撤下来了），不是把报错丢给用户',
        !registered(),
        `注册=${String(registered())}`,
      );
    },
  },
  {
    title: '★ 点文件链接：先把几何报告权交还（closeRightbar）',
    run(ctx, report) {
      const { columnState } = rightbarWire(ctx);
      report(
        '★ 点文件链接：先把几何报告权交还（closeRightbar）',
        ctx.rightbarCloses === ctx.closesBefore + 1 && columnState()?.column === 'dsh',
        `${ctx.closesBefore} → ${ctx.rightbarCloses} · column=${String(columnState()?.column)}`,
      );
    },
  },
  {
    title: '★ 椅面还没挂上时那次打开先候着（不是当场抛/静默丢）',
    run(ctx, report) {
      report(
        '★ 椅面还没挂上时那次打开先候着（不是当场抛/静默丢）',
        ctx.officialOpens.length === 0,
        ctx.officialOpens.map((o) => o.join(':')).join('、') || '（还没打开）',
      );
    },
  },
  {
    title: '★ renameWorkspace 把 dsh 那一次写翻成布尔（resolve→true / reject→false）',
    async run(ctx, report) {

      const renamed = await ctx.injected?.renameWorkspace('w-ok', '工作台外壳');
      const refused = await ctx.injected?.renameWorkspace('w-no', '');
      report(
        '★ renameWorkspace 把 dsh 那一次写翻成布尔（resolve→true / reject→false）',
        renamed === true && refused === false,
        `成功=${String(renamed)} 失败=${String(refused)}`,
      );
    },
  },
  {
    title: '★ 椅面挂上（`mounted` 没动）之后自动展开一次（点了就该看见，不是点了没反应）',
    async run(ctx, report) {
      const seatWasMounted = ctx.officialRightbar.seatMounted;
      ctx.mountOfficialSeat();

      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
      report(
        '★ 椅面挂上（`mounted` 没动）之后自动展开一次（点了就该看见，不是点了没反应）',
        seatWasMounted === false &&
          ctx.officialRightbar.toggles === 1 &&
          ctx.officialRightbar.expanded,
        `toggles=${ctx.officialRightbar.toggles} expanded=${String(ctx.officialRightbar.expanded)}`,
      );
    },
  },
  {
    title: '★ 椅面挂上之后那次打开补上了（地址原样、只补一次）',
    run(ctx, report) {
      report(
        '★ 椅面挂上之后那次打开补上了（地址原样、只补一次）',
        ctx.officialOpens.length === 1 &&
          ctx.officialOpens[0][0] === 'resource' &&
          ctx.officialOpens[0][1] === 'dsh-resource://file/session/s1/notes.md',
        ctx.officialOpens.map((o) => o.join(':')).join('、') || '（没补）',
      );
    },
  },
  {
    title: '★ 椅面已在时直接透传（不再候着）',
    run(ctx, report) {

      ctx.officialRightbar.openTab('browser');
      report(
        '★ 椅面已在时直接透传（不再候着）',
        ctx.officialOpens.length === 2 &&
          ctx.officialOpens[1][0] === 'tab' &&
          ctx.officialOpens[1][1] === 'browser',
        ctx.officialOpens.map((o) => o.join(':')).join('、'),
      );
    },
  },
  {
    title: '★ 切回工作台：那一列重新注册上位',
    run(ctx, report) {

      const { columnState, selectColumn, registered } = rightbarWire(ctx);
      selectColumn?.('workbench');
      report(
        '★ 切回工作台：那一列重新注册上位',
        registered() && columnState()?.expanded === true && columnState()?.column === 'workbench',
        `expanded=${String(columnState()?.expanded)} column=${String(columnState()?.column)}`,
      );
    },
  },
  {
    title:
      '★ 宿主担保过的 unit：清单按 unit 解析，后注册的模块当场进活名单（S0 的可变注册表 + 后加载组件）',
    run(ctx, report) {
      if (ctx.unitsApi === undefined) return;
      const lateFace = {
        unit: 'late-module',
        card: () => null,
        messages: { en: { 'late-module.title': 'late' }, zh: { 'late-module.title': '后加载的' } },
      };
      ctx.disposeLate = ctx.unitsApi.registerUnit(lateFace);
      report(
        '★ 宿主担保过的 unit：清单按 unit 解析，后注册的模块当场进活名单（S0 的可变注册表 + 后加载组件）',
        ctx.unitsApi.manifests().some((m) => m.id === 'late-module'),
      );
    },
  },
  {
    title: '★ 后注册的模块，它的文案也当场并进字典（不是只有组件跟上了）',
    run(ctx, report) {
      if (ctx.unitsApi === undefined) return;
      report(
        '★ 后注册的模块，它的文案也当场并进字典（不是只有组件跟上了）',
        (ctx.localeDicts.at(-1)?.zh ?? {})['late-module.title'] === '后加载的',
        JSON.stringify(Object.keys(ctx.localeDicts.at(-1)?.zh ?? {}).slice(0, 6)),
      );
    },
  },
  {
    title: '★ 注销之后它的文案也从字典里撤掉（不留残留文案）',
    run(ctx, report) {
      if (ctx.unitsApi !== undefined) {
        ctx.disposeLate();
        report(
          '★ 注销之后它的文案也从字典里撤掉（不留残留文案）',
          !ctx.unitsApi.manifests().some((m) => m.id === 'late-module') &&
            (ctx.localeDicts.at(-1)?.zh ?? {})['late-module.title'] === undefined,
        );
      }

      globalThis.fetch = ctx.realFetch;
    },
  },
];
