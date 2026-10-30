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
];
