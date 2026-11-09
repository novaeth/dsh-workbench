import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, read, sourceIndex, walk } from '../lib.mjs';

const SOURCE_EXT = /\.(?:ts|tsx|mjs|cjs|js)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const HOME_NEEDLE = ['process', 'env', 'HOME'].join('.');
const HOME_ALLOWED = new Set();
const ENV_PREFIX_ALLOWED = new Map([
  [
    'packages/adapter-probe/src/toolchain.ts',
    '写的是 node shim 脚本本体：#!/bin/sh 里用 env 设 ELECTRON_RUN_AS_NODE 才是对的',
  ],
]);

const SHELL_INVOCATION_OWN = 'packages/shared/src/host/shell-render.ts';
const SHELL_INVOCATION_PATTERNS = [/-NoProfile/, /-NonInteractive/, /'bash', args: \['-c'/];

const PLAN_SCAN_DIRS = ['packages/adapter-supply/src', 'packages/adapter-runtime/src/data'];
const PLAN_FORBIDDEN = [/rm -rf/, /mkdir -p/, /ln -s/, /cp -R/, /\|\| true/];
const PLAN_ENV_PREFIX = /[A-Z][A-Z0-9_]*=\$\{/;
const PLAN_ENV_FIELD = /(?:^|[\s{(,])env\s*:/;
const PLAN_POSIX_ALLOWED = new Map();

function packageSources() {
  const out = [];
  const packagesRoot = join(REPO, 'packages');
  for (const name of readdirSync(packagesRoot)) {
    for (const sub of ['src', 'scripts', 'bin']) {
      for (const file of walk(join(packagesRoot, name, sub))) {
        if (!SOURCE_EXT.test(file)) continue;
        if (TEST_FILE.test(file)) continue;
        out.push({ rel: file.slice(REPO.length + 1).replaceAll('\\', '/'), source: read(file) });
      }
    }
  }
  return out;
}

const ADAPTERS = [
  'adapters/probe/platform.ts',
  'kernel/contract/platform.ts',
  'contract/protocol/platform.ts',
  'adapters/probe/self-update.ts',
  'adapters/probe/toolchain.ts',
  'adapters/probe/browser-wake.ts',
  'adapters/probe/runtime-seed.ts',
  'shared/api/platform/client.ts',
  'shared/api/platform/contract.ts',
  'host/platform.ts',
  'host/shell-text.ts',
  'host/shell-render.ts',
  'host/git-exec.ts',
];

function normal(name) {
  return name.replaceAll('\\', '/');
}

function isAdapter(name) {
  return ADAPTERS.some((suffix) => name.endsWith(suffix));
}

function isTest(name) {
  return name.includes('/__tests__/') || /\.test\.[cm]?[jt]sx?$/.test(name);
}

export const checks = [
  {
    title: '★ Desktop/Electron 的原始事实只在平台适配器里读（业务代码只许问能力）',
    run(_ctx, report) {
      const hits = [];
      for (const { name, source } of sourceIndex()) {
        const file = normal(name);
        if (isAdapter(file) || isTest(file)) continue;
        for (const line of source.split('\n')) {
          if (line.includes('versions.electron') || line.includes('dshDesktop')) {
            hits.push(`${file}: ${line.trim()}`);
          }
        }
      }
      report(
        '★ Desktop/Electron 的原始事实只在平台适配器里读（业务代码只许问能力）',
        hits.length === 0,
        hits.length === 0 ? '只在 adapters/probe/platform、adapters/probe/toolchain、platform/client 与测试里' : hits.join(' · '),
      );
    },
  },
  {
    title: '★ 宿主 OS 的原始判定只在平台适配器里读（业务代码只问 capabilities）',
    run(_ctx, report) {
      const hits = [];
      for (const { name, source } of sourceIndex()) {
        const file = normal(name);
        if (isAdapter(file) || isTest(file)) continue;
        for (const line of source.split('\n')) {
          if (line.includes('process.platform') || line.includes('hostOs')) {
            hits.push(`${file}: ${line.trim()}`);
          }
        }
      }
      report(
        '★ 宿主 OS 的原始判定只在平台适配器里读（业务代码只问 capabilities）',
        hits.length === 0,
        hits.length === 0 ? '只在 adapters/probe/platform、toolchain、browser-wake、self-update、runtime-seed 与 client 契约里' : hits.join(' · '),
      );
    },
  },
  {
    title: '★ 数据根只从系统的用户主目录来：源码里不许自己读 HOME 环境变量（Windows 上它常常没设）',
    run(_ctx, report) {
      const hits = [];
      for (const { rel, source } of packageSources()) {
        if (HOME_ALLOWED.has(rel)) continue;
        if (source.includes(HOME_NEEDLE)) hits.push(rel);
      }
      report(
        '★ 数据根只从系统的用户主目录来：源码里不许自己读 HOME 环境变量（Windows 上它常常没设）',
        hits.length === 0,
        hits.length === 0
          ? '只用 homedir() / userInfo().homedir'
          : `改用 homedir()：${hits.join(' · ')}`,
      );
    },
  },
  {
    title: '★ 环境变量走宿主的 env 覆盖：命令行里不许手拼 env NAME=value / $env:NAME',
    run(_ctx, report) {
      const hits = [];
      for (const { rel, source } of packageSources()) {
        if (!rel.includes('/src/')) continue;
        if (ENV_PREFIX_ALLOWED.has(rel)) continue;
        for (const line of source.split('\n')) {
          if (/quoteShellArg(?:For)?\(\s*['"]env['"]/.test(line)) hits.push(`${rel}: ${line.trim()}`);
          if (/\benv\s+[A-Z_][A-Z0-9_]*=/.test(line)) hits.push(`${rel}: ${line.trim()}`);
          if (/\$env:[A-Za-z_]/.test(line)) hits.push(`${rel}: ${line.trim()}`);
        }
      }
      report(
        '★ 环境变量走宿主的 env 覆盖：命令行里不许手拼 env NAME=value / $env:NAME',
        hits.length === 0,
        hits.length === 0
          ? ENV_PREFIX_ALLOWED.size === 0
            ? '都走宿主 resolve({ env }) 的覆盖，命令行里只有命令本身'
            : `都走宿主 resolve({ env }) 的覆盖；例外：${[...ENV_PREFIX_ALLOWED].map(([rel, why]) => `${rel}（${why}）`).join('、')}`
          : hits.join(' · '),
      );
    },
  },
  {
    title: '★ 起 shell 的写法只有一处：pwsh / bash 的启动参数由渲染层给',
    run(_ctx, report) {
      const hits = [];
      for (const { rel, source } of packageSources()) {
        if (!rel.includes('/src/')) continue;
        if (rel === SHELL_INVOCATION_OWN) continue;
        for (const line of source.split('\n')) {
          if (SHELL_INVOCATION_PATTERNS.some((pattern) => pattern.test(line))) hits.push(`${rel}: ${line.trim()}`);
        }
      }
      report(
        '★ 起 shell 的写法只有一处：pwsh / bash 的启动参数由渲染层给',
        hits.length === 0,
        hits.length === 0
          ? `只在 ${SHELL_INVOCATION_OWN}（执行缝与自举都从那里拿 invocation）`
          : `改用 shell-render 的 invocationOf：${hits.join(' · ')}`,
      );
    },
  },
  {
    title: '★ DIY 录制这一层没有 POSIX-only 的壳命令（Windows 上没有那些东西）',
    run(_ctx, report) {
      const forbidden = [/\bpkill\b/, /\bkill -0\b/, /\bwc -l\b/, /\btail -n\b/, /\bgrep -m\b/, /\btr -d\b/, /\/dev\/null\b/];
      const hits = [];
      for (const file of walk(join(REPO, 'packages', 'core', 'src'))) {
        const rel = file.slice(REPO.length + 1).replaceAll('\\', '/');
        if (!/\/diy-[^/]*\.ts$/.test(rel)) continue;
        if (isTest(rel)) continue;
        const source = read(file);
        for (const pattern of forbidden) {
          if (pattern.test(source)) hits.push(`${rel} 命中 ${String(pattern)}`);
        }
      }
      report(
        '★ DIY 录制这一层没有 POSIX-only 的壳命令（Windows 上没有那些东西）',
        hits.length === 0,
        hits.length === 0 ? '用 node:fs 与执行缝的 argv：不拼 wc / cat / tail / grep / tr / pkill / kill -0' : hits.join(' · '),
      );
    },
  },
  {
    title: '★ 安装计划里没有 POSIX-only 编排（Windows 上没有 rm -rf / ln -s / cp -R，pwsh 5.1 也不认 ||）',
    run(_ctx, report) {
      const hits = [];
      let scanned = 0;
      for (const dir of PLAN_SCAN_DIRS) {
        for (const file of walk(join(REPO, dir))) {
          if (!SOURCE_EXT.test(file)) continue;
          const rel = file.slice(REPO.length + 1).replaceAll('\\', '/');
          if (isTest(rel) || PLAN_POSIX_ALLOWED.has(rel)) continue;
          scanned += 1;
          for (const [index, line] of read(file).split('\n').entries()) {
            for (const pattern of PLAN_FORBIDDEN) {
              if (pattern.test(line)) hits.push(`${rel}:${index + 1} 命中 ${String(pattern)}`);
            }
            if (PLAN_ENV_FIELD.test(line)) continue;
            if (PLAN_ENV_PREFIX.test(line)) hits.push(`${rel}:${index + 1} 命中裸环境变量前缀`);
          }
        }
      }
      report(
        '★ 安装计划里没有 POSIX-only 编排（Windows 上没有 rm -rf / ln -s / cp -R，pwsh 5.1 也不认 ||）',
        hits.length === 0,
        hits.length === 0
          ? `计划步骤是 PluginPlanStep[]（run 的 env 字段带环境变量），扫 ${scanned} 个文件零命中`
          : `改成 PluginPlanStep[]：${hits.join(' · ')}`,
      );
    },
  },
];
