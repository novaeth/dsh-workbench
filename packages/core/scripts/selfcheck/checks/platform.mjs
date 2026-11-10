import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, read, sourceIndex, walk } from '../lib.mjs';

const SOURCE_EXT = /\.(?:ts|tsx|mjs|cjs|js)$/;
const SHELL_EXT = /\.sh$/;
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
const LINK_TYPE_OWN = 'packages/core/scripts/selfcheck/checks/platform.mjs';
const PATH_SPLIT_OWN = 'packages/core/scripts/selfcheck/checks/platform.mjs';
const SHELL_PROBE_OWN = 'packages/core/scripts/selfcheck/lib.mjs';
const SHELL_INVOCATION_PATTERNS = [/-NoProfile/, /-NonInteractive/, /'bash', args: \['-c'/];
const BARE_SHELL =
  /\b(?:execa|execaSync|execFileSync|execFile|execSync|exec|spawnSync|spawn)\s*\(\s*['"](?:\/usr\/bin\/env\s+|\/bin\/|\/usr\/bin\/)?(?:bash|sh|zsh)['"]/;

const PLAN_SCAN_DIRS = ['packages/adapter-supply/src', 'packages/adapter-runtime/src/data'];
const PLAN_FORBIDDEN = [/rm -rf/, /mkdir -p/, /ln -s/, /cp -R/, /\|\| true/];
const PLAN_ENV_PREFIX = /[A-Z][A-Z0-9_]*=\$\{/;
const PLAN_ENV_FIELD = /(?:^|[\s{(,])env\s*:/;
const PLAN_POSIX_ALLOWED = new Map();

function collectSource(out, file) {
  if (TEST_FILE.test(file)) return;
  const source = read(file);
  if (!SOURCE_EXT.test(file) && !SHELL_EXT.test(file) && !source.startsWith('#!')) return;
  out.push({ rel: file.slice(REPO.length + 1).replaceAll('\\', '/'), source });
}

function packageSources() {
  const out = [];
  const packagesRoot = join(REPO, 'packages');
  for (const name of readdirSync(packagesRoot)) {
    for (const sub of ['src', 'scripts', 'bin']) {
      for (const file of walk(join(packagesRoot, name, sub))) collectSource(out, file);
    }
  }
  for (const file of walk(join(REPO, 'scripts'))) collectSource(out, file);
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

function symlinkCalls(source) {
  const marker = /symlinkSync\s*(?:['"]\s*\]\s*)?\??\.?\s*\(|\.symlink\s*\(/gu;
  const out = [];
  let found = marker.exec(source);
  while (found !== null) {
    const at = found.index;
    let depth = 1;
    let index = at + found[0].length;
    let quote = '';
    let segment = '';
    const args = [];
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (quote !== '') {
        if (char === '\\') {
          segment += char + (source[index + 1] ?? '');
          index += 2;
          continue;
        }
        if (char === quote) quote = '';
        segment += char;
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
        segment += char;
      } else if (char === '(' || char === '[' || char === '{') {
        depth += 1;
        segment += char;
      } else if (char === ')' || char === ']' || char === '}') {
        depth -= 1;
        if (depth > 0) segment += char;
      } else if (char === ',' && depth === 1) {
        args.push(segment);
        segment = '';
      } else {
        segment += char;
      }
      index += 1;
    }
    args.push(segment);
    const argTexts = args.map((one) => one.trim()).filter((one) => one !== '');
    out.push({
      line: source.slice(0, at).split('\n').length,
      args: argTexts.length,
      argTexts,
    });
    found = marker.exec(source);
  }
  return out;
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function pathRefs(source) {
  const out = [];
  const spans = [];
  for (const match of source.matchAll(/process\.env\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]*)['"]\s*\])/gu)) {
    const key = (match[1] ?? match[2] ?? '').toLowerCase();
    if (key !== 'path') continue;
    spans.push([match.index, match.index + match[0].length]);
    out.push({ line: lineAt(source, match.index), end: match.index + match[0].length });
  }
  for (const match of source.matchAll(/\bPATH\b/gu)) {
    if (spans.some(([from, to]) => match.index >= from && match.index < to)) continue;
    out.push({ line: lineAt(source, match.index), end: match.index + match[0].length });
  }
  return out;
}

function pathSplitProblems(source) {
  const out = [];
  for (const ref of pathRefs(source)) {
    const match = /^[\s\S]{0,120}?\.split\s*\(\s*([^)]*)\)/u.exec(source.slice(ref.end));
    if (match === null) continue;
    const arg = match[1].trim();
    if (/^(?:[\w$]+\.)?delimiter$/u.test(arg)) continue;
    out.push({ line: ref.line, arg });
  }
  return out;
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
  {
    title: '★ 建链接必须显式给类型（Windows 上目录链接只能是 junction，不给类型建不起来）',
    run(_ctx, report) {
      const hits = [];
      for (const { rel, source } of packageSources()) {
        if (rel === LINK_TYPE_OWN) continue;
        if (/import\s*\{[^}]*\bsymlinkSync\s+as\s+[\w$]/u.test(source)) {
          hits.push(`${rel} symlinkSync 被别名导入：判据看不见调用点`);
        }
        if (/const\s*\{[^}]*\bsymlinkSync\s*:\s*[\w$]/u.test(source)) {
          hits.push(`${rel} symlinkSync 被解构改名：判据看不见调用点`);
        }
        if (/(?:fs|fsp|fsPromises)\s*\.\s*symlinkSync\b(?!\s*\()/u.test(source)) {
          hits.push(`${rel} symlinkSync 被存成变量：判据看不见调用点`);
        }
        if (/(?:exec\w*|spawn\w*|execa)\s*\(\s*['"]ln['"]|\bmklink\s+\/[Jj]/u.test(source)) {
          hits.push(`${rel} 改用外部命令建链接（ln / mklink）：判据看不见链接类型，Windows 上也没有 ln`);
        }
        for (const call of symlinkCalls(source)) {
          if (call.args < 3) {
            hits.push(`${rel}:${call.line} 建链接少了 type —— 目录链接要 'junction'（或直接走 fs-write 的 linkDir）`);
            continue;
          }
          const third = call.argTexts[2] ?? '';
          if (!/^['"]junction['"]$/u.test(third) && !/^dirLinkTypeOf\s*\(/u.test(third)) {
            hits.push(`${rel}:${call.line} 链接类型只许字面量 'junction' 或 dirLinkTypeOf(...) —— 平台分支只许住在 dirLinkTypeOf`);
          }
        }
      }
      const negative = [
        symlinkCalls('symlinkSync(target, link)')[0]?.args === 2,
        symlinkCalls("symlinkSync(a, join(b, c), 'junction')")[0]?.args === 3,
        symlinkCalls("symlinkSync(\n  a,\n  b,\n  'junction',\n)")[0]?.args === 3,
        !/^['"]junction['"]$/u.test(symlinkCalls("symlinkSync(a, b, 'dir')")[0]?.argTexts[2] ?? ''),
        symlinkCalls("fs['symlinkSync'](a, at)")[0]?.args === 2,
        symlinkCalls('fs.symlinkSync?.(a, at)')[0]?.args === 2,
        symlinkCalls('await fs.promises.symlink(a, at)')[0]?.args === 2,
        /const\s*\{[^}]*\bsymlinkSync\s*:\s*[\w$]/u.test('const { symlinkSync: link } = fs;'),
        /import\s*\{[^}]*\bsymlinkSync\s+as\s+[\w$]/u.test("import { symlinkSync as link } from 'node:fs';"),
        /(?:fs|fsp|fsPromises)\s*\.\s*symlinkSync\b(?!\s*\()/u.test('const link = fs.symlinkSync;'),
        /(?:exec\w*|spawn\w*|execa)\s*\(\s*['"]ln['"]|\bmklink\s+\/[Jj]/u.test("execFileSync('ln', ['-s', a, at]);"),
        /(?:exec\w*|spawn\w*|execa)\s*\(\s*['"]ln['"]|\bmklink\s+\/[Jj]/u.test("execFileSync('cmd', ['/c', 'mklink', '/J', at, a]);") === false,
      ].every((one) => one === true);
      report(
        '★ 建链接必须显式给类型（Windows 上目录链接只能是 junction，不给类型建不起来）',
        hits.length === 0 && negative,
        hits.length === 0
          ? negative
            ? '都传了中立的 junction（或走 linkDir），链接类型的平台分支只有 dirLinkTypeOf 一处（判据负例也过）'
            : '判据自己的负例没过：参数计数或取值不可信'
          : hits.join(' · '),
      );
    },
  },
  {
    title: '★ PATH 只许按 node:path 的 delimiter 切（Windows 上分隔符是分号）',
    run(_ctx, report) {
      const hits = [];
      for (const { rel, source } of packageSources()) {
        if (rel === PATH_SPLIT_OWN) continue;
        for (const problem of pathSplitProblems(source)) {
          hits.push(`${rel}:${problem.line} PATH 不是按 node:path 的 delimiter 切（split 的实参是 ${problem.arg}）`);
        }
      }
      const negative = [
        pathSplitProblems("const parts = (env.PATH ?? '').split(':');").length === 1,
        pathSplitProblems("const parts = (process.env.PATH ?? '').split(delimiter);").length === 0,
        pathSplitProblems("const parts = (process.env.PATH ?? '')\n  .split(':');").length === 1,
        pathSplitProblems("const parts = (process.env['Path'] ?? '').split(';');").length === 1,
        pathSplitProblems("const parts = process.env.PATHEXT.split(';');").length === 0,
      ].every((one) => one === true);
      report(
        '★ PATH 只许按 node:path 的 delimiter 切（Windows 上分隔符是分号）',
        hits.length === 0 && negative,
        hits.length === 0
          ? negative
            ? 'PATH 都按 node:path 的 delimiter 切（判据负例也过）'
            : '判据自己的负例没过：匹配不可信'
          : hits.join(' · '),
      );
    },
  },
  {
    title: '★ 起 POSIX 探针只有一处（脚本与 bin 里写死 bash / sh，换台没装 shell 的机器整条判据就崩）',
    run(_ctx, report) {
      const hits = [];
      for (const { rel, source } of packageSources()) {
        if (rel === SHELL_PROBE_OWN) continue;
        for (const [index, line] of source.split('\n').entries()) {
          if (BARE_SHELL.test(line)) hits.push(`${rel}:${index + 1} ${line.trim()}`);
        }
      }
      const negative = BARE_SHELL.test(['execFileSync(', "'ba", "sh'", ', [script])'].join(''));
      report(
        '★ 起 POSIX 探针只有一处（脚本与 bin 里写死 bash / sh，换台没装 shell 的机器整条判据就崩）',
        hits.length === 0 && negative,
        hits.length === 0
          ? negative
            ? `只有 ${SHELL_PROBE_OWN} 起 POSIX 探针（判据负例也过）`
            : '判据自己的负例没过：匹配不可信'
          : hits.join(' · '),
      );
    },
  },
];
