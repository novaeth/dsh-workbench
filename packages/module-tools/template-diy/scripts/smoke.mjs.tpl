// 模块包的接线自检：把 client.js 当成浏览器里的加载器那样跑一遍，再把宿主产物当 ESM 跑一遍。
//
// 为什么值得有：宿主侧挂没挂上，curl /panels 就能看见；浏览器侧挂没挂上，过去只能靠"刷个页面看看"。
// 这个脚本复刻 dsh 加载器的**契约**（`window.__ModuleLoader__.load({ id, factory })` + `factory(require)`），
// 于是"模块注册的卡片到底进没进外壳"变成一条机器判据，而不再是人的眼睛。
//
// ★ 这份脚本验的是**形状**：它认不出成员名，所以换数据源、换卡片内容都不用改它。
//   模板自己的"真读"与"真跑"在 `scripts/smoke.assert.mjs` 里：换数据源时改那一份，
//   不要删这里的调用 —— 卡片画的数从哪来，`check` 的十三条判据一条都不碰，只有这里会真调一次。
//
// 负例在最后一段：服务不在的时候必须**报出来**，不许静默通过 —— 静默的模块是最难查的那种坏。

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFlowHost, createLongTaskHost } from '@dsh-workbench/shared/host';

const PLUGIN_ID = '__NAME__';
const UNIT_ID = '__UNIT__';
const RUN_TOOL = `${UNIT_ID}_run`;
const ADD_TOOL = `${UNIT_ID}_add_note`;
const RUN_RESOURCE = `${UNIT_ID}-run`;
const moduleDir = dirname(dirname(fileURLToPath(import.meta.url)));
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

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const externals = new Set([
  '@dsh-workbench/core/client',
  ...(manifest.dsh?.client?.inject ?? []),
  ...(manifest.dsh?.client?.external ?? []),
]);

