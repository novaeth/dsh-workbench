import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { isAbsolute, join, relative } from 'node:path';
import { build as esbuild } from 'esbuild';
import { SEED_SPECIFIERS } from './seed.mjs';
import { cssInjectionCode } from './css-injection.mjs';

const SHELL_CLIENT = '@dsh-workbench/core/client';
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.json'];
const SINGLETON = /^@\/shared\/(hooks|components)\//;

const SEED_EXTERNAL = SEED_SPECIFIERS;

function pickEntry(root, names) {
  for (const name of names) {
    const full = join(root, name);
    if (existsSync(full)) return name;
  }
  return undefined;
}

function aliasResolver({ root, unit }) {
  const localSrc = join(root, 'src');
  return {
    name: 'dsh-wb-module:alias',
    setup(context) {
      context.onResolve({ filter: /^@\// }, (args) => {
        if (SINGLETON.test(args.path)) {
          throw new Error(
            `${args.path} 必须从 kit 拿（运行时要单例），不能内联进模块包 —— 内联就是第二份实例`,
          );
        }
        let base;
        if (unit !== undefined && args.path.startsWith(`@/modules/${unit}/`)) {
          base = join(localSrc, args.path.slice(`@/modules/${unit}/`.length));
        } else {
          const platform = /^@\/platforms\/[^/]+\/(.+)$/.exec(args.path);
          if (platform) base = join(localSrc, 'platforms', platform[1]);
        }
        if (base === undefined) {
          throw new Error(
            `${args.path} 指向外壳源码，模块不许这样引 —— 改从包名引（@dsh-workbench/shared 或 /host）；` +
              `模块自己的文件用 @/modules/${unit ?? '<unit>'}/… 或相对路径`,
          );
        }

        if (base.endsWith('.css') && existsSync(base)) {
          return { path: base, namespace: 'dsh-wb-css' };
        }
        for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
          if (existsSync(candidate)) return { path: candidate };
        }
        throw new Error(`解析不到：${args.path}（试过 ${base}.{ts,tsx} 与 ${base}/index.{ts,tsx}）`);
      });
    },
  };
}

function cssInjector({ root }) {
  return {
    name: 'dsh-wb-module:css',
    setup(context) {
      context.onResolve({ filter: /\.css$/ }, (args) => ({
        path: isAbsolute(args.path) ? args.path : join(args.resolveDir === '' ? root : args.resolveDir, args.path),
        namespace: 'dsh-wb-css',
      }));
      context.onLoad({ filter: /.*/, namespace: 'dsh-wb-css' }, (args) => {

        const outsourcedKitCss =
          /node_modules\/@dsh-workbench\/(shared|core)\//.test(args.path) ||
          /\/packages\/(shared|workbench)\/(src|dist)\//.test(args.path);
        if (outsourcedKitCss) return { contents: 'export default {};', loader: 'js' };
        const raw = readFileSync(args.path, 'utf8');
        const key = relative(root, args.path).split('/').reverse()[0] + ':' + args.path;
        const scoped = /\.module\.css$/.test(args.path);

        let css = raw;
        let map = '{}';
        if (scoped) {
          const hash = createHash('sha1').update(relative(root, args.path)).digest('hex').slice(0, 6);

          const globals = [];
          const guarded = raw.replace(/:global\([^)]*\)/g, (piece) => {
            globals.push(piece.slice(':global('.length, -1));
            return `@dshwb-global-${globals.length - 1}@`;
          });
          const names = [
            ...new Set([...guarded.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1])),
          ].sort((a, b) => b.length - a.length);

          const pairs = names.map((name) => [name, `_${hash}_${name}`]);
          css = guarded;
          for (const [from, to] of pairs) css = css.split(`.${from}`).join(`.${to}`);
          css = css.replace(/@dshwb-global-(\d+)@/g, (_whole, at) => globals[Number(at)] ?? '');
          map = JSON.stringify(Object.fromEntries(pairs));
        }
        return {
          loader: 'js',
          contents: [`${cssInjectionCode(key, css)}`, `export default ${map};`].join('\n'),
        };
      });
    },
  };
}

export async function build({ root }) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const id = manifest.name;
  if (typeof id !== 'string' || id === '') throw new Error('package.json 里没有 name，认不出模块 id');
  const unit = manifest.dsh?.workbench?.unit;
  const declared = manifest.dsh?.client?.external ?? [];
  const plugins = [aliasResolver({ root, unit })];
  const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

  const hostEntry = pickEntry(root, ['src/plugin.host.ts', 'src/host.ts']);
  if (hostEntry !== undefined) {
    await esbuild({
      absWorkingDir: root,
      entryPoints: [hostEntry],
      outfile: 'dist/host.js',
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      external: [...nodeBuiltins, '@dsh-workbench/shared', '@dsh-workbench/shared/*', '@dsh-workbench/core', '@dsh-workbench/core/*'],
      resolveExtensions: RESOLVE_EXTENSIONS,
      plugins,
      logLevel: 'warning',
    });
  }

  const clientEntry = pickEntry(root, ['src/plugin.client.ts', 'src/client.tsx']);
  if (clientEntry === undefined) throw new Error('找不到浏览器侧入口（src/plugin.client.ts 或 src/client.tsx）');
  const client = await esbuild({
    absWorkingDir: root,
    entryPoints: [clientEntry],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    external: [SHELL_CLIENT, ...SEED_EXTERNAL, ...declared],
    metafile: true,
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    resolveExtensions: RESOLVE_EXTENSIONS,
    plugins: [...plugins, cssInjector({ root })],
    write: false,
    logLevel: 'warning',
  });

  const inlinedDsh = Object.keys(client.metafile.inputs).filter((path) => /@deepseek-ai[\\/]/.test(path));
  if (inlinedDsh.length > 0) {
    throw new Error(
      `${id}: dsh 的包被打进了浏览器产物 —— ${inlinedDsh.join('、')}\n` +
        '这些应当由外壳的模块表提供（标成 external 才是"用外壳那一份"）。',
    );
  }

  const indented = client.outputFiles[0].text
    .split('\n')
    .map((line) => (line === '' ? line : `    ${line}`))
    .join('\n');

  const wrapped = `// ⚠️ 本文件由 dsh-wb-module build 生成，请勿手改。改 src/ 后跑：dsh-wb-module build\nwindow.__ModuleLoader__.load({\n  id: ${JSON.stringify(id)},\n  factory(require) {\n    const module = { exports: {} };\n    const exports = module.exports;\n${indented}\n    return module.exports;\n  },\n});\n`;

  writeFileSync(join(root, 'client.js'), wrapped);

  console.log(`${id}：client.js 已更新（${Buffer.byteLength(wrapped, 'utf8')} 字节）`);
}
