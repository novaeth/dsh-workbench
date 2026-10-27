import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { DESIGN_FILE, applyToReadme, readDesign, renderDesign } from './design.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES = {
  minimal: '../template',
  diy: '../template-diy',
};
const UNIT_ID = /^[a-z][a-z0-9-]*$/;

const FALLBACK_RANGE = '^0.1.0';

const FALLBACK_DSH_UI = '0.2.1-rc.2';
const DSH_UI = '@deepseek-ai/dsh-client-ui-primitives';

const dshUiVersion = (root) => {
  try {
    const pinned = JSON.parse(
      readFileSync(join(root, 'node_modules/@dsh-workbench/core/package.json'), 'utf8'),
    ).devDependencies?.[DSH_UI];
    if (typeof pinned === 'string' && pinned !== '') {
      return { version: pinned, source: '外壳 manifest 里钉的（对账过的那版）' };
    }
  } catch {

  }
  console.error(
    `读不到外壳 manifest 里钉的 ${DSH_UI}：模板保持 ${FALLBACK_DSH_UI}（与外壳对账过的那版）；在装好依赖的工程里 init 就能盖上当下那版`,
  );
  return { version: FALLBACK_DSH_UI, source: '兜底常量（没读到外壳 manifest）' };
};

const versionIn = (file) => {
  try {
    const version = JSON.parse(readFileSync(file, 'utf8')).version;
    return typeof version === 'string' && version !== '' ? version : undefined;
  } catch {
    return undefined;
  }
};

const shellRange = (root) => {
  const installed = versionIn(join(root, 'node_modules/@dsh-workbench/core/package.json'));
  if (installed !== undefined) return `^${installed}`;
  const own = versionIn(fileURLToPath(new URL('../package.json', import.meta.url)));
  if (own !== undefined) return `^${own}`;
  console.error(
    `读不到 @dsh-workbench/core 与 module-tools 的版本：模板里那三处 @dsh-workbench/* 保持 ${FALLBACK_RANGE}（与以前一样）；在装好依赖的工程里 init 就能盖上当下范围`,
  );
  return FALLBACK_RANGE;
};

export async function init({ root, args = [] }) {
  const unit = args[0];
  if (unit === undefined || !UNIT_ID.test(unit)) {
    console.error('用法：dsh-wb-module init <unit> [--dir <目录>] [--template minimal|diy] [--description <文字>]');
    console.error('  unit 是小写短横线标识（它同时是单元 id、包名后缀、卡片 class 前缀）');
    console.error('  --template diy：带一个真数据源 + 卡片的样板（默认 minimal 是空壳）');
    process.exit(2);
  }
  const picked = args[args.indexOf('--template') + 1];
  const which = args.includes('--template') ? picked : 'minimal';
  const template = TEMPLATES[which];
  if (template === undefined) {
    console.error(`不认识的模板：${String(which)}（可用：${Object.keys(TEMPLATES).join(' / ')}）`);
    process.exit(2);
  }
  const at = args.indexOf('--dir');
  const target = at === -1 ? join(root, `module-${unit}`) : args[at + 1];
  const description =
    args[args.indexOf('--description') + 1] ?? `${unit} 模块：独立 dsh 插件包`;
  if (existsSync(target) && readdirSync(target).length > 0) {
    console.error(`${target} 已经存在且不是空目录，不覆盖`);
    process.exit(2);
  }
  const dshUi = dshUiVersion(root);
  const tokens = {
    __UNIT__: unit,
    __NAME__: `@dsh-workbench/module-${unit}`,
    __DESC__: description,
    __SHELL_RANGE__: shellRange(root),
    __DSH_UI_VERSION__: dshUi.version,
  };

  const fill = (text) =>
    text.replace(new RegExp(Object.keys(tokens).join('|'), 'g'), (token) => tokens[token]);
  const templateDir = fileURLToPath(new URL(template, import.meta.url));
  if (!existsSync(templateDir)) {
    console.error(`模板 ${which} 的目录不在：${templateDir}`);
    process.exit(2);
  }
  cpSync(templateDir, target, { recursive: true });
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tpl|ts|tsx|json|md|yml)$/.test(entry.name)) continue;
      writeFileSync(full, fill(readFileSync(full, 'utf8')));
      if (/\.tpl$/.test(entry.name)) {
        const stripped = join(dir, entry.name.replace(/\.tpl$/, ''));
        cpSync(full, stripped);
        rmSync(full);
      }
    }
  };
  walk(target);
  const declared = readDesign(target);
  if (declared !== undefined) applyToReadme(target, renderDesign(declared));
  const tables = existsSync(join(target, DESIGN_FILE)) ? `${DESIGN_FILE} 里那份三张表` : '还没有三张表（dsh-wb-module design init 生成）';
  console.log(`${target} 建好了：${unit} 模块骨架（模板 ${which}；build / check / design / selfcheck 已接工具）`);
  console.log(`  需求底稿在 ${tables}；空格用 dsh-wb-module design check 查，README 由它生成`);
  console.log(`  模板默认带了 ${DSH_UI}@${dshUi.version}（${dshUi.source}）—— 这是 dsh 原语的类型面 + external 声明两处；`);
  console.log('  装完先在这个 workspace 里跑一次 pnpm install，pnpm typecheck 才认得到它（骨架的判据不依赖它）。');
  console.log('  确实用不到就连 devDependencies 与 dsh.client.external 两处一起删，判据不拦。');
}
