import { readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

export const srcAlias: Record<string, string> = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

const PKG_ROOT = fileURLToPath(new URL('.', import.meta.url));

const stageRoot = process.env.WB_STAGE_DIR === '' ? undefined : process.env.WB_STAGE_DIR;
if (stageRoot !== undefined) {
  if (!isAbsolute(stageRoot)) {
    throw new Error(`WB_STAGE_DIR 必须是绝对路径（收到 ${stageRoot}）`);
  }

  const stage = resolve(stageRoot);
  if (stage === '/' || stage === resolve(PKG_ROOT) || resolve(PKG_ROOT).startsWith(stage + sep)) {
    throw new Error(`WB_STAGE_DIR 不能是包根或它的祖先目录（收到 ${stage}）`);
  }
}

function at(relativePath: string): string {
  return stageRoot === undefined ? join(PKG_ROOT, relativePath) : join(stageRoot, relativePath);
}

const devSurfaceImpl = process.env.WB_RELEASE === '1' ? 'surface.stub.ts' : 'surface.ts';
const devSurfaceAlias: Record<string, string> = {
  '@/shared/dev-surface/install': fileURLToPath(new URL(`./src/dev/${devSurfaceImpl}`, import.meta.url)),
};

export const PLUGIN_ID = '@dsh-workbench/core';

function indent(text: string, spaces = 6): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
}

const CLIENT_CSS_PATH = 'src/workbench.css';

function moduleShell(): Plugin {
  const bodyPath = at('dist/client/client.body.js');
  const outPath = at('client.js');

  let componentStyles = '';
  return {
    name: 'dsh-workbench:module-shell',
    apply: 'build',

    enforce: 'post',
    buildStart() {
      componentStyles = '';
    },
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'asset' && String(item.fileName).endsWith('.css')) {
          if (String(item.source).length > 0) componentStyles = String(item.source);

          delete bundle[item.fileName];
        }
      }
    },
    writeBundle() {
      if (componentStyles === '') {
        throw new Error('module-shell：这次构建没有产出组件样式 —— *.module.css 没进包');
      }
      const body = readFileSync(bodyPath, 'utf8');
      const css = componentStyles;
      const output = `// ⚠️ 本文件由 scripts/build.mjs 生成（moduleShell v4：样式以 meta.stylesheets 交给 dsh renderer；老宿主没有这条通道时自己补一份），请勿手改。\n// 改 src/ 后跑：pnpm run build（开发时跑 pnpm run dev 会自动重建并热换）\nconst __DSH_WB_STYLES__ = ${JSON.stringify(css)};\nconst __DSH_WB_STYLE_PATH__ = ${JSON.stringify(CLIENT_CSS_PATH)};\nconst __DSH_WB_ID__ = ${JSON.stringify(PLUGIN_ID)};\nwindow.__ModuleLoader__.load({\n  id: __DSH_WB_ID__,\n  meta: () => ({\n    stylesheets: {\n      [__DSH_WB_STYLE_PATH__]: {\n        text: () => __DSH_WB_STYLES__,\n      },\n    },\n  }),\n  factory(require) {\n    const module = { exports: {} };\n    const exports = module.exports;\n${indent(body)}\n    return module.exports;\n  },\n});\ninstallModuleStyles();\nfunction installModuleStyles() {\n  if (typeof document === 'undefined' || typeof document.querySelector !== 'function' || document.head === undefined) return;\n  const inject = () => {\n    const ours = document.querySelector('style[data-dsh-workbench-styles]');\n    if (ours !== null) ours.remove();\n    if (document.querySelector('style[data-plugin="' + __DSH_WB_ID__ + '"]') !== null) return;\n    const tag = document.createElement('style');\n    tag.setAttribute('data-dsh-workbench-styles', __DSH_WB_STYLE_PATH__);\n    tag.textContent = __DSH_WB_STYLES__;\n    document.head.appendChild(tag);\n  };\n  if (stylesheetsSupported() === false) {\n    inject();\n    return;\n  }\n  setTimeout(inject, 60);\n}\nfunction stylesheetsSupported() {\n  const boot = window.__DSH_BOOT__;\n  const release = boot === null || typeof boot !== 'object' ? undefined : boot.release;\n  const version = release === null || typeof release !== 'object' ? '' : release.version;\n  const found = typeof version === 'string' ? /^(\\d+)\\.(\\d+)\\.(\\d+)/.exec(version) : null;\n  if (found === null) return undefined;\n  const major = Number(found[1]);\n  const minor = Number(found[2]);\n  const patch = Number(found[3]);\n  return major > 0 || minor > 2 || (minor === 2 && patch >= 3);\n}\n`;
      writeFileSync(outPath, output);
      console.log(`client.js 已更新：${output.length} 字节`);
    },
  };
}

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

const BUNDLED_WORKSPACE_DEPS = new Set(['@dsh-workbench/shared']);

const workspaceRuntimeDeps = (): readonly string[] => {
  try {
    const manifest = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    return Object.keys(manifest.dependencies ?? {}).filter(
      (name) => name.startsWith('@dsh-workbench/') && !BUNDLED_WORKSPACE_DEPS.has(name),
    );
  } catch {
    return [];
  }
};

const hostRuntimeDeps = [
  'dayjs',
  'execa',
  'which',
  'proper-lockfile',
  'tinyglobby',
  'write-file-atomic',
  'yaml',
  ...workspaceRuntimeDeps(),
];

function hostConfig() {
  return {
    resolve: { alias: srcAlias },
    build: {
      outDir: at('dist/host'),
      emptyOutDir: true,
      target: 'node20',
      minify: false,
      sourcemap: false,
      lib: {
        entry: fileURLToPath(new URL('./src/app/host.ts', import.meta.url)),
        formats: ['es'] as const,
        fileName: () => 'index.js',
      },
      rollupOptions: {

        external: (id: string) =>
          nodeBuiltins.includes(id) ||
          hostRuntimeDeps.some((dep) => id === dep || id.startsWith(`${dep}/`)),
        output: { entryFileNames: 'index.js' },
      },
    },
  };
}

function clientConfig() {
  return {
    resolve: { alias: { ...devSurfaceAlias, ...srcAlias } },

    plugins: [moduleShell()],
    esbuild: {

      jsx: 'transform' as const,
      jsxFactory: 'h',
      jsxFragment: 'Fragment',
    },
    build: {
      outDir: at('dist/client'),
      emptyOutDir: true,
      target: 'es2022',
      minify: false,
      sourcemap: false,
      lib: {
        entry: fileURLToPath(new URL('./src/app/client.tsx', import.meta.url)),
        formats: ['cjs', 'es'] as const,
        fileName: (format: string) => (format === 'cjs' ? 'client.body.js' : 'index.js'),

        cssFileName: 'client',
      },
      rollupOptions: {

        external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
        output: {
          exports: 'named' as const,

          codeSplitting: false,
        },
      },
    },
  };
}

export default defineConfig(({ mode }) => (mode === 'host' ? hostConfig() : clientConfig()));
