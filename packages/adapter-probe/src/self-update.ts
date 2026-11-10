import { now as clockNow, writeJsonFile, writeTextFile } from '@dsh-workbench/shared/host';
import type { Seam } from '@dsh-workbench/shared/host';
import { hostSurface } from './platform.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runDetached } from './runtime-seed.js';
import {
  type HostLaunch,
  type SelfUpdateCli,
  cliCommand,
  desktopHostLaunch,
  isPathDsh,
  quoted,
  selfUpdateCliFor,
} from './self-update-cli.js';
import {
  SELF_UPDATE_PACKAGES,
  attemptsOf,
  selfUpdatePrefetch,
  type SelfUpdatePrefetch,
  recoveryCommand,
  retryMsOf,
  selfUpdateMarker,
  selfUpdatePaths,
  selfUpdateTiming,
  type SelfUpdatePaths,
  type SelfUpdatePlan,
  type SelfUpdateRequest,
  type SelfUpdateStart,
} from './self-update-plan.js';
import { readFileSync } from 'node:fs';
import { SELF_UPDATE_RUNNING_TTL_MS } from '@dsh-workbench/shared/contract/protocol/bundle-install';
export * from './self-update-cli.js';
export * from './self-update-node-script.js';
import { selfUpdateNodeScript } from './self-update-node-script.js';
export * from './self-update-plan.js';
export * from './self-update-view.js';

export { SELF_UPDATE_RUNNING_TTL_MS } from '@dsh-workbench/shared/contract/protocol/bundle-install';

export function selfUpdateBusy(marker: string, at: Date = new Date(clockNow())): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(marker, 'utf8'));
  } catch {
    return false;
  }
  if (typeof raw !== 'object' || raw === null) return false;
  const record = raw as Readonly<Record<string, unknown>>;
  if (record.state !== 'running') return false;
  const started = typeof record.at === 'string' ? Date.parse(record.at) : Number.NaN;
  if (!Number.isFinite(started)) return true;
  return at.getTime() - started < SELF_UPDATE_RUNNING_TTL_MS;
}


