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

function moduleShell(): Plugin {
  const bodyPath = at('dist/client/client.body.js');
  const outPath = at('client.js');
  const marker = '@@WB_MODULE_CSS@@';

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
      if (componentStyles === '') return;
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && item.code.includes(marker)) {
          item.code = item.code.replace(new RegExp(`["']${marker}["']`), JSON.stringify(componentStyles));
        }
      }
    },
    writeBundle() {
      let body = readFileSync(bodyPath, 'utf8');
      if (body.includes(marker)) {

        if (componentStyles !== '') {
          body = body.replace(new RegExp(`["']${marker}["']`), JSON.stringify(componentStyles));
          writeFileSync(bodyPath, body);
        }
      }

      if (body.includes(marker)) {
        throw new Error('module-shell：产物里还有未替换的组件样式占位串 —— *.module.css 没进包（见 ADR-0029 §5 的 S4）');
      }
      const output = `// ⚠️ 本文件由 scripts/build.mjs 生成（moduleShell v2：组件样式 *.module.css 已内联），请勿手改。\n// 改 src/ 后跑：pnpm run build（开发时跑 pnpm run dev 会自动重建并热换）\nwindow.__ModuleLoader__.load({\n  id: ${JSON.stringify(PLUGIN_ID)},\n  factory(require) {\n    const module = { exports: {} };\n    const exports = module.exports;\n${indent(body)}\n    return module.exports;\n  },\n});\n`;
      writeFileSync(outPath, output);
      console.log(`client.js 已更新：${output.length} 字节`);
    },
  };
}

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

const hostRuntimeDeps = [
  'dayjs',
  'execa',
  'which',
  'proper-lockfile',
  'write-file-atomic',
  '@dsh-workbench/adapters-default',
  '@dsh-workbench/adapter-runtime',
  '@dsh-workbench/adapter-supply',
  '@dsh-workbench/adapter-profile',
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

        external: ['react', '@deepseek-ai/dsh-client-ui-primitives'],
        output: {
          exports: 'named' as const,

          codeSplitting: false,
        },
      },
    },
  };
}

export default defineConfig(({ mode }) => (mode === 'host' ? hostConfig() : clientConfig()));
