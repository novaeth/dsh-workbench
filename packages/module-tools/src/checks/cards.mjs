import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { discoverModulePackages } from '../discover.mjs';
import { shellClientPathOf, shellKitOf } from './shell-artifact.mjs';

export const title = '卡片渲染';

const LANGUAGES = ['zh', 'en'];

const FORBIDDEN = [
  { token: 'undefined', pattern: /\bundefined\b/ },
  { token: 'NaN', pattern: /\bNaN\b/ },
  { token: '[object Object]', pattern: /\[object Object\]/ },
  { token: 'null', pattern: /\bnull\b/ },
];

const WORKSPACE = { path: '/tmp/repo', workspaceId: 'wb-card-probe' };

const STALE_AT = 1_700_000_000_000;

function anyStub(path = 'stub') {
  const target = function () {
    return anyStub(`${path}()`);
  };
  return new Proxy(target, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === 'then') return undefined;
      if (key === 'length') return 0;
      if (key === 'toString') return () => path;
      return anyStub(`${path}.${String(key)}`);
    },
    apply() {
      return anyStub(`${path}()`);
    },
  });
}

function containerStub(path, size) {
  const elementAt = (index) => containerStub(`${path}[${index}]`, size);
  const asArray = () => Array.from({ length: size }, (_unused, index) => elementAt(index));
  const scalar = size > 0 ? 1 : 0;
  const methods = {
    map: (fn) => asArray().map(fn),
    filter: (fn) => asArray().filter(fn),
    forEach: (fn) => asArray().forEach(fn),
    find: (fn) => asArray().find(fn),
    findIndex: (fn) => asArray().findIndex(fn),
    some: (fn) => asArray().some(fn),
    every: (fn) => asArray().every(fn),
    reduce: (fn, initial) => asArray().reduce(fn, initial),
    flatMap: (fn) => asArray().flatMap(fn),
    slice: (from, to) => asArray().slice(from, to),
    at: (index) => asArray().at(index),
    indexOf: (value) => asArray().indexOf(value),
    includes: (value) => asArray().includes(value),
    join: (separator) => asArray().join(separator),
    concat: (other) => asArray().concat(other),
    reverse: () => asArray().reverse(),
    sort: () => asArray(),
    keys: () => asArray().keys(),
    values: () => asArray().values(),
    entries: () => asArray().entries(),
    toArray: () => asArray(),
  };
  return new Proxy(function () {}, {
    get(_target, key) {
      if (key === 'ok') return true;
      if (key === Symbol.toPrimitive) return () => scalar;
      if (key === Symbol.iterator) return () => asArray()[Symbol.iterator]();
      if (key === 'then') return undefined;
      if (key === 'length') return size;
      if (key === 'toString' || key === 'valueOf') return () => scalar;
      if (key === 'constructor') return Object;
      if (key in methods) return methods[key];
      if (typeof key === 'symbol') return undefined;
      return containerStub(`${path}.${String(key)}`, size);
    },
    apply() {
      return containerStub(`${path}()`, size);
    },
  });
}

const SNAPSHOTS = [
  { name: 'idle', resource: { phase: 'idle' }, workspace: null },
  { name: 'loading', resource: { phase: 'loading' }, workspace: WORKSPACE },
  { name: 'ready', resource: { phase: 'ready', value: containerStub('api', 2) }, workspace: WORKSPACE },
  {
    name: 'empty（有值但容器空）',
    resource: { phase: 'ready', value: containerStub('api', 0) },
    workspace: WORKSPACE,
  },
  {
    name: 'unreadable',
    resource: { phase: 'error', error: { code: 'network', message: '宿主没有响应' } },
    workspace: WORKSPACE,
  },

  {
    name: 'loading（刷新：保留旧值）',
    resource: { phase: 'loading', value: containerStub('api', 2), at: STALE_AT },
    workspace: WORKSPACE,
  },

  {
    name: 'unreadable（能力闸：缺插件）',
    resource: { phase: 'ready', value: containerStub('api', 2) },
    workspace: WORKSPACE,
    capability: (unit) => ({
      unit,
      status: 'missing',
      needs: [
        {
          id: 'extension:demo-plugin',
          kind: 'extension',
          name: 'demo-plugin',
          status: 'missing',
          detail: '逐态探针：缺 demo-plugin',
        },
      ],
      detail: '逐态探针：缺 demo-plugin',
    }),
  },

  {
    name: 'unreadable（能力闸：缺命令）',
    resource: { phase: 'ready', value: containerStub('api', 2) },
    workspace: WORKSPACE,
    capability: (unit) => ({
      unit,
      status: 'outdated',
      needs: [
        {
          id: 'extension:demo-plugin',
          kind: 'extension',
          name: 'demo-plugin',
          status: 'outdated',
          missing: ['demo.command'],
          detail: '逐态探针：demo-plugin 装在，缺 demo.command',
          command: "'opencli' plugin update 'demo-plugin'",
        },
      ],
      detail: '逐态探针：demo-plugin 装在，缺 demo.command',
    }),
  },
];