export function selfUpdateScript(
  request: SelfUpdateRequest,
  paths: SelfUpdatePaths,
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
  host: HostLaunch | undefined = desktopHostLaunch(),
  prefetch: SelfUpdatePrefetch | undefined = undefined,
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
  const restart = isPathDsh(cli) ? '重启一次 dsh' : '退出并重开 Desktop';
  const command = isPathDsh(cli) ? 'dsh' : cliCommand(cli);
  const launch = host;
  const waitForHost = launch !== undefined;
  const relaunch = waitForHost && request.relaunch !== false;
  const launchArgs = launch === undefined ? '' : [launch.file, ...launch.args].map(quoted).join(' ');
  const prefetchOn = prefetch !== undefined;
  const prefetchCmd = prefetch === undefined ? '' : cliCommand(prefetch);
  const { waitMs, holdMs, pollMs, hostPid } = selfUpdateTiming(request);
  const install = `install() {
  local out status
  out=$(${command} plugin --profile "$PROFILE" add "$PKG@$1" 2>&1)
  status=$?
  LAST_OUT="$out"
  printf '%s\\n' "$out" >>"$LOG"
  return "$status"
}`;
  const guard = isPathDsh(cli)
    ? 'if ! command -v dsh >/dev/null 2>&1; then'
    : `if ! command -v ${quoted(cli.file)} >/dev/null 2>&1; then`;
  const missing = isPathDsh(cli)
    ? `say "PATH 上没有 dsh —— 这一跳没跑。救法：${rescue}"`
    : `say ${quoted(`找不到 Desktop 的 dsh（${cli.file}）—— 这一跳没跑。救法：${rescue}`)}`;
  const packages = SELF_UPDATE_PACKAGES.map((name) => `'${name}'`).join(' ');
  return `#!/usr/bin/env bash
set -uo pipefail
DSH_HOME=${quoted(request.dshHome)}
export DSH_HOME
PKG=${quoted(request.pkg)}
PROFILE=${quoted(request.profile)}
FROM=${quoted(request.from)}
TO=${quoted(target)}
WANT=${quoted(target)}
MARKER=${quoted(paths.marker)}
LOG=${quoted(paths.log)}
BACKUP=${quoted(join(paths.backup, request.from === '' ? 'from' : request.from))}
ATTEMPTS=${String(attemptsOf(request))}
RETRY_S=${String(Math.round(retryMsOf(request) / 1000))}
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
MODULES="$PROFILE_DIR/node_modules"
MANIFEST="$BACKUP/packages.txt"
LAST_OUT=''
PACKAGES=(${packages})
LOCK=${quoted(paths.hostLock)}
HOST_PID=${String(hostPid)}
WAIT_MS=${String(waitMs)}
HOLD_MS=${String(holdMs)}
POLL_MS=${String(pollMs)}
POLL_S=${(pollMs / 1000).toFixed(3)}
WAIT_FOR_HOST=${waitForHost ? '1' : '0'}
RELAUNCH=${relaunch ? '1' : '0'}
PREFETCH=${prefetchOn ? '1' : '0'}
PREFETCH_CMD=${quoted(prefetchCmd)}
LAUNCH=(${launchArgs})
say() { printf '%s %s\\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
version_of() {
  node -e 'const p=process.argv[1];try{const m=require(p);process.stdout.write(typeof m.version==="string"?m.version:"")}catch(e){}' \\
    "$MODULES/$1/package.json" 2>/dev/null
}
on_disk() { version_of "$PKG"; }
write_marker() {
  printf '{"pkg":"%s","profile":"%s","from":"%s","to":"%s","state":"%s","version":"%s","reason":"%s","at":"%s"}\\n' \\
    "$PKG" "$PROFILE" "$FROM" "$TO" "$1" "$2" "$3" "$(date -u '+%FT%TZ')" >"$MARKER"
}
host_alive() {
  [ -f "$LOCK" ] && return 0
  if [ "$HOST_PID" -gt 0 ]; then
    kill -0 "$HOST_PID" 2>/dev/null && return 0
  fi
  return 1
}
occupied() {
  case "$LAST_OUT" in
    *EPERM*|*EBUSY*|*"operation not permitted"*) return 0 ;;
  esac
  return 1
}
backup() {
  mkdir -p "$BACKUP" || return 1
  : >"$MANIFEST"
  local p
  for p in "\${PACKAGES[@]}"; do
    [ -f "$MODULES/$p/package.json" ] || continue
    mkdir -p "$BACKUP/$(dirname "$p")" || return 1
    rm -rf "$BACKUP/$p"
    cp -R "$MODULES/$p" "$BACKUP/$p" || return 1
    printf '%s\\n' "$p" >>"$MANIFEST"
  done
  return 0
}
restore() {
  [ -f "$MANIFEST" ] || return 1
  local p
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    [ -d "$BACKUP/$p" ] || return 1
    rm -rf "$MODULES/$p"
    mkdir -p "$MODULES/$(dirname "$p")" || return 1
    cp -R "$BACKUP/$p" "$MODULES/$p" || return 1
  done <"$MANIFEST"
  return 0
}
verify() {
  local want="$1" p v
  [ -n "$(on_disk)" ] || return 1
  if [ -f "$MANIFEST" ]; then
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      v="$(version_of "$p")"
      [ -n "$v" ] || return 1
      if [ "$want" = "latest" ]; then
        [ "$v" != "$FROM" ] || return 1
      else
        [ "$v" = "$want" ] || return 1
      fi
    done <"$MANIFEST"
  fi
  for p in client.js dist/client/index.js dist/host/index.js; do
    [ -f "$MODULES/$PKG/$p" ] || return 1
  done
  return 0
}
${install}
${guard}
  ${missing}
  write_marker failed "$FROM" occupied
  exit 1
fi
say "开始 \${FROM} -> \${TO}（不卸任何一行，先备份）"
write_marker running "$FROM" ""
if [ "$PREFETCH" = "1" ]; then
  say "先把包下到 store（还不碰 node_modules）"
  if sh -c "$PREFETCH_CMD" >>"$LOG" 2>&1; then
    say "预取好了 —— 退出后的那一跳就是本地活了"
  else
    say "预取没成（不影响换包，只是退出后那一跳会慢一点）"
  fi
fi
if [ "$WAIT_FOR_HOST" = "1" ]; then
  write_marker queued "$FROM" ""
  ELAPSED=0
  while host_alive; do
    if [ "$ELAPSED" -ge "$WAIT_MS" ]; then
      say "宿主还没退（等了 \${ELAPSED}ms）—— 这次一个字都不动，留着排队"
      exit 0
    fi
    sleep "$POLL_S"
    ELAPSED=$((ELAPSED + POLL_MS))
  done
  QUIET=0
  while [ "$QUIET" -lt "$HOLD_MS" ]; do
    sleep "$POLL_S"
    if host_alive; then
      say "宿主又回来了 —— 不换，留着排队"
      exit 0
    fi
    QUIET=$((QUIET + POLL_MS))
  done
  say "宿主已经退了（安静了 \${QUIET}ms）—— 开始换"
  write_marker running "$FROM" ""
fi
backup || say "备份没做全 —— 失败时可能回不去"
attempt=0
ok=0
while [ "$attempt" -lt "$ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  if install "$TO" && verify "$WANT"; then
    ok=1
    break
  fi
  if occupied; then say "第 \${attempt} 次撞上目录被占用（Windows 上通常是 Desktop 还开着）"; fi
  say "第 \${attempt} 次没成（盘上 $(on_disk)）"
  [ "$attempt" -lt "$ATTEMPTS" ] && sleep "$RETRY_S"
done
if [ "$ok" = "1" ]; then
  say "换好了：$(on_disk) 在盘上（目标 \${TO}），${restart} 才用得上"
  write_marker ok "$(on_disk)" ""
  if [ "$RELAUNCH" = "1" ] && [ "\${#LAUNCH[@]}" -gt 0 ]; then
    say "把 Desktop 拉回来"
    nohup "\${LAUNCH[@]}" >/dev/null 2>&1 &
  fi
  exit 0
fi
REASON=incomplete
if occupied || [ -z "$(on_disk)" ]; then REASON=occupied; fi
say "换版没成（盘上 $(on_disk)）—— 用本地备份把 \${FROM} 放回去"
if restore && verify "$FROM"; then
  say "已还原：\${FROM} 还在盘上（走的是本地备份，没联网），工作台这一行没被动过"
  write_marker restored "$FROM" "$REASON"
  exit 0
fi
say "本地还原也没成 —— 退回联网把 \${FROM} 装回去"
if install "$FROM" && verify "$FROM"; then
  say "已回滚：\${FROM} 还在盘上，工作台这一行没被动过"
  write_marker rolled-back "$FROM" "$REASON"
  exit 0
fi
say "回滚也没成。救法：${rescue}（或 ${lastsOne}）"
write_marker failed "$(on_disk)" rollback-failed
exit 1
`;
}


