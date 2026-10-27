import type { spawn } from 'node:child_process';
import writeFileAtomic from 'write-file-atomic';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { hostSurface } from './platform.js';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { type SeedCommand, runDetached } from './runtime-seed.js';
import {
  SELF_UPDATE_STATES,
  type SelfUpdateState,
  type WorkbenchSelfUpdate,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';

export { SELF_UPDATE_STATES, type SelfUpdateState };

export interface SelfUpdateCli {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface SelfUpdateProcess {
  readonly execPath: string;
  readonly argv: readonly string[];
  readonly versions: { readonly electron?: string | undefined; readonly node?: string | undefined };
}

const PATH_DSH: SelfUpdateCli = { file: 'dsh', args: [], env: {} };

function isPathDsh(cli: SelfUpdateCli): boolean {
  return cli.file === PATH_DSH.file && cli.args.length === 0 && Object.keys(cli.env).length === 0;
}

function quoted(value: string): string {
  return quoteShellArg(value);
}

function cliCommand(cli: SelfUpdateCli): string {
  const env = Object.entries(cli.env)
    .map(([key, value]) => `${key}=${quoted(value)}`)
    .join(' ');
  const command = [cli.file, ...cli.args].map(quoted).join(' ');
  return env === '' ? command : `env ${env} ${command}`;
}

export function desktopSelfUpdateCli(
  proc: SelfUpdateProcess = process,
  exists: (path: string) => boolean = existsSync,
): SelfUpdateCli | undefined {
  if (hostSurface({ proc }).deployment !== 'desktop') return undefined;
  const entry = proc.argv[1];
  if (entry === undefined || !/dsh-desktop-host[\\/]lib[\\/]index\.js$/.test(entry)) return undefined;
  const cli = join(dirname(entry), 'cli.js');
  if (!exists(cli)) return undefined;
  return {
    file: proc.execPath,
    args: ['--expose-internals', cli],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

export function selfUpdateCliFor(
  profile: string,
  proc: SelfUpdateProcess = process,
  exists: (path: string) => boolean = existsSync,
): SelfUpdateCli {
  const surface = hostSurface({ proc, profile });
  if (surface.capabilities.selfUpdateCli !== 'desktop-cli') return PATH_DSH;
  return desktopSelfUpdateCli(proc, exists) ?? PATH_DSH;
}

export interface SelfUpdatePaths {
  readonly dir: string;
  readonly script: string;
  readonly marker: string;
  readonly log: string;
}

export interface SelfUpdateRequest {
  readonly dshHome: string;
  readonly profile: string;
  readonly pkg: string;
  readonly from: string;
  readonly to: string;
  readonly pinned: boolean;
}

export interface SelfUpdateMarker extends SelfUpdateRequest {
  readonly state: SelfUpdateState;
  readonly version: string;
  readonly at: string;
}

export interface SelfUpdatePlan {
  readonly paths: SelfUpdatePaths;
  readonly script: string;
  readonly marker: SelfUpdateMarker;
  readonly command: SeedCommand;
}

export interface SelfUpdateStart {
  readonly started: boolean;
  readonly paths: SelfUpdatePaths;
  readonly forward: string;
}


export function selfUpdatePaths(dshHome: string, platform: NodeJS.Platform = process.platform): SelfUpdatePaths {
  const configured = process.env.DSH_WORKBENCH_HOME?.trim();
  const dir = configured === undefined || configured === '' ? join(dshHome, 'workbench') : configured;
  return {
    dir,
    script: join(dir, platform === 'win32' ? 'self-update.mjs' : 'self-update.sh'),
    marker: join(dir, 'self-update.json'),
    log: join(dir, 'self-update.log'),
  };
}

export function recoveryCommand(input: {
  readonly profile: string;
  readonly pkg: string;
  readonly version: string;
  readonly cli?: SelfUpdateCli | undefined;
}): string {
  const cli = input.cli ?? PATH_DSH;
  const command = isPathDsh(cli) ? 'dsh' : cliCommand(cli);
  return `${command} plugin --profile ${input.profile} add ${input.pkg}@${input.version}`;
}

export function selfUpdateMarker(
  request: SelfUpdateRequest,
  state: SelfUpdateState,
  version: string,
  at: string,
): SelfUpdateMarker {
  return { ...request, state, version, at };
}

export function selfUpdateScript(
  request: SelfUpdateRequest,
  paths: SelfUpdatePaths,
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
): string {
  const rescue = recoveryCommand({
    profile: request.profile,
    pkg: request.pkg,
    version: request.from,
    cli,
  });
  const lastsOne = recoveryCommand({
    profile: request.profile,
    pkg: request.pkg,
    version: request.to === '' ? 'latest' : request.to,
    cli,
  });
  const target = request.to === '' ? 'latest' : request.to;
  const landed = request.to === '' ? 'is_other' : 'is_to';
  const restart = isPathDsh(cli) ? '重启一次 dsh' : '退出并重开 Desktop';
  const install = isPathDsh(cli)
    ? 'install() { dsh plugin --profile "$PROFILE" add "$PKG@$1" >>"$LOG" 2>&1; }'
    : `install() { ${cliCommand(cli)} plugin --profile "$PROFILE" add "$PKG@$1" >>"$LOG" 2>&1; }`;
  const guard = isPathDsh(cli)
    ? 'if ! command -v dsh >/dev/null 2>&1; then'
    : `if ! command -v ${quoted(cli.file)} >/dev/null 2>&1; then`;
  const missing = isPathDsh(cli)
    ? `say "PATH 上没有 dsh —— 这一跳没跑。救法：${rescue}"`
    : `say ${quoted(`找不到 Desktop 的 dsh（${cli.file}）—— 这一跳没跑。救法：${rescue}`)}`;
  return `#!/usr/bin/env bash
set -uo pipefail
DSH_HOME=${quoted(request.dshHome)}
export DSH_HOME
PKG=${quoted(request.pkg)}
PROFILE=${quoted(request.profile)}
FROM=${quoted(request.from)}
TO=${quoted(target)}
MARKER=${quoted(paths.marker)}
LOG=${quoted(paths.log)}
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
say() { printf '%s %s\\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
on_disk() {
  node -e 'const p=process.argv[1];try{process.stdout.write(require(p).version)}catch(e){}' \\
    "$PROFILE_DIR/node_modules/$PKG/package.json" 2>/dev/null
}
write_marker() {
  printf '{"pkg":"%s","profile":"%s","from":"%s","to":"%s","state":"%s","version":"%s","at":"%s"}\\n' \\
    "$PKG" "$PROFILE" "$FROM" "$TO" "$1" "$2" "$(date -u '+%FT%TZ')" >"$MARKER"
}
${install}
is_to() { [ "$(on_disk)" = "$TO" ]; }
is_other() { [ -n "$(on_disk)" ] && [ "$(on_disk)" != "$FROM" ]; }
${guard}
  ${missing}
  write_marker failed "$FROM"
  exit 1
fi
say "开始 \${FROM} -> \${TO}（不卸任何一行）"
write_marker running "$FROM"
if install "$TO" && ${landed}; then
  say "换好了：$(on_disk) 在盘上（目标 \${TO}），${restart} 才用得上"
  write_marker ok "$(on_disk)"
  exit 0
fi
say "换版没成（盘上 $(on_disk)）—— 把 \${FROM} 装回去"
if install "$FROM" && [ "$(on_disk)" = "$FROM" ]; then
  say "已回滚：\${FROM} 还在盘上，工作台这一行没被动过"
  write_marker rolled-back "$FROM"
  exit 0
fi
say "回滚也没成。救法：${rescue}（或 ${lastsOne}）"
write_marker failed "$(on_disk)"
exit 1
`;
}

export function selfUpdateNodeScript(
  request: SelfUpdateRequest,
  paths: SelfUpdatePaths,
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
): string {
  const target = request.to === '' ? 'latest' : request.to;
  const restart = isPathDsh(cli) ? '重启一次 dsh' : '退出并重开 Desktop';
  const rescue = recoveryCommand({ profile: request.profile, pkg: request.pkg, version: request.from, cli });
  const last = recoveryCommand({ profile: request.profile, pkg: request.pkg, version: target, cli });
  const missing = isPathDsh(cli)
    ? `PATH 上没有 dsh —— 这一跳没跑。救法：${rescue}`
    : `找不到 Desktop 的 dsh（${cli.file}）—— 这一跳没跑。救法：${rescue}`;
  return [
    '#!/usr/bin/env node',
    "import { spawnSync } from 'node:child_process';",
    "import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';",
    "import { delimiter, join } from 'node:path';",
    `const DSH_HOME = ${JSON.stringify(request.dshHome)};`,
    `const PKG = ${JSON.stringify(request.pkg)};`,
    `const PROFILE = ${JSON.stringify(request.profile)};`,
    `const FROM = ${JSON.stringify(request.from)};`,
    `const TO = ${JSON.stringify(target)};`,
    `const MARKER = ${JSON.stringify(paths.marker)};`,
    `const LOG = ${JSON.stringify(paths.log)};`,
    `const CLI = ${JSON.stringify(cli)};`,
    'const say = (message) => appendFileSync(LOG, `${new Date().toISOString()} ${message}\\n`);',
    "const onDisk = () => { try { const read = JSON.parse(readFileSync(join(DSH_HOME, 'profiles', PROFILE, 'node_modules', PKG, 'package.json'), 'utf8')); return typeof read.version === 'string' ? read.version : ''; } catch { return ''; } };",
    'const writeMarker = (state, version) => writeFileSync(MARKER, JSON.stringify({ pkg: PKG, profile: PROFILE, from: FROM, to: TO, state, version, at: new Date().toISOString() }) + \'\\n\');',
    "const install = (version) => { const result = spawnSync(CLI.file, [...CLI.args, 'plugin', '--profile', PROFILE, 'add', `${PKG}@${version}`], { env: { ...process.env, ...CLI.env }, encoding: 'utf8' }); if (result.stdout) say(result.stdout.trim()); if (result.stderr) say(result.stderr.trim()); if (result.error) say(String(result.error)); return result.status === 0; };",
    "const canRun = () => { if (CLI.file.includes('/') || (CLI.file.length > 2 && CLI.file[1] === ':')) return existsSync(CLI.file); const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']; return (process.env.PATH ?? '').split(delimiter).some((dir) => exts.some((ext) => existsSync(join(dir, CLI.file + ext)))); };",
    'const isTo = () => onDisk() === TO;',
    "const isOther = () => { const version = onDisk(); return version !== '' && version !== FROM; };",
    `say(\`开始 \${FROM} -> \${TO}（不卸任何一行）\`);`,
    "writeMarker('running', FROM);",
    `if (!canRun()) { say(${JSON.stringify(missing)}); writeMarker('failed', FROM); process.exit(1); }`,
    "if (install(TO) && (TO === 'latest' ? isOther() : isTo())) {",
    '  say(`换好了：${onDisk()} 在盘上（目标 ${TO}），' + restart + ' 才用得上`);',
    "  writeMarker('ok', onDisk());",
    '  process.exit(0);',
    '}',
    'say(`换版没成（盘上 ${onDisk()}）—— 把 ${FROM} 装回去`);',
    "if (install(FROM) && onDisk() === FROM) {",
    '  say(`已回滚：${FROM} 还在盘上，工作台这一行没被动过`);',
    "  writeMarker('rolled-back', FROM);",
    '  process.exit(0);',
    '}',
    `say(${JSON.stringify(`回滚也没成。救法：${rescue}（或 ${last}）`)});`,
    "writeMarker('failed', onDisk());",
    'process.exit(1);',
    '',
  ].join('\n');
}

export function planSelfUpdate(
  request: SelfUpdateRequest,
  now = new Date(),
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
  platform: NodeJS.Platform = process.platform,
): SelfUpdatePlan {
  const paths = selfUpdatePaths(request.dshHome, platform);
  const windows = platform === 'win32';
  return {
    paths,
    script: windows ? selfUpdateNodeScript(request, paths, cli) : selfUpdateScript(request, paths, cli),
    marker: selfUpdateMarker(request, 'running', request.from, now.toISOString()),
    command: windows
      ? {
          file: process.execPath,
          args: [paths.script],
          env: hostSurface().runtime === 'electron' ? { ELECTRON_RUN_AS_NODE: '1' } : {},
          log: paths.log,
        }
      : { file: 'bash', args: [paths.script], env: {}, log: paths.log },
  };
}

export function startSelfUpdate(
  request: SelfUpdateRequest,
  onError: (message: string) => void,
  spawnImpl?: typeof spawn,
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
): SelfUpdateStart {
  const plan = planSelfUpdate(request, new Date(), cli);
  mkdirSync(plan.paths.dir, { recursive: true });
  writeFileAtomic.sync(plan.paths.script, plan.script, { mode: 0o755 });
  chmodSync(plan.paths.script, 0o755);
  writeFileAtomic.sync(plan.paths.marker, `${JSON.stringify(plan.marker)}\n`);
  runDetached(plan.command, onError, spawnImpl);
  const forward = recoveryCommand({
    profile: request.profile,
    pkg: request.pkg,
    version: request.to === '' ? 'latest' : request.to,
    cli,
  });
  return { started: true, paths: plan.paths, forward };
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readTail(file: string): string | undefined {
  try {
    const info = statSync(file);
    if (!info.isFile() || info.size === 0) return undefined;
    const start = Math.max(0, info.size - 4096);
    const length = info.size - start;
    const buffer = Buffer.alloc(length);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, buffer, 0, length, start);
    } finally {
      closeSync(fd);
    }
    const lines = buffer
      .toString('utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (lines.length === 0) return undefined;
    return lines.slice(-4).join(' / ').slice(0, 800);
  } catch {
    return undefined;
  }
}
export function readSelfUpdateView(home: string, profile?: string): WorkbenchSelfUpdate | undefined {
  const paths = selfUpdatePaths(home);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.marker, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Readonly<Record<string, unknown>>;
  const state = asText(record.state);
  if (state === undefined || !(SELF_UPDATE_STATES as readonly string[]).includes(state)) return undefined;
  const owner = asText(record.profile);
  if (profile !== undefined && owner !== undefined && owner !== profile) return undefined;
  const from = asText(record.from);
  const to = asText(record.to);
  const version = asText(record.version);
  const at = asText(record.at);
  const tail = readTail(paths.log);
  return {
    state: state as SelfUpdateState,
    ...(owner === undefined ? {} : { profile: owner }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(version === undefined ? {} : { version }),
    ...(at === undefined ? {} : { at }),
    ...(tail === undefined ? {} : { tail }),
  };
}
export { runningVersionOf } from '@dsh-workbench/shared/host';