function moduleRequire(name) {
  if (name === 'react') {
    // 必须是**真的元素对象**：返回 null 的话，"卡片画得出来"这类断言会永远假红。
    return {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    };
  }
  if (name === '@dsh-workbench/core/client') return { kit: fakeKit() };
  if (externals.has(name)) return anyStub(`require(${name})`);
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
// 给一份最小 deps：宿主面的 `mount(deps)` 会去 `deps.ctx.get('tools')` / `deps.flow` /
// `deps.longTasks` 拿东西，少一个都可能在这里崩 —— 而那不是模块的错。
// 这几项与外壳真正交出去的 `UnitMountDeps`（HostKit）对齐；模块要用更多成员，就在这里补。
const registeredTools = [];
const moduleFiles = new Map();
function moduleStore(workspace) {
  const at = moduleFiles.get(workspace) ?? new Map();
  moduleFiles.set(workspace, at);
  return {
    read: (name) => at.get(name) ?? null,
    write: (name, value) => {
      at.set(name, value);
    },
    remove: (name) => {
      at.delete(name);
    },
    list: () => [...at.keys()],
  };
}
const flowHost = createFlowHost();
const longTaskHost = createLongTaskHost({ scope: `smoke-${UNIT_ID}`, unit: UNIT_ID, bump: () => {} });
const hostDeps = {
  ctx: {
    get: (name) =>
      name === 'tools'
        ? {
            register(tool) {
              registeredTools.push(tool);
              return () => {};
            },
          }
        : undefined,
    effect: (fn) => {
      fn();
    },
    provide: () => {},
    logger: { warn: () => {} },
  },
  logger: { warn: () => {} },
  manifest: { id: UNIT_ID },
  manifests: () => [],
  ownedUnits: () => [],
  data: (() => {
    const missing = async () => ({ ok: false, error: { code: 'invalid-request', message: 'smoke: 没有 DataReader' } });
    return { read: missing, request: missing, requestMany: async () => ({}), submit: missing };
  })(),
  flow: flowHost,
  sessionIdOf: () => null,
  sessionWorkspace: () => null,
  libInstallCommand: () => '',
  surface: anyStub('surface'),
  env: {},
  store: {
    for: (_unit, workspace) => moduleStore(workspace ?? ''),
    machine: () => moduleStore(''),
    scan: () => [],
  },
  longTasks: longTaskHost.host,
  longTaskRuns: () => new Map(),
  git: {
    origin: async () => ({ kind: 'no-origin' }),
    branch: async () => ({ kind: 'no-branch' }),
    head: async () => ({ kind: 'no-head' }),
  },
  libs: {
    load: async () => {
      throw new Error('smoke: libs 未装');
    },
  },
};
let mounted = {};
try {
  mounted = hostFaces[0]?.mount(hostDeps) ?? {};
} catch (error) {
  failures.push(`宿主面的 mount(deps) 抛了：${error.message}`);
}

const routes = mounted.routes ?? {};
const strays = Object.keys(routes).filter((key) => key !== UNIT_ID && !key.startsWith(`${UNIT_ID}/`));
check(`每条路由都住在自己那一格（${UNIT_ID} 或 ${UNIT_ID}/…）`, strays.length === 0, strays.join(', '));
const disposers = mounted.registerTools?.();
check('registerTools() 交得出一份清理函数清单', Array.isArray(disposers) && disposers.length === 2);
check(
  `工具清单里有 ${RUN_TOOL} 与 ${ADD_TOOL}`,
  registeredTools.some((tool) => tool?.name === RUN_TOOL) && registeredTools.some((tool) => tool?.name === ADD_TOOL),
  JSON.stringify(registeredTools.map((tool) => tool?.name)),
);

// ── 模板自己的故事：流程真跑一遍，长任务最后落到 ok ──────────────────────
const startAction = (mounted.actions ?? []).find((one) => one.resource === RUN_RESOURCE);
check('动作通道里有起流程的入口（卡片那颗钮走的就是它）', typeof startAction?.handle === 'function');
const started = startAction?.handle({ path: moduleDir });
check('起一趟流程拿得到 runId', started?.ok === true && typeof started?.runId === 'string', JSON.stringify(started));
let snapshot = started?.runId === undefined ? null : (mounted.longTasks?.snapshot(started.runId) ?? null);
const deadline = Date.now() + 5000;
while (snapshot !== null && snapshot.status === 'running' && Date.now() < deadline) {
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  snapshot = mounted.longTasks?.snapshot(started.runId);
}
check('流程整条跑到 ok', snapshot?.status === 'ok', String(snapshot?.status));
check(
  '流水里有「读目录」',
  (snapshot?.steps ?? []).some((step) => step.includes('读目录')),
  (snapshot?.steps ?? []).join(' | '),
);

// ── 写通道：笔记（动作通道 + 写工具）+ 审批；配置按工作区存 ──────────────
const NOTES_ROUTE = `${UNIT_ID}/notes`;
const PREFS_ROUTE = `${UNIT_ID}/prefs`;
const NOTE_RESOURCE = `${UNIT_ID}-add-note`;
const noteTool = registeredTools.find((tool) => tool?.name === `${UNIT_ID}_add_note`);
const noteDecl = (manifest.dsh?.workbench?.tools ?? []).find((tool) => tool?.name === `${UNIT_ID}_add_note`);
check('写工具注册上了，清单里也声明成 writes: true（壳才会走审批）', noteTool !== undefined && noteDecl?.writes === true);
check(
  '写工具要点头，审批屏说得出会写什么',
  mounted.needsApproval?.({ name: `${UNIT_ID}_add_note`, arguments: { text: 'x' } })?.kind === 'ask' &&
    typeof mounted.approvalDetail?.({ name: `${UNIT_ID}_add_note`, arguments: { text: 'x' } })?.zh === 'string',
);
const noteAction = mounted.actions?.find((one) => one.resource === NOTE_RESOURCE);
const noteAdded = noteAction?.handle({ path: moduleDir, text: 'smoke 记的一条' });
check('动作通道能写一条笔记（点击即确认）', noteAdded?.ok === true, JSON.stringify(noteAdded?.error));
const notesAnswer = await routes[NOTES_ROUTE](new URLSearchParams({ path: moduleDir }));
check(
  '笔记读得回来，且就是刚写的那条',
  notesAnswer?.ok === true && notesAnswer?.notes?.some((one) => one.text === 'smoke 记的一条'),
  JSON.stringify(notesAnswer?.notes),
);
const prefsBefore = await routes[PREFS_ROUTE](new URLSearchParams({ path: moduleDir }));
check('配置默认是 5', prefsBefore?.prefs?.limit === 5, JSON.stringify(prefsBefore?.prefs));
const prefsWrote = mounted.prefs?.handle({ workspace: moduleDir, limit: 10 });
const prefsAfter = await routes[PREFS_ROUTE](new URLSearchParams({ path: moduleDir }));
check(
  '配置按工作区存得住（写 10 后读回 10）',
  prefsWrote?.prefs?.limit === 10 && prefsAfter?.prefs?.limit === 10,
  JSON.stringify(prefsAfter?.prefs),
);
const otherPrefs = await routes[PREFS_ROUTE](new URLSearchParams({ path: `${moduleDir}/src` }));
check('另一个工作区没被带上（还是默认 5）', otherPrefs?.prefs?.limit === 5, JSON.stringify(otherPrefs?.prefs));

// ── 这个模块自己的真读断言：换数据源时改 scripts/smoke.assert.mjs ──────────
const { assertModule } = await import('./smoke.assert.mjs');
await assertModule({ check, routes, mounted, UNIT_ID });

// ── 需求底稿在不在：这份骨架的"设计记录"住 README，别只留在对话里 ──────────
//
// 只查**形状在不在**（那几节有没有被删掉），不查内容填得好不好 —— 内容由指引守，
// 判据硬管内容只会逼出"把占位符原样留着"这种应付。
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
for (const section of ['## 需求底稿', '### 表 1 面板', '### 表 2 agent', '### 表 3 联动', '### 数据源探明记录']) {
  check(`README 里有「${section}」（需求与验收的落点）`, readme.includes(section));
}

console.log(`\n${failures.length === 0 ? '模块自检通过' : `${failures.length} 条没过`}`);
if (failures.length > 0) process.exit(1);