function fakeReact() {
  const element = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const passthrough = (props, ...children) => element('stub:passthrough', props, ...children);
  const base = {
    createElement: element,
    createElementNS: (_namespace, type, props, ...children) => element(type, props, ...children),
    Fragment: 'Fragment',
    Component: class {},
    PureComponent: class {},
    createContext: (value) => ({ Provider: passthrough, Consumer: passthrough, _currentValue: value }),
    useContext: () => anyStub('context'),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useReducer: (_reducer, initial) => [initial, () => {}],
    useMemo: (factory) => factory(),
    useCallback: (factory) => factory,
    useRef: (initial) => ({ current: initial ?? null }),
    useEffect: () => {},
    useLayoutEffect: () => {},
    useInsertionEffect: () => {},
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useId: () => 'wb-id',
    useTransition: () => [false, (fn) => fn()],
    useDeferredValue: (value) => value,
    isValidElement: (value) => typeof value === 'object' && value !== null && 'type' in value,
    cloneElement: (node, props, ...children) =>
      element(node.type, { ...(node.props ?? {}), ...(props ?? {}) }, ...children),
    memo: (fn) => fn,
    forwardRef: (fn) => fn,
    Children: {
      toArray: (value) =>
        Array.isArray(value) ? value : value === undefined || value === null ? [] : [value],
      map: (value, fn) =>
        (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).map(fn),
      count: (value) =>
        Array.isArray(value) ? value.length : value === undefined || value === null ? 0 : 1,
    },
  };
  return new Proxy(base, { get: (target, key) => (key in target ? target[key] : () => null) });
}

function fakeJsxRuntime() {
  const react = fakeReact();
  return {
    Fragment: react.Fragment,
    jsx: (type, props) => react.createElement(type, props, ...(props?.children ?? [])),
    jsxs: (type, props) => react.createElement(type, props, ...(props?.children ?? [])),
    jsxDEV: (type, props) => react.createElement(type, props, ...(props?.children ?? [])),
  };
}

function fakeDshPackage() {
  const stub = (props) => ({
    type: 'stub:dsh',
    props: props ?? {},
    children:
      props?.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children],
  });
  return new Proxy({}, { get: () => stub });
}

function fakeKit() {
  const callable = () => anyStub('result');
  return {
    hooks: new Proxy({}, { get: () => callable }),
    components: new Proxy(
      {},
      {
        get: (_target, key) => (props) => {
          const kids = props?.children;
          return {
            type: `stub:${String(key)}`,
            props: props ?? {},
            children: kids === undefined ? [] : Array.isArray(kids) ? kids : [kids],
          };
        },
      },
    ),
    api: new Proxy({}, { get: () => callable }),
    lib: anyStub('lib'),
  };
}

function loadFace(clientFile, makeKit) {
  let captured;
  const fakeWindow = {
    location: { search: '', href: 'http://127.0.0.1:3081/' },
    __ModuleLoader__: {
      load: (entry) => {
        captured = entry;
      },
    },
  };
  const expose = { window: fakeWindow, module: undefined, exports: undefined };
  const source = readFileSync(clientFile, 'utf8');
  const factoryOf = new Function('window', `${source}\nreturn undefined;`);
  factoryOf(fakeWindow);
  if (captured === undefined) throw new Error('client.js 没有调用 __ModuleLoader__.load()');
  const module = { exports: {} };
  expose.module = module;
  expose.exports = module.exports;
  const fakeRequire = (id) => {
    if (id === 'react') return fakeReact();
    if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return fakeJsxRuntime();
    if (id === '@dsh-workbench/core/client') return { kit: makeKit() };
    if (id.startsWith('@deepseek-ai/')) return fakeDshPackage();
    throw new Error(`产物 require 了没桩的外部：${id}`);
  };
  const produced = captured.factory(fakeRequire);
  return { id: captured.id, exports: produced ?? module.exports };
}

