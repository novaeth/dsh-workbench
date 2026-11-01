import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execa } from 'execa';

const osLabel = process.env.DESKTOP_SMOKE_OS ?? (process.platform === 'win32' ? 'win' : 'mac');
const prefix = `desktop-${osLabel}`;
const cwd = process.cwd();
const home = process.env.USERPROFILE || homedir();
const dshHome = process.env.DSH_HOME?.trim() || join(home, '.dsh');
const profileDir = join(dshHome, 'profiles', 'desktop');
const workbenchHome = process.env.DSH_WORKBENCH_HOME?.trim() || join(dshHome, 'workbench');
const probeLog = join(cwd, `${prefix}-probe.log`);
const verifyLog = join(cwd, `${prefix}-after-restart-probe.log`);
const report = join(cwd, `${prefix}-diagnostics.txt`);
const lines = [];
const push = (line) => lines.push(line);

function section(title) {
  push('');
  push(`=== ${title} ===`);
}

function safe(work, fallback) {
  try {
    return work();
  } catch (error) {
    return `${fallback}: ${String(error?.message ?? error)}`;
  }
}

function tailFile(file, maxLines = 200, maxBytes = 262_144) {
  if (!existsSync(file)) return `${file}（不存在）`;
  const stat = safe(() => statSync(file), undefined);
  if (stat === undefined) return `${file}（读不了）`;
  if (!stat.isFile()) return `${file}（不是文件）`;
  const text = readFileSync(file, 'utf8');
  const bounded = text.length > maxBytes ? text.slice(-maxBytes) : text;
  const kept = bounded.split('\n');
  const sliced = kept.length > maxLines ? kept.slice(-maxLines) : kept;
  return `${file}（${stat.size} 字节，末尾 ${sliced.length} 行）\n${sliced.join('\n')}`;
}

function readAll(file, maxBytes = 262_144) {
  if (!existsSync(file)) return `${file}（不存在）`;
  const text = readFileSync(file, 'utf8');
  return text.length > maxBytes ? `${text.slice(0, maxBytes)}\n…（截断，共 ${text.length} 字符）` : text;
}

function treeOf(root, depth, limit = 400) {
  if (!existsSync(root)) return `${root}（不存在）`;
  const out = [];
  const walk = (dir, level, indent) => {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      const full = join(dir, entry.name);
      const size = safe(() => (entry.isFile() ? statSync(full).size : 0), 0);
      out.push(`${indent}${entry.isDirectory() ? '[D]' : '[F]'} ${entry.name}${entry.isFile() ? ` (${size})` : ''}`);
      if (entry.isDirectory() && level < depth) walk(full, level + 1, `${indent}  `);
    }
  };
  walk(root, 1, '');
  if (out.length >= limit) out.push(`…（只列了前 ${limit} 项）`);
  return out.join('\n');
}

async function processes() {
  const pattern = /DeepSeek|dsh-|opencli/iu;
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execa('tasklist', ['/fo', 'csv', '/v'], { timeout: 20_000, reject: false });
      return stdout.split('\n').filter((line) => pattern.test(line)).join('\n');
    }
    const { stdout } = await execa('ps', ['-Ao', 'pid,ppid,etime,rss,command'], { timeout: 20_000, reject: false });
    return stdout.split('\n').filter((line) => pattern.test(line)).join('\n');
  } catch (error) {
    return `（采集失败）${String(error?.message ?? error)}`;
  }
}

function hostLogs() {
  const roots =
    process.platform === 'win32'
      ? [
          join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'DeepSeek Harness', 'logs'),
          join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'DeepSeek Harness'),
          join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'DeepSeek Harness', 'logs'),
        ]
      : [
          join(home, 'Library', 'Logs', 'DeepSeek Harness'),
          join(home, 'Library', 'Application Support', 'DeepSeek Harness', 'logs'),
        ];
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(?:log|txt)$/iu.test(entry.name)) continue;
      found.push(join(root, entry.name));
    }
  }
  return found;
}

