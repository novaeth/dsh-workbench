// 模块包的接线自检：把 client.js 当成浏览器里的加载器那样跑一遍，再把宿主产物当 ESM 跑一遍。
//
// 为什么值得有：宿主侧挂没挂上，curl /panels 就能看见；浏览器侧挂没挂上，过去只能靠"刷个页面看看"。
// 这个脚本复刻 dsh 加载器的**契约**（`window.__ModuleLoader__.load({ id, factory })` + `factory(require)`），
// 于是"模块注册的卡片到底进没进外壳"变成一条机器判据，而不再是人的眼睛。
//
// ★ 这份脚本只验**形状**：它认不出成员名、也不认识你的数据源，所以换数据源、换卡片内容都不用改它。
//   你自己的那条读该不该跑通，属于你自己 vitest 与 `pnpm selfcheck` 的事。
//
// 负例在最后一段：服务不在的时候必须**报出来**，不许静默通过 —— 静默的模块是最难查的那种坏。

const PLUGIN_ID = '__NAME__';
const UNIT_ID = '__UNIT__';
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    console.log(`✅ ${name}`);
    return;
  }
  failures.push(name);
  console.log(`❌ ${name}${detail === undefined ? '' : ` —— ${detail}`}`);
}

/**
 * 什么属性都拿得到、什么调用都返回自己的替身 —— 这样"模块用了 kit 的哪个成员"就不再是
 * 这份脚本要知道的事（`check:cards` 用的是同一招）。真红只留给模块自己的代码。
 */
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

/** 外壳 kit 的替身：**三个桶都必须在** —— 卡片是在模块顶层解构 kit 的，少一个桶是 import 那一刻就抛。 */
function fakeKit() {
  return {
    hooks: new Proxy({}, { get: () => () => anyStub('hook') }),
    components: new Proxy({}, { get: () => () => null }),
    api: new Proxy({}, { get: () => () => anyStub('api') }),
    lib: anyStub('lib'),
  };
}

function moduleRequire(name) {
  if (name === 'react') {
    // 必须是**真的元素对象**：返回 null 的话，"卡片画得出来"这类断言会永远假红。
    return { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  }
  if (name === '@dsh-workbench/core/client') return { kit: fakeKit() };
  throw new Error(`模块包不该 require ${JSON.stringify(name)}：模块表里只有外壳的 seed 词与外部声明`);
}

let boot = null;
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      boot = entry;
    },
  },
};

await import(new URL('../client.js', import.meta.url).href);

check('client.js 调用 __ModuleLoader__.load()', boot !== null);
check('模块 id 等于包名', boot?.id === PLUGIN_ID, boot?.id);
if (boot === null) {
  console.error(`\n${failures.length} 条没过`);
  process.exit(1);
}

const pluginExports = boot.factory(moduleRequire);
check(
  '注入 workbenchUnits（外壳交出来的那个服务名）',
  Array.isArray(pluginExports.inject) && pluginExports.inject.includes('workbenchUnits'),
  String(pluginExports.inject),
);
check('导出了 apply', typeof pluginExports.apply === 'function');

const faces = [];
const ctx = {
  get: (name) =>
    name === 'workbenchUnits'
      ? {
          registerUnit(face) {
            faces.push(face);
            return () => {};
          },
        }
      : undefined,
  effect: (fn) => {
    fn();
  },
};

pluginExports.apply(ctx);
check('卡片真的注册进了外壳', faces.length === 1, `注册了 ${faces.length} 个`);
check(`注册的是 ${UNIT_ID} 单元`, faces[0]?.unit === UNIT_ID, faces[0]?.unit);
check('卡片是个能画的组件', typeof faces[0]?.card === 'function');
check(
  '面只交 unit（标题与顺序住在 package.json 的 dsh.workbench 里，由外壳按 unit 交给浏览器）',
  faces[0]?.manifest === undefined,
  JSON.stringify(faces[0]?.manifest),
);
check(
  '卡片在空数据下也画得出来（不许抛）',
  (() => {
    try {
      return (
        faces[0].card({ world: { current: {} }, refreshToken: 0, onRefresh: () => {}, t: (key) => key }) != null
      );
    } catch {
      return false;
    }
  })(),
);

const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
pluginExports.apply({
  get: () => undefined,
  effect: (fn) => {
    fn();
  },
});
console.warn = realWarn;

check(
  '负例：外壳没交服务时必须报出来（不许静默通过）',
  warnings.some((line) => line.includes('workbenchUnits')),
  warnings.join(' | '),
);

// ── 宿主产物：面注册得对不对 ──────────────────────────────────────────────
const hostExports = await import(new URL('../dist/host.js', import.meta.url).href);
check('宿主产物导出了 apply', typeof hostExports.apply === 'function');
check(
  '宿主产物也注入 workbenchUnits',
  Array.isArray(hostExports.inject) && hostExports.inject.includes('workbenchUnits'),
);

const hostFaces = [];
hostExports.apply({
  get: (name) =>
    name === 'workbenchUnits'
      ? {
          register(face) {
            hostFaces.push(face);
            return () => {};
          },
        }
      : undefined,
  effect: (fn) => {
    fn();
  },
  logger: { warn: () => {} },
});

check('宿主面注册进了外壳', hostFaces.length === 1, `注册了 ${hostFaces.length} 个`);
// 给一份最小 deps：宿主面的 `mount(deps)` 通常要 `deps.ctx.get('shell')` 之类，
// 不给 deps 的话**任何真的用了 `mount(deps)` 的模块**都会在这里崩 —— 而那不是模块的错。
let mounted = {};
try {
  mounted = hostFaces[0]?.mount({ ctx: { get: () => undefined }, logger: { warn: () => {} } }) ?? {};
} catch (error) {
  failures.push(`宿主面的 mount(deps) 抛了：${error.message}`);
}

const routes = mounted.routes ?? {};
const strays = Object.keys(routes).filter((key) => key !== UNIT_ID && !key.startsWith(`${UNIT_ID}/`));
check(`每条路由都住在自己那一格（${UNIT_ID} 或 ${UNIT_ID}/…）`, strays.length === 0, strays.join(', '));
check(
  'registerTools() 交得出一份清单（这份模块没有工具时是空数组）',
  Array.isArray(mounted.registerTools?.()),
);

console.log(`\n${failures.length === 0 ? '模块自检通过' : `${failures.length} 条没过`}`);
if (failures.length > 0) process.exit(1);