function render(node, depth, budget) {
  if (node === null || node === undefined || typeof node === 'boolean') return 0;
  if (typeof node === 'string' || typeof node === 'number') {
    budget.texts.push(String(node));
    return 1;
  }
  if (Array.isArray(node)) {
    let count = 0;
    for (const one of node) count += render(one, depth, budget);
    return count;
  }
  if (typeof node !== 'object') {
    budget.texts.push(String(node));
    return 1;
  }
  if (budget.left <= 0) return 0;
  budget.left -= 1;
  budget.maxDepth = Math.max(budget.maxDepth, depth);
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (key === 'key' || key === 'ref') continue;
    if (typeof value === 'string') budget.texts.push(value);
    else if (typeof value === 'number' && Number.isNaN(value)) budget.texts.push('NaN');
  }
  const classes = node.props?.className;
  if (typeof classes === 'string') {
    for (const one of classes.split(/\s+/)) if (one !== '') budget.classNames.add(one);
  }
  if (typeof node.type === 'string' && node.type.startsWith('stub:')) {
    budget.stubs.add(node.type.slice('stub:'.length));
  }
  const children = [...(node.children ?? [])];
  if (typeof node.type === 'function') {
    if (depth > 40) throw new Error('组件递归超过 40 层（自引用？）');
    const out = node.type({ ...(node.props ?? {}), children });
    return 1 + render(out, depth + 1, budget);
  }
  let count = 1;
  for (const child of children) count += render(child, depth, budget);
  return count;
}

async function shellDictionariesOf() {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@dsh-workbench/shared');
  const module = await import(pathToFileURL(join(dirname(entry), 'i18n/index.js')).href);
  return module.dictionaries;
}

function ownOf(dictionaries, language) {
  const one = dictionaries?.[language];
  return typeof one === 'object' && one !== null ? one : {};
}

function translatorOf(language, messages, shellDictionaries, missing, snapshot) {
  const own = ownOf(messages, language);
  const shell = ownOf(shellDictionaries, language);
  return (key, params) => {
    const template = typeof own[key] === 'string' ? own[key] : shell[key];
    if (typeof template !== 'string') {
      missing.push({ language, key, snapshot });
      return `\u0000missing:${key}\u0000`;
    }
    if (params === undefined || params === null) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name) =>
      name in params ? String(params[name]) : whole,
    );
  };
}

