import { makeFakeDom, PKG_URL } from '../lib.mjs';

const SEED_WORDS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]);

export const checks = [
  {
    title: 'client.js 经 __ModuleLoader__.load() 注册，模块 id = 包名',
    async run(ctx, report) {
      let boot = null;
      globalThis.window = {
        __ModuleLoader__: {
          load: (entry) => {
            boot = entry;
          },
        },
        localStorage: {
          store: new Map(),
          getItem(key) {
            return this.store.has(key) ? this.store.get(key) : null;
          },
          setItem(key, value) {
            this.store.set(key, String(value));
          },
          removeItem(key) {
            this.store.delete(key);
          },
        },
      };

      ctx.injectedStyles = [];

      ctx.officialSeatOnScreen = false;
      ctx.fakeDom = makeFakeDom(ctx.injectedStyles, () => ctx.officialSeatOnScreen);
      globalThis.document = ctx.fakeDom;
      await import(new URL('client.js', PKG_URL).href);

      report(
        'client.js 经 __ModuleLoader__.load() 注册，模块 id = 包名',
        boot !== null && boot?.id === '@dsh-workbench/core',
        boot?.id,
      );
      ctx.boot = boot;
    },
  },
  {
    title: 'factory 注入 slots / locale / layout / uiWorkspace / workspaces / shortcuts',
    run(ctx, report) {
      ctx.registrations = [];
      ctx.provided = new Map();
      ctx.localeNs = null;
      ctx.localeDicts = [];
      ctx.rightbarCloses = 0;
      const mountedWatch = new Set();

      ctx.officialOpens = [];
      ctx.officialRightbar = {
        expanded: false,
        toggles: 0,
        seatMounted: false,
        require() {
          if (!this.seatMounted) throw new Error('sidebarRight: no session surface is mounted');
        },
        isExpanded() {
          return this.seatMounted && this.expanded;
        },
        toggleExpanded() {
          this.require();
          this.toggles += 1;
          this.expanded = !this.expanded;
        },
        active() {
          return this.seatMounted ? { id: 'guide' } : undefined;
        },
        openResource(address) {
          this.require();
          ctx.officialOpens.push(['resource', address]);
        },
        openTab(kind) {
          this.require();
          ctx.officialOpens.push(['tab', kind]);
        },
        mounted: {
          value: 'session-1',
          getSnapshot() {
            return this.value;
          },
          subscribe(listener) {
            mountedWatch.add(listener);
            return () => mountedWatch.delete(listener);
          },
        },
      };

      ctx.mountOfficialSeat = () => {
        ctx.officialRightbar.seatMounted = true;
        ctx.officialSeatOnScreen = true;
      };
      ctx.clientCtx = {
        provide: (name, value) => {
          ctx.provided.set(name, value);
          return () => ctx.provided.delete(name);
        },
        effect: (fn) => {
          fn();
        },
        locale: {
          register: (ns, dict) => {
            ctx.localeNs = ns;
            ctx.localeDicts.push(dict ?? {});
            return () => {};
          },

          bind: (ns) => (key) =>
            ns === 'common' && key === 'workspace.defaultName' ? '默认工作区' : key,
        },
        slots: {
          inject: (_slot, callback) => {
            const dispose = callback();
            return () => {
              if (typeof dispose === 'function') dispose();
            };
          },
          entriesOfSlot: (name) =>
            ctx.registrations
              .filter((entry) => entry.options.name === name)
              .map((entry) => ({ options: entry.options })),
          register: (options, component) => {
            const entry = { options, component };
            ctx.registrations.push(entry);
            return () => {
              const at = ctx.registrations.indexOf(entry);
              if (at >= 0) ctx.registrations.splice(at, 1);
            };
          },
        },

        shortcuts: { catalog: {} },

        layout: {
          selectPanel() {},
          toggleSidebar() {},

          openRightbar() {},
          closeRightbar() {
            ctx.rightbarCloses += 1;
          },
        },

        get: (name) => (name === 'sidebarRight' ? ctx.officialRightbar : undefined),

        remote: {
          sessions: { create: async () => ({ sessionId: 'session-diy-stub' }) },
        },

        workspaces: {

          list: {
            getSnapshot: () => ({ items: [], archivedSessionIds: [], pinnedSessionIds: [] }),
            subscribe: () => () => {},
          },
          create: async () => undefined,
          rename: async (workspaceId, title) => {
            if (workspaceId !== 'w-ok' || title === '') throw new Error('rename refused');
            return { workspaceId, title };
          },
        },
      };

      ctx.askedModules = [];
      ctx.factoryResult = ctx.boot.factory((name) => {
        ctx.askedModules.push(name);
        if (name === 'react') {
          return {
            createElement: (...args) => ({ args }),
            Fragment: Symbol('Fragment'),

            Component: class {
              constructor(props) {
                this.props = props;
                this.state = void 0;
              }
            },
            useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
            useEffect: () => {},
            useMemo: (fn) => fn(),
            useCallback: (fn) => fn,
            useRef: (initial) => ({ current: initial }),

            createContext: (initial) => ({ _value: initial, Provider: Symbol('Provider') }),
            useContext: (context) => (context && '_value' in context ? context._value : undefined),
          };
        }

        if (name === 'react-dom') return { createPortal: (node) => node };

        if (name === '@deepseek-ai/dsh-client-ui-primitives') {
          return {
            Button: (props) => ({ args: ['button', props] }),
            IconPlusOutlineRegular: (props) => ({ args: ['plus', props] }),
            IconRefreshOutlineRegular: (props) => ({ args: ['refresh', props] }),
            CodeBlock: (props) => ({ args: ['code', props] }),
            DiffBlock: (props) => ({ args: ['diff', props] }),
            Tag: (props) => ({ args: ['tag', props] }),
          };
        }
        return undefined;
      });

      report(
        'factory 注入 slots / locale / layout / uiWorkspace / workspaces / shortcuts',
        ['slots', 'locale', 'layout', 'uiWorkspace', 'workspaces', 'shortcuts'].every((name) =>
          ctx.factoryResult.inject.includes(name),
        ),
        ctx.factoryResult.inject.join(','),
      );
    },
  },
  {
    title: '★ 浏览器半侧直接用 dsh 的 UI 原语（经模块表 require，包里没有第二份实现）',
    run(ctx, report) {
      const asked = [...new Set(ctx.askedModules)];
      ctx.asked = asked;
      report(
        '★ 浏览器半侧直接用 dsh 的 UI 原语（经模块表 require，包里没有第二份实现）',
        asked.includes('@deepseek-ai/dsh-client-ui-primitives'),
        `产物向模块表要了：${asked.join('、') || '（什么都要）'}`,
      );
    },
  },
  {
    title: '★ 只向 dsh 的种子词表要东西（表外的名字在真加载器里会抛）',
    run(ctx, report) {
      report(
        '★ 只向 dsh 的种子词表要东西（表外的名字在真加载器里会抛）',
        ctx.asked.every((name) => SEED_WORDS.has(name)),
        `表外的：${ctx.asked.filter((name) => !SEED_WORDS.has(name)).join('、') || '（没有）'}`,
      );
    },
  },
  {
    title: '客户端 apply 交出 workbenchUnits（注册 + 活名单两个动作；活名单里零业务模块 —— 装哪个来哪个）',
    run(ctx, report) {

      const HOST_UNITS = [
        {
          id: 'late-module',
          card: { titleKey: 'late.title', order: 999 },
          tools: [],
          host: { inject: [] },
        },
      ];
      ctx.HOST_UNITS = HOST_UNITS;
      const realFetch = globalThis.fetch;
      ctx.realFetch = realFetch;
      globalThis.fetch = async (url) => {
        if (String(url).includes('/unit-manifests')) {
          return { ok: true, status: 200, json: async () => ({ ok: true, manifests: HOST_UNITS }) };
        }
        return { ok: false, status: 404, json: async () => ({ ok: false, error: { code: 'not-found', message: '自检没桩这条路由' } }) };
      };

      ctx.factoryResult.apply(ctx.clientCtx);

      const unitsApi = ctx.provided.get('workbenchUnits');
      ctx.unitsApi = unitsApi;
      report(
        '客户端 apply 交出 workbenchUnits（注册 + 活名单两个动作；活名单里零业务模块 —— 装哪个来哪个）',
        unitsApi !== undefined &&
          typeof unitsApi?.registerUnit === 'function' &&
          typeof unitsApi?.manifests === 'function' &&
          unitsApi.manifests().map((m) => m.id).join(',') === '',
        unitsApi?.manifests().map((m) => m.id).join(',') || '（空）',
      );
    },
  },
  {
    title: '★ 宿主没担保的 unit 不静默：不进活名单、也不上板，且点名说出来（ADR-0038 §2.2）',
    run(ctx, report) {
      const { unitsApi } = ctx;
      if (unitsApi !== undefined) {
        const warned = [];
        const realWarn = console.warn;
        console.warn = (...args) => warned.push(args.join(' '));
        const disposeGhost = unitsApi.registerUnit({ unit: 'ghost-module', card: () => null });
        console.warn = realWarn;
        report(
          '★ 宿主没担保的 unit 不静默：不进活名单、也不上板，且点名说出来（ADR-0038 §2.2）',
          unitsApi.manifests().every((m) => m.id !== 'ghost-module') &&
            warned.some((line) => line.includes('ghost-module')),
          warned.join(' | '),
        );
        disposeGhost();
      }
    },
  },
  {
    title: '客户端导出 kit（模块作者唯一的入口）：四个面都在，hooks / components / api 各交出模块要用的成员',
    run(ctx, report) {

      const kit = ctx.factoryResult.kit;
      ctx.kit = kit;
      report(
        '客户端导出 kit（模块作者唯一的入口）：四个面都在，hooks / components / api 各交出模块要用的成员',
        kit !== undefined &&
          ['hooks', 'components', 'api', 'lib'].every((face) => typeof kit[face] === 'object') &&
          ['useApiResource', 'useCardSummary', 'useUnitBoard', 'useVisibleBusy'].every(
            (name) => typeof kit.hooks[name] === 'function',
          ) &&
          [
            'ActivityAction', 'ActivityBlock', 'ActivityLine', 'ApprovalPlan', 'BlockerState', 'Card',
            'CardHead', 'ConfirmBar', 'Note', 'Row', 'Rows', 'SettingsSection', 'Stack', 'StateBlock', 'CenteredState',
            'EmptyState', 'SkeletonRows', 'TextField', 'Tip', 'IconBrandMark',
          ].every((name) => kit.components[name] !== undefined) &&

          ['apiGet', 'apiPost', 'addContextChip', 'installContextChips', 'serializeChipRef'].every(
            (name) => kit.api[name] !== undefined,
          ),
        Object.keys(kit ?? {}).join(','),
      );
    },
  },
  {
    title: '注册了 locale 字典',
    run(ctx, report) {
      report('注册了 locale 字典', ctx.localeNs === 'workbench', String(ctx.localeNs));
    },
  },
  {
    title: '启动 gate 在 apply 里第一时间立起来（不等 React），并把 #root 标成 inert（背景不可点）',
    run(ctx, report) {
      const { fakeDom } = ctx;
      report(
        '启动 gate 在 apply 里第一时间立起来（不等 React），并把 #root 标成 inert（背景不可点）',
        fakeDom.created.some((el) => /(^|\s)_gate_[a-z0-9]+_\d+(\s|$)/.test(String(el.className))) &&
          fakeDom.getElementById('root').inert === true,
      );
    },
  },
];