export function planSelfUpdate(
  request: SelfUpdateRequest,
  now: Date = new Date(clockNow()),
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
  platform: NodeJS.Platform = process.platform,
): SelfUpdatePlan {
  const paths = selfUpdatePaths(request.dshHome, platform);
  const windows = platform === 'win32';
  return {
    paths,
    script: windows
      ? selfUpdateNodeScript(request, paths, cli, platform, desktopHostLaunch(), selfUpdatePrefetch(request, cli))
      : selfUpdateScript(request, paths, cli, desktopHostLaunch(), selfUpdatePrefetch(request, cli)),
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
  seam?: Seam | undefined,
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
): SelfUpdateStart {
  const plan = planSelfUpdate(request, new Date(clockNow()), cli);
  const forward = recoveryCommand({
    profile: request.profile,
    pkg: request.pkg,
    version: request.to === '' ? 'latest' : request.to,
    cli,
  });
  if (selfUpdateBusy(plan.paths.marker)) {
    onError('已经有一次工作台更新在跑 —— 等它落定再试（self-update.json 会说它到哪一步了）。');
    return { started: false, paths: plan.paths, forward };
  }
  mkdirSync(plan.paths.dir, { recursive: true });
  writeTextFile(plan.paths.script, plan.script, { mode: 0o755 });
  writeJsonFile(plan.paths.marker, plan.marker);
  runDetached(plan.command, onError, seam);
  return { started: true, paths: plan.paths, forward };
}


export { runningVersionOf } from '@dsh-workbench/shared/host';
