const PLUGIN_ID = '@dsh-workbench/module-hello';
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    console.log(`✅ ${name}`);
    return;
  }
  failures.push(name);
  console.log(`❌ ${name}${detail === undefined ? '' : ` —— ${detail}`}`);
}

function moduleRequire(name) {
  if (name === 'react') return { createElement: () => null };
  if (name === '@dsh-workbench/core/client') return { kit: { components: { IconBrandMark: () => null } } };
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
check('注册的是 hello 单元', faces[0]?.unit === 'hello', faces[0]?.unit);
check('卡片是个能画的组件', typeof faces[0]?.card === 'function');
check(
  '面只交 unit（标题与顺序住在 package.json 的 dsh.workbench 里，由外壳按 unit 交给浏览器）',
  faces[0]?.manifest === undefined,
  JSON.stringify(faces[0]?.manifest),
);

const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
const brokenFaces = [];
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
check('负例：外壳没交服务时什么都不注册', brokenFaces.length === 0);

console.log(`\n${failures.length === 0 ? '模块自检通过' : `${failures.length} 条没过`}`);
if (failures.length > 0) process.exit(1);