function dependencyOf(manifestFile) {
  if (!existsSync(manifestFile)) return { installed: false, spec: '' };
  const parsed = safe(() => JSON.parse(readFileSync(manifestFile, 'utf8')), {});
  const spec = parsed?.dependencies?.['@dsh-workbench/core'];
  return { installed: typeof spec === 'string', spec: typeof spec === 'string' ? spec : '' };
}

function moduleStateOf(manifestFile) {
  if (!existsSync(manifestFile)) return { installed: false, spec: '' };
  const parsed = safe(() => JSON.parse(readFileSync(manifestFile, 'utf8')), {});
  const spec = parsed?.dependencies?.['@dsh-workbench/module-hello'];
  const bundles = parsed?.dsh?.profile?.bundles ?? [];
  const listed = Array.isArray(bundles) && bundles.includes('@dsh-workbench/module-hello');
  const installed = typeof spec === 'string' || listed;
  return { installed, spec: typeof spec === 'string' ? spec : listed ? 'bundle' : '' };
}

function jsonOf(file) {
  return safe(() => JSON.stringify(JSON.parse(readFileSync(file, 'utf8')), null, 2), '（读不出 JSON）');
}

async function main() {
  section('meta');
  push(`collected-at: ${new Date().toISOString()}`);
  push(`platform: ${process.platform} ${process.arch} · node ${process.version}`);
  push(`cwd: ${cwd}`);
  push(`home: ${home}`);
  push(`dsh-home: ${dshHome}`);
  push(`workbench-home: ${workbenchHome}`);
  for (const name of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_JOB', 'DESKTOP_SMOKE_STATUS']) {
    if (process.env[name] !== undefined) push(`${name}: ${process.env[name]}`);
  }
  push(`probe-log: ${probeLog}`);
  const git = await execa('git', ['log', '-1', '--format=%h %s'], { cwd, timeout: 10_000, reject: false });
  push(`git: ${git.stdout.trim()}`);
  const status = await execa('git', ['status', '--short'], { cwd, timeout: 10_000, reject: false });
  push(`git-status: ${status.stdout.trim() || '干净'}`);

  const probeText = safe(
    () => `${readFileSync(probeLog, 'utf8')}\n${existsSync(verifyLog) ? readFileSync(verifyLog, 'utf8') : ''}`,
    '',
  );
  const probeLines = probeText.split('\n');
  const pick = (pattern, limit = 6) =>
    probeLines
      .filter((line) => pattern.test(line))
      .slice(-limit)
      .join('\n');
  const lastLine = (pattern) => {
    for (let index = probeLines.length - 1; index >= 0; index -= 1) {
      if (pattern.test(probeLines[index])) return probeLines[index];
    }
    return '（没有）';
  };

  section('triage');
  push(`探针总结: ${lastLine(/SMOKE_SUMMARY/u)}`);
  push(`第一处错误: ${lastLine(/FATAL|Error:|FAIL /u)}`);
  push('');
  push('里程碑:');
  push(pick(/MILESTONE/u, 12) || '（没有）');
  push('');
  push('现场文件:');
  push(pick(/WROTE |SHOT /u, 14) || '（没有）');
  push('');
  push('体检失败快照:');
  push(lastLine(/PREFLIGHT_FAILED/u) || '（没有）');

  section('smoke results');
  for (const file of [`${prefix}-smoke.json`, `${prefix}-after-restart-smoke.json`]) {
    push(`${file}:`);
    push(jsonOf(join(cwd, file)));
  }

  const manifest = join(profileDir, 'package.json');
  const dependency = dependencyOf(manifest);
  const moduleState = moduleStateOf(manifest);
  const opencliManifest = join(workbenchHome, 'opencli', 'toolchain', 'node_modules', '@jackwener', 'opencli', 'package.json');
  const marketListed = safe(
    () => (/module-hello|Sample module/u.test(readFileSync(join(cwd, `${prefix}-market-body.txt`), 'utf8')) ? '是' : '否'),
    '否',
  );
  const marketInstalled = safe(
    () => (/Installed:|restart once/u.test(readFileSync(join(cwd, `${prefix}-market-installed.txt`), 'utf8')) ? '是' : '否'),
    '否',
  );
  const cardVisible = safe(
    () =>
      /Sample module|示例模块|hello, workbench/u.test(
        readFileSync(join(cwd, `${prefix}-after-restart-verify-body.txt`), 'utf8'),
      )
        ? '是'
        : '否',
    '否',
  );

  section('checklist');
  push(`profile 里有 @dsh-workbench/core: ${dependency.installed ? `是（${dependency.spec}）` : '否'}`);
  push(`profile 里有 @dsh-workbench/module-hello: ${moduleState.installed ? `是（${moduleState.spec}）` : '否'}`);
  push(`opencli 装上了: ${existsSync(opencliManifest) ? '是' : '否'}（${opencliManifest}）`);
  push(`市场索引列出模块: ${marketListed}`);
  push(`市场装上了模块: ${marketInstalled}`);
  push(`重启后看到了模块卡片: ${cardVisible}`);
  const shots = safe(
    () =>
      readdirSync(cwd)
        .filter((name) => name.startsWith(prefix) && name.endsWith('.png'))
        .map((name) => `${name} (${statSync(join(cwd, name)).size})`)
        .join(' · '),
    '（读不了）',
  );
  push(`截图: ${shots === '' ? '（没有）' : shots}`);
  const briefEnd = lines.length;

  section('probe log');
  push(tailFile(probeLog, 600));
  push(tailFile(verifyLog, 400));

  section('app stdout/stderr');
  const runnerTemp = process.env.RUNNER_TEMP ?? '';
  const appLogs = [
    ['DESKTOP_SMOKE_APP_LOG', `${prefix}-app.log`],
    ['DESKTOP_SMOKE_APP_ERR', `${prefix}-app.err.log`],
    ['DESKTOP_SMOKE_APP_LOG_2', `${prefix}-app2.log`],
    ['DESKTOP_SMOKE_APP_ERR_2', `${prefix}-app2.err.log`],
  ];
  for (const [name, fallback] of appLogs) {
    const fromEnv = process.env[name];
    const file = fromEnv !== undefined && fromEnv !== '' ? fromEnv : runnerTemp === '' ? '' : join(runnerTemp, fallback);
    if (file === '') {
      push(`${name}: （未设置）`);
      continue;
    }
    push(`${name}: ${file}`);
    push(tailFile(file, 300));
  }

  section('market artifacts');
  for (const name of [
    `${prefix}-market-body.txt`,
    `${prefix}-market-installed.txt`,
    `${prefix}-verify-body.txt`,
    `${prefix}-after-restart-verify-body.txt`,
    `${prefix}-final-body.txt`,
  ]) {
    push(tailFile(join(cwd, name), 80));
  }

  section('desktop install tree');
  const desktopRoot =
    process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? home, 'Programs', 'DeepSeek Harness', 'resources')
      : '/Applications/DeepSeek Harness.app/Contents/Resources';
  push(`resources: ${desktopRoot}（${existsSync(desktopRoot) ? '在' : '不在'}）`);
  if (existsSync(desktopRoot)) {
    const walk = (dir, depth) => {
      if (depth > 4) return;
      const entries = safe(() => readdirSync(dir, { withFileTypes: true }), []);
      for (const entry of entries) {
        const next = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (/runtime|pnpm|node/i.test(entry.name) || /dependencies/.test(dir)) push(`  dir ${next.slice(desktopRoot.length + 1)}`);
          walk(next, depth + 1);
          continue;
        }
        if (/pnpm|node\.exe|npm/iu.test(entry.name)) push(`  file ${next.slice(desktopRoot.length + 1)}`);
      }
    };
    walk(desktopRoot, 0);
  }

  section('opencli doctor');
  const opencliBin = join(workbenchHome, 'opencli', 'bin', process.platform === 'win32' ? 'opencli.cmd' : 'opencli');
  push(`bin: ${opencliBin}（${existsSync(opencliBin) ? '在' : '不在'}）`);
  if (existsSync(opencliBin)) {
    const doctor =
      process.platform === 'win32'
        ? await execa(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', opencliBin, 'doctor'], {
            timeout: 60_000,
            reject: false,
          })
        : await execa(opencliBin, ['doctor'], { timeout: 60_000, reject: false });
    push(`exit: ${String(doctor.exitCode)}`);
    push(doctor.stdout ?? '');
    push(doctor.stderr ?? '');
  }

  section('extension prep');
  push(tailFile(join(cwd, `${prefix}-prep.log`), 80));

  section('smoke browser');
  push(`chrome: ${process.env.DESKTOP_SMOKE_CHROME ?? '（未设置）'}`);
  push(`extension: ${process.env.DESKTOP_SMOKE_EXTENSION ?? '（未设置）'}`);
  push(`opencli bin: ${process.env.DESKTOP_SMOKE_OPENCLI ?? '（未设置）'}`);
  push(tailFile(join(cwd, `${prefix}-chrome.log`), 120));

  section('units and client injection');
  for (const name of [
    `${prefix}-units.json`,
    `${prefix}-after-restart-units.json`,
    `${prefix}-client-bundles.json`,
    `${prefix}-after-restart-client-bundles.json`,
    `${prefix}-page-internals.json`,
    `${prefix}-after-restart-page-internals.json`,
    `${prefix}-scripts.json`,
    `${prefix}-after-restart-scripts.json`,
    `${prefix}-console-events.json`,
    `${prefix}-after-restart-console-events.json`,
  ]) {
    push(`${name}:`);
    push(readAll(join(cwd, name), 40_000));
  }

  section('dsh startup logs');
  const startupDir = join(dshHome, 'logs');
  if (existsSync(startupDir)) {
    const files = safe(() => readdirSync(startupDir).filter((name) => name.endsWith('.log')).sort().slice(-2), []);
    if (files.length === 0) push(`${startupDir}（没有 .log）`);
    for (const name of files) push(tailFile(join(startupDir, name), 200));
  } else {
    push(`${startupDir}（不存在）`);
  }

  section('desktop app logs');
  const logs = hostLogs();
  if (logs.length === 0) push('（没找到 Desktop 自己的日志文件）');
  for (const file of logs.slice(-6)) push(tailFile(file, 200));

  section(`workbench home tree（${workbenchHome}）`);
  push(treeOf(workbenchHome, 4));

  section('seed.log');
  push(readAll(join(workbenchHome, 'seed.log')));

  section('diy/.sync.json');
  push(readAll(join(workbenchHome, 'diy', '.sync.json')));

  section('profile package.json');
  push(readAll(manifest));

  section('profile cordis.patch.yml');
  push(readAll(join(profileDir, 'cordis.patch.yml')));

  section('profile cordis.yml');
  push(readAll(join(profileDir, 'cordis.yml')));

  section('workbench browser.json');
  push(readAll(join(workbenchHome, 'browser.json')));

  section(`dsh home tree（${dshHome}）`);
  push(treeOf(dshHome, 3, 200));

  section('processes');
  push(await processes());

  writeFileSync(report, `${lines.join('\n')}\n`);
  process.stdout.write(lines.slice(0, briefEnd).join('\n'));
  process.stdout.write(`\n\nDIAGNOSTICS_FILE ${report}\n`);

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile === undefined || summaryFile === '') return;
  const summaryLines = [
    `### desktop / ${osLabel} — ${process.env.DESKTOP_SMOKE_STATUS ?? 'unknown'}`,
    '',
    `- 探针总结：\`${lastLine(/SMOKE_SUMMARY/u)}\``,
    `- 第一处错误：\`${lastLine(/FATAL|Error:|FAIL /u) || '（没有）'}\``,
    `- profile 里有 core：${dependency.installed ? '是' : '否'} · module-hello：${moduleState.installed ? '是' : '否'}`,
    `- 市场列出模块：${marketListed} · 装了模块：${marketInstalled} · 卡片可见：${cardVisible}`,
    `- opencli 装上了：${existsSync(opencliManifest) ? '是' : '否'}`,
    `- 现场：\`${prefix}-probe.log\` · \`${prefix}-diagnostics.txt\` · ${shots === '' ? '（没有截图）' : shots}`,
    `- 日志分支：\`desktop-ui-log-${osLabel}-${process.env.GITHUB_RUN_ID ?? 'local'}\``,
  ];
  writeFileSync(summaryFile, `${summaryLines.join('\n')}\n`, { flag: 'a' });
}

await main();