function forbiddenHitsOf(texts) {
  const hits = [];
  const seen = new Set();
  for (const text of texts) {
    for (const { token, pattern } of FORBIDDEN) {
      if (!pattern.test(text)) continue;
      const key = `${token}\u0000${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ token, text });
    }
  }
  return hits;
}

function shellClientsOf(modulePackages) {
  const found = new Set();
  for (const pkg of modulePackages) {
    const client = shellClientPathOf(pkg.dir);
    if (client !== undefined && existsSync(client)) found.add(client);
  }
  return [...found];
}

export async function run() {
  const modulePackages = discoverModulePackages({ root: process.cwd() });
  const problems = [];
  const rows = [];
  const footnotes = [];
  let degraded = 0;

  let shellDictionaries;
  try {
    shellDictionaries = await shellDictionariesOf();
  } catch (error) {
    shellDictionaries = undefined;
    footnotes.push(
      `（取不出 @dsh-workbench/shared 的字典：${error instanceof Error ? error.message : String(error)}）` +
        ' —— 逐态那半跳过（单次全桩渲染照旧跑），因为裸键名判定要模块 ∪ 外壳两份字典',
    );
  }

  for (const pkg of modulePackages) {
    const name = pkg.manifest.name;
    const clientFile = join(pkg.dir, 'client.js');
    if (!existsSync(clientFile)) {
      problems.push(`${name}: 没有 client.js —— 先 build`);
      continue;
    }

    const declared = pkg.manifest.dsh?.workbench?.card ?? null;
    const declaresCard = declared !== null && typeof declared === 'object';

    const shellClient = shellClientPathOf(pkg.dir);
    const hasShell = shellClient !== undefined && existsSync(shellClient);
    const current = { snapshot: SNAPSHOTS[0] };
    let realKit;
    let shellProblem;
    if (hasShell && shellDictionaries !== undefined) {
      try {
        realKit = shellKitOf(shellClient, { react: fakeReact(), dshPackage: fakeDshPackage() });
      } catch (error) {
        shellProblem = error instanceof Error ? error.message : String(error);
      }
    }

    const makeKit = () => {
      if (realKit === undefined) return fakeKit();
      const hooks = { ...(realKit.hooks ?? {}) };
      hooks.useApiResource = () => current.snapshot.resource;

      hooks.useCapabilityGate = (unit) => {
        const capability = current.snapshot.capability?.(unit) ?? null;
        return {
          capability,
          gated: capability === null || capability.status === 'ok' || capability.status === 'unchecked',
          forceProbe: () => {},
        };
      };
      return { ...realKit, hooks };
    };

    let face;
    try {
      const loaded = loadFace(clientFile, makeKit);
      face = loaded.exports;
    } catch (error) {
      problems.push(`${name}: 产物加载不起来 —— ${error.message}`);
      continue;
    }

    let registered;
    const ctx = {
      get: (key) =>
        key === 'workbenchUnits'
          ? {
              registerUnit: (value) => {
                registered = value;
                return () => {};
              },
            }
          : undefined,
      effect: (fn) => {
        fn();
        return () => {};
      },
      provide: () => {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const apply = face?.apply ?? face?.default?.apply;
    if (typeof apply !== 'function') {
      problems.push(`${name}: 产物没有导出 apply（外壳挂不上这个模块）`);
      continue;
    }
    try {
      apply(ctx);
    } catch (error) {
      problems.push(`${name}: apply 抛了 —— ${error.message}`);
      continue;
    }

    const card = registered?.card;
    if (!declaresCard) {
      if (typeof card === 'function') {
        problems.push(
          `${name}: 清单写的是 "card": null，产物却登记了一张卡片 —— 两处说法不一致：` +
            '要么把清单补成一张卡（`"card": { "order": … }`），要么把这张卡从产物里去掉',
        );
        continue;
      }
      rows.push(`${name}: 清单写的是 "card": null —— 这个模块没有卡片，产物里也确实没登记（跳过渲染判定）`);
      continue;
    }
    if (typeof card !== 'function') {
      problems.push(`${name}: 清单写了 card，apply 之后却没登记卡片（registerUnit 没拿到 card）`);
      continue;
    }

    const props = {
      world: { current: { sessionId: null, workspace: null } },
      t: (key) => key,
      refreshToken: 0,
      onRefresh: () => {},
      onNavigate: () => {},
      onOpenMarket: () => {},
      onSummary: () => {},
    };

    if (realKit === undefined) {
      const why =
        shellProblem !== undefined
          ? `取不出这份外壳的 kit（${shellClient}）—— ${shellProblem}`
          : shellDictionaries === undefined
            ? '取不出 @dsh-workbench/shared 的字典'
            : '没装外壳（@dsh-workbench/core）';
      let tree;
      try {
        tree = card(props);
      } catch (error) {
        problems.push(`${name}: 空数据下卡片抛了 —— ${error.message}`);
        continue;
      }
      if (tree === null || tree === undefined) {
        problems.push(`${name}: 空数据下卡片返回空（界面上就是一片空白）`);
        continue;
      }
      const budget = { left: 20000, maxDepth: 0, classNames: new Set(), stubs: new Set(), texts: [] };
      let count;
      try {
        count = render(tree, 0, budget);
      } catch (error) {
        const where = (error.stack ?? '').split('\n').slice(1, 4).join(' | ');
        problems.push(`${name}: 卡片体内的组件抛了 —— ${error.message}\n      ${where}`);
        continue;
      }
      if (count <= 1) {
        problems.push(`${name}: 卡片只画出一个节点 —— 卡片体没跑（或什么都没画）`);
        continue;
      }
      if (!(budget.classNames.has('wb-card') || budget.stubs.has('Card'))) {
        problems.push(
          `${name}: 卡片没套外壳的卡壳 —— 用 kit.components.Card（推荐），或自己写契约类 wb-card + ` +
            `wb-cardBody；裸内容在面板里看起来就"不是一张卡片"`,
        );
        continue;
      }
      footnotes.push(`${name}: ${why} —— 逐态渲染跳过，只跑了单次全桩渲染`);
      rows.push(`${name}: 空数据下画得出 ${count} 个节点（最深 ${budget.maxDepth} 层）`);
      degraded += 1;
      continue;
    }

    const missing = [];
    const counts = new Map();
    const textsBySnapshot = new Map();
    const classNames = new Set();
    const stubs = new Set();

    for (const snapshot of SNAPSHOTS) {
      current.snapshot = snapshot;
      counts.set(snapshot.name, []);
      for (const language of LANGUAGES) {
        const budget = { left: 20000, maxDepth: 0, classNames: new Set(), stubs: new Set(), texts: [] };
        const where = `${snapshot.name}（${language}）`;
        props.t = translatorOf(
          language,
          registered?.messages,
          shellDictionaries,
          missing,
          snapshot.name,
        );
        props.world = { current: { sessionId: null, workspace: snapshot.workspace } };

        let tree;
        try {
          tree = card(props);
        } catch (error) {
          problems.push(`${name}: ${where} 卡片抛了 —— ${error.message}`);
          continue;
        }
        if (tree === null || tree === undefined) {
          problems.push(`${name}: ${where} 卡片返回空 —— 这一态下卡片没画出来（界面上就是一片空白）`);
          continue;
        }
        let count;
        try {
          count = render(tree, 0, budget);
        } catch (error) {
          const stack = (error.stack ?? '').split('\n').slice(1, 4).join(' | ');
          problems.push(`${name}: ${where} 卡片体内的组件抛了 —— ${error.message}\n      ${stack}`);
          continue;
        }
        if (count <= 1) {
          problems.push(
            `${name}: ${where} 卡片只画出 ${count} 个节点 —— 这一态下卡片体没跑（或只剩一层空壳）`,
          );
          continue;
        }
        counts.get(snapshot.name).push(count);
        for (const one of budget.classNames) classNames.add(one);
        for (const one of budget.stubs) stubs.add(one);
        const bucket = textsBySnapshot.get(snapshot.name) ?? [];
        bucket.push(...budget.texts);
        textsBySnapshot.set(snapshot.name, bucket);
        for (const hit of forbiddenHitsOf(budget.texts)) {
          problems.push(
            `${name}: ${where} 屏上出现了 ${hit.token} —— 这一态下卡片把它摆到了文字上。` +
              `命中的那串：${hit.text.slice(0, 120)}`,
          );
        }
      }
    }

    if (missing.length > 0) {
      const grouped = new Map();
      for (const one of missing) {
        const key = `${one.language}\u0000${one.key}`;
        if (!grouped.has(key)) grouped.set(key, { key: one.key, language: one.language, snapshots: [] });
        const entry = grouped.get(key);
        if (!entry.snapshots.includes(one.snapshot)) entry.snapshots.push(one.snapshot);
      }
      for (const entry of grouped.values()) {
        problems.push(
          `${name}: t('${entry.key}') 在 ${entry.language} 里没有落点（问它的快照：` +
            `${entry.snapshots.join('、')}）—— 屏上会显示原始键名。` +
            '命中判定 = 模块 messages ∪ 外壳 dictionaries',
        );
      }
    }

    if (!(classNames.has('wb-card') || stubs.has('Card'))) {
      problems.push(
        `${name}: 卡片没套外壳的卡壳 —— 用 kit.components.Card（推荐），或自己写契约类 wb-card + ` +
          `wb-cardBody；裸内容在面板里看起来就"不是一张卡片"`,
      );
      continue;
    }

    const per = SNAPSHOTS.map(
      (snapshot) => `${snapshot.name} ${counts.get(snapshot.name).join('/') || '—'}`,
    ).join(' · ');
    rows.push(`${name}: ${SNAPSHOTS.length} 态 × zh/en 都画得出 —— ${per} 个节点`);

    const shapes = new Set(
      SNAPSHOTS.map((snapshot) => [...new Set(textsBySnapshot.get(snapshot.name) ?? [])].sort().join('\n')),
    );
    if (shapes.size === 1) {
      footnotes.push(
        `${name}: ${SNAPSHOTS.length} 个快照渲染出来的文本完全一样 —— 不判红，只当线索：它的取数可能没走 ` +
          'kit.hooks.useApiResource，或这张卡片本来就不随态分叉',
      );
    }
  }

  const shellClients = shellDictionaries === undefined ? [] : shellClientsOf(modulePackages);

  if (problems.length > 0) {
    return { status: 'fail', notes: [], problems };
  }
  if (modulePackages.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有卡片可渲染'],
      problems: [],
    };
  }
  return {
    status: 'pass',
    notes: [
      `${rows.length} 个模块过了卡片这一关：` +
        (degraded === 0
          ? `${SNAPSHOTS.length} 态 × zh/en 各渲染一遍`
          : `逐态那半这次有 ${degraded} 个模块跳过（没装外壳 / 取不出外壳，见下），其余 ${SNAPSHOTS.length} 态 × zh/en 各渲染一遍`) +
        ' —— 不抛、非空白、文字里没有 ' +
        'undefined / NaN / [object Object] / null、没有裸键名、套了外壳的卡壳；名字来自清单顶层的 title（协议判据管它中英都有）。' +
        `（断言的是"${SNAPSHOTS.length} 种外壳侧输入下都退化得漂亮"，不是"画的是哪一态那一屏" —— 屏的对错归模块自己的 ` +
        'card-states.test.ts 与 design.json 状态矩阵）',
      ...(shellClients.length === 0
        ? []
        : [`逐态用的真壳（模块仓里装的那份 client.js）：${shellClients.join('、')}`]),
      ...rows,
      ...footnotes,
    ],
    problems: [],
  };
}
