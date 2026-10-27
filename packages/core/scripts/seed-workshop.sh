#!/usr/bin/env bash
#
# DIY 工坊：骨架 + 稳定入口（`dsh-wb-module`）。
#
# 由两处共用，所以逻辑只有**一份**：
#   · `seed-profile.sh`（= `dsh-workbench setup`）—— 第一次把工坊建起来、装依赖；
#   · `bin/dsh-workbench`（每次启动）—— 入口每次重写一遍（幂等），骨架不在才自愈。
#
# 为什么启动器要自愈而不是只提醒：干净机器上 agent 进工坊第一件事就是 build / check，
# 而"不在 workspace 里"报出来的话指着别处（实测卡在这一步，它读到的像是"模板写错了"）。
# 提醒是对人的；agent 读不到那句提醒。
#
# 用法:
#   bash scripts/seed-workshop.sh            # 完整：骨架（缺才建）+ overrides + 依赖（缺才装）+ 入口
#   bash scripts/seed-workshop.sh entry      # 只写入口（每次启动用）；顺手比一次代际，不一致就后台 sync
#   bash scripts/seed-workshop.sh sync       # 自愈：把工坊那三个包对齐到**当前外壳**那一代（后台跑）
#
# 幂等：存在的文件不覆盖、依赖在就跳过安装、重复跑不产生副作用。

set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
WORKBENCH_HOME="${DSH_WORKBENCH_HOME:-$DSH_HOME/workbench}"
export DSH_WORKBENCH_HOME="$WORKBENCH_HOME"
SELF="${BASH_SOURCE[0]}"
while [ -L "$SELF" ]; do
  SELF="$(cd "$(dirname "$SELF")" && pwd -P)/$(readlink "$SELF")"
done
REPO_DIR="$(cd "$(dirname "$SELF")/.." && pwd -P)"
GIT_TOP="$(git -C "$REPO_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
MODE="${1:-skeleton}"

# ── 这份副本到底是"仓库副本"还是"装出来的副本" ──────────────────────────────
#
# `git rev-parse --show-toplevel` 只是"往上第一个 .git"——**装出来的副本也可能落在别人的
# 仓库下面**。实测：`DSH_HOME` 恰好在某个 git 仓库里时（开发机上就是本仓），
# `<profile>/node_modules/@dsh-workbench/core` 一路往上找到了那个仓库，于是这份副本被当成
# 仓库副本，去 link 一个不存在的 `../module-tools`，脚本当场死在 `cd` 上 —— 而它是**后台**
# 被拉起来的（宿主自举 / 启动器），症状就是"工坊怎么都没建起来，一声不响"。
#
# 所以认仓库要认**本仓的形状**：根上同时有 packages/core 与 packages/module-tools。
if [ -n "$GIT_TOP" ] && [ -f "$GIT_TOP/packages/core/package.json" ] &&
  [ -f "$GIT_TOP/packages/module-tools/package.json" ]; then
  IN_REPO=1
else
  IN_REPO=0
fi

# ── 工坊与「现在跑着的外壳」是不是同一代 ─────────────────────────────────────
#
# 不变量：工坊里那三个 @dsh-workbench/* 必须与**当前运行的外壳**同代。不同代时工具链会
# 静默地给出旧答案 —— 判据、模板、报错话术都属于它那一代，而 agent 读到的像是"你写的
# 声明错了"（实测：0.1.13 与 0.1.14 两台工具并存，全程一声不响）。
#
# **基准是显式输入**：`DSH_WB_SHELL_ROOT` = 正在跑的那份外壳的包根。谁在跑只有调用者知道 ——
# 宿主自举给它自己的包根、启动器给 profile 里那份 `node_modules/@dsh-workbench/core`。
# **跑脚本这份副本不算数**，这条是实测踩出来的（同一天两次）：启动器那份 0.3.0、profile 里
# 真正加载的是 0.3.1、工坊已经跟到 0.3.1 —— 启动器先跑 entry（它在 `exec dsh` 之前），拿自己
# 那份当基准，于是把工坊**降级**到 0.3.0；宿主随后再跑 entry，看到工坊"与它同代" → no-op，
# 整场会话都停在错的一代。
#
# 三条纪律：
#   · 判据只认**实装版本**（工坊 node_modules 里的 package.json）；`.sync.json` 只用于退避
#     与说人话，绝不拿它当"装好了"的证据；
#   · 启动路径（entry）只做一次**便宜比对**，不一致就后台自愈，不许把启动拖住 ——
#     宿主每次启动都会跑 entry（runtime-seed 的 entry plan），所以这里挂一下是零新增调用点；
#   · 复核过才写 ok —— 不信 pnpm 的退出码（同 self-update 的 on_disk 复核、ensure-selected 的复核）。
#
# **没有基准就什么都不做**：不读工坊实装版本、不起 sync、不写 `.sync.json`、不动工坊一个字节。
# 这正是 `setup`（seed-profile.sh）那趟的情形 —— 那时 profile 里那份还没装/还是旧的，
# 代际对齐归"启动时"。**基准从不取"跑脚本那份副本"**，否则谁后跑谁说了算。
#
# 冻结接口：状态文件 $DSH_HOME/workbench/diy/.sync.json =
#   { state: "ok"|"syncing"|"failed", version: <基准版本>, at: <ISO>, reason?: <一句话> }
SHELL_ROOT="${DSH_WB_SHELL_ROOT:-}"
DIY_DIR="$WORKBENCH_HOME/diy"
SEED_LOG="$WORKBENCH_HOME/seed.log"
SYNC_STATE="$DIY_DIR/.sync.json"
SYNC_LOCK="$DIY_DIR/.sync.lock"
SYNC_BACKOFF_SECONDS=3600
SYNC_LOCK_STALE_MINUTES=15
# 撞锁（目标是另一代）时等一轮的秒数。可覆盖：只有探针会调小它——串行那版靠这个 sleep 排队，
# 18 格跑 54 秒。生产默认为 5，行为不变。
SYNC_LOCK_WAIT_SECONDS="${SYNC_LOCK_WAIT_SECONDS:-5}"

# 基准版本：只有**显式给了基准**、且它有可读的 package.json 时才有值。空 = 这一轮不做比对。
shell_version() {
  [ -n "$SHELL_ROOT" ] || return 0
  [ -f "$SHELL_ROOT/package.json" ] || return 0
  node -p "require('$SHELL_ROOT/package.json').version" 2>/dev/null || true
}

# 跑脚本这份副本自己的版本：**只给骨架用**（setup 那趟没有基准，而它要写下的正是"这份副本
# 这一代" —— profile 就是照它装的）。比对**永远不用**它：它可能比 profile 里那份旧（见上面那段）。
copy_version() {
  node -p "require('$REPO_DIR/package.json').version" 2>/dev/null || true
}

# 要装的**目标版本**：有基准用基准；没基准（setup 建骨架）用这份副本。
target_version() {
  local version
  version="$(shell_version)"
  [ -n "$version" ] || version="$(copy_version)"
  printf '%s\n' "$version"
}

# 外壳 manifest 里钉的那份 dsh UI 版本（模块模板默认带的那个 devDependency，见
# `内部设计记录` §3.1）。源优先**基准**（正在跑的那份外壳），
# 没有才退回跑脚本这份副本 —— 与 link_workshop_skills 同一条口径。
# 读不到就留空：调用方按"不写这一项"处理（模块 `init` 那边有自己的兜底常量与一句人话）。
shell_primitives_version() {
  local root="$SHELL_ROOT"
  [ -n "$root" ] && [ -f "$root/package.json" ] || root="$REPO_DIR"
  [ -f "$root/package.json" ] || return 0
  node -e '
const fs = require("node:fs");
try {
  const pinned = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    .devDependencies?.["@deepseek-ai/dsh-client-ui-primitives"];
  process.stdout.write(typeof pinned === "string" ? pinned : "");
} catch {}
' "$root/package.json" 2>/dev/null || true
}

# 三个包的装法**只有一处真相**：仓库副本 link 进本仓，安装副本按目标版本装。
# skeleton 与 sync 都调它 —— 两份规则漂开的症状是"根清单是 link、overrides 是 ^"，
# 于是同一个工坊里两代并存（正是要防的那件事），而且不报错。
#
# 这一套值**同时**写进两个地方（devDependencies 与 pnpm.overrides），所以它必须是两边都常规的形状：
#   · 安装态 = 纯范围 `^<版本>`。**别写成 npm 的具名 spec `@包名@^版本`**：那形状放进 overrides 要再
#     过一遍 pnpm 的 spec 解析，同一形状还可能被当 alias 处理，而 `"@scope/pkg": "^1.2.3"` 才是
#     overrides 的常规写法 —— 这是每次安装都走的 happy path（Lead 的独立探针抓到的就是这一处）。
#   · 仓库态 = `link:<路径>`：link 本仓那份，改工具链源码工坊当场生效。
compute_specs() {
  if [ "$IN_REPO" = "1" ]; then
    CORE_SPEC="link:$REPO_DIR"
    TOOLS_SPEC="link:$(cd "$REPO_DIR/../module-tools" && pwd)"
    SHARED_SPEC="link:$(cd "$REPO_DIR/../shared" && pwd)"
  else
    local version="${1:-}"
    [ -n "$version" ] || version="$(target_version)"
    [ -n "$version" ] || version=0
    CORE_SPEC="^$version"
    TOOLS_SPEC="^$version"
    SHARED_SPEC="^$version"
  fi
  # dsh 原语（模块模板默认带的那个）：**精确版**，与模块自己那份 devDependency 对齐 ——
  # 类型面要对齐对账过的那一版（`内部设计记录` §3.1）。
  # 空 = 读不到外壳 manifest，就**不写这一项**（模块 `init` 有自己的兜底常量）。
  local primitives_version
  primitives_version="$(shell_primitives_version)"
  PRIMITIVES_SPEC=""
  if [ -n "$primitives_version" ]; then
    PRIMITIVES_SPEC="$primitives_version"
  fi
}

# 日志**只有一处**去处：$DSH_HOME/workbench/seed.log（冻结接口）。
# 后台那条路的 stdout/stderr 已被入口重定向进同一个文件，所以这里只在**终端**上补一份回显
# （`[ -t 1 ]` 为假 = 有人正把输出收进文件，那就别再写第二遍）。
#
# ⚠️ 变量后面紧挨着中文时一律写 `${VAR}`：这台机器的 bash 是 3.2（macOS 自带那份），
# 它会把多字节字符的**头一个字节**吃进变量名 —— 实测 `$shared_v；` 报 `shared_v?: unbound
# variable`（`set -u` 下当场死），而同一份脚本在 bash 5 上没事。下面每条话术都照这个写。
log_line() {
  mkdir -p "$(dirname "$SEED_LOG")" 2>/dev/null || true
  printf '%s\n' "$*" >>"$SEED_LOG" 2>/dev/null || true
  if [ -t 1 ]; then printf '%s\n' "$*"; fi
}

# ── 工坊**自己带着** DIY 的指引：这条软链只有一份写口 ──────────────────────────
#
# 指引住进工坊的理由：DIY 会话的 cwd 就是工坊，而 dsh 的 skill-filesystem 是从 **cwd 下的
# `.agents/skills/`** 发现技能的（本仓自己那条 `module-design` 就是这么被看见的）—— 于是
# 进工坊的会话天然看得见它，**不用去改用户任何默认设置**（改默认 preset 会连带把用户后面
# 新建的普通会话也变成 DIY 模式）。
#
# ⚠️ 写口只有这一处，而且故意放在**本脚本**里：启动器（`bin/dsh-workbench`）与宿主自举
# （`src/shared/api/host/runtime-seed.ts`）都会跑它，于是"挂指引"只有一份实现。曾经是两处
# 各写一遍（启动器一段 bash + TS 的 `linkSkills`），写的是同一个路径、目标也一致 —— 那是
# **同一件事两个实现**：哪天只有一边改了源或判据，就会每次启动互相改指，症状是"会话里那份
# 指引时新时旧"，还是**不报错**（软链指到哪 skill 发现都不吭声）。
#
# 源优先**基准**（正在跑的那份外壳，由调用者显式给）那份，没有才退回跑脚本这份副本；
# 两者都没有（包还没做完）就**不挂** —— 挂出来是条死链，而 skill 发现对死链不报错。
# 幂等：`readlink` 已经等于源就**一个字节不写**（entry 每次启动都会跑到这里）。
# 这条与代际无关：**不要**把它挂在"有基准"的判断上 —— 挂指引不是代际决策。
link_workshop_skills() {
  local src="$REPO_DIR/skills/workbench-module-diy"
  if [ -n "$SHELL_ROOT" ] && [ -d "$SHELL_ROOT/skills/workbench-module-diy" ]; then
    src="$SHELL_ROOT/skills/workbench-module-diy"
  fi
  [ -d "$src" ] || return 0

  local link="$DIY_DIR/.agents/skills/workbench-module-diy"
  if [ "$(readlink "$link" 2>/dev/null || true)" = "$src" ]; then return 0; fi
  # 那儿要是别人的**真目录**（不是我们建的软链）就不碰它：`ln -s` 会往它里面再套一层。
  if [ -e "$link" ] && [ ! -L "$link" ]; then
    echo "→ ⚠️ $link 已存在且不是软链 —— 不动它（手工处理，或先把它挪走）；这条不影响启动。" >&2
    return 0
  fi

  # 先 rm -f：旧软链还在时 `ln -s` 会顺着它把新链**套进去**（symlink 指向 symlink）。
  mkdir -p "$(dirname "$link")" 2>/dev/null || true
  rm -f "$link" 2>/dev/null || true
  if ln -s "$src" "$link" 2>/dev/null; then
    echo "→ 工坊指引已链上：$link → $src"
  else
    # 挂不上只留一句话，不当场炸：这条是"锦上添花"，不该把启动带崩（自举同理）。
    echo "→ ⚠️ DIY 指引没挂上（${link}）—— 手工从 ${src} 建一条软链即可；这条不影响启动。" >&2
  fi
}

# 一次 node 调用把四份 package.json 的版本读出来（基准 / core / module-tools / shared，一行一份）。
# 为什么合成一次：entry 在启动路径上，不该为比一次版本起四次进程。读不到的给空行 —— 空 =
# "工坊还没装好 / 这个包不在"，是**一个**信号，调用方按"什么都不做"处理。
# 第一行读的是**基准**（$SHELL_ROOT），不是跑脚本这份副本 —— 见上面那段漂移实测。
read_generations() {
  node -e '
const fs = require("node:fs");
const path = require("node:path");
const versionOf = (file) => {
  try { return String(JSON.parse(fs.readFileSync(file, "utf8")).version || ""); } catch { return ""; }
};
const [shellRoot, diy] = process.argv.slice(1);
const installed = (name) => versionOf(path.join(diy, "node_modules", "@dsh-workbench", name, "package.json"));
// 空基准要显式挡住：`path.join("", "package.json")` 会去读**当前目录**那份，那是巧合不是判据。
const shell = shellRoot === "" ? "" : versionOf(path.join(shellRoot, "package.json"));
process.stdout.write([shell, installed("core"), installed("module-tools"), installed("shared")].join("\n") + "\n");
' "$SHELL_ROOT" "$DIY_DIR" 2>/dev/null || true
}

# 退避：上一轮在**同一代**上失败过、且还在窗口内 → 不重试。
#
# 为什么必须退避：entry 每次启动都跑，不自愈的话一个装不动的工坊会在每次启动时后台起一轮
# pnpm（几十秒 + 网络），用户只觉得"启动变慢了"，日志里也看不出是谁。窗口按**版本**算：
# 外壳换了一代就是新问题，哪怕上一代失败过也要重试。
sync_backoff_active() {
  local version="$1"
  [ -f "$SYNC_STATE" ] || return 1
  node -e '
const fs = require("node:fs");
try {
  const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (state.state !== "failed" || state.version !== process.argv[2]) process.exit(1);
  const at = Date.parse(state.at);
  process.exit(Number.isFinite(at) && Date.now() - at < Number(process.argv[3]) * 1000 ? 0 : 1);
} catch { process.exit(1); }
' "$SYNC_STATE" "$version" "$SYNC_BACKOFF_SECONDS"
}

# 状态文件的写口只有这一个：手拼 JSON 会在 reason 带引号/换行时写出读不回来的文件。
write_sync_state() {
  node -e '
const fs = require("node:fs");
const [file, state, version, reason] = process.argv.slice(1);
const body = { state, version, at: new Date().toISOString() };
if (reason) body.reason = reason;
fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
' "$SYNC_STATE" "$1" "$2" "${3:-}"
}

# 原子锁：`mkdir` 是唯一"失败=已被占"的原子原语（`test -e` + 写文件那条路有 TOCTOU）。
# 两个实例共享同一个 DSH_HOME 时会撞（用户开两份工作台、或启动器与宿主自举同时跑）。
# 过期判据必须有：持锁者被 kill -9 时不会有人来解锁，没有它工坊会被**永久**锁死。
#
# 锁目录里落三样东西：
#   · `target` —— 这一轮要装到**哪一代**。锁的真相是"目标"，不是"有人在跑"：同一个 DSH_HOME
#     下两个 profile 版本不同时（dsh web 与独立实例并存）会撞，那时"后到的那一代"不能永远
#     没发言权 —— 目标不同就等一轮再抢（见 acquire_sync_lock）。
#   · `owner` —— 谁持的锁。过期判据一旦误判、别人清了锁重抢，原持锁者的 EXIT trap 醒来时
#     **不能**去 `rm -rf` 别人的锁（那会把新持锁者的 install 砍在半路）。
#   · `heartbeat` —— "我还在跑"的进度信号（见 sync_lock_stale）。
lock_field() {
  [ -f "$SYNC_LOCK/$1" ] || return 0
  head -n 1 "$SYNC_LOCK/$1" 2>/dev/null || true
}

# 过期判据按**进度**判活，**不看锁目录的 mtime**：一次 `pnpm install` 跑十几二十分钟是常事，
# 只看目录 mtime 会把它判成"持锁者已崩" → 别人清锁重抢 → 两个 install 并发（且原持锁者的
# trap 还会删掉新锁）。持锁者每 30 秒碰一下 `heartbeat`，判据读的是它；没有 heartbeat
# （老锁 / 刚建好还没来得及碰）才退回锁目录 mtime。
sync_lock_stale() {
  local stamp="$SYNC_LOCK"
  [ -f "$SYNC_LOCK/heartbeat" ] && stamp="$SYNC_LOCK/heartbeat"
  [ -n "$(find "$stamp" -maxdepth 0 -mmin +"$SYNC_LOCK_STALE_MINUTES" 2>/dev/null)" ]
}

# 强行清锁：只给"判定持锁者已崩"那条路用（那时锁已经不是原主的了）。
drop_sync_lock() {
  if [ "${SYNC_LOCK:-}" = "$WORKBENCH_HOME/diy/.sync.lock" ]; then rm -rf "$SYNC_LOCK"; fi
}

# 抢锁的返回值：0 = 抢到；1 = 同一代的人正装着（跳过）；2 = 这地方建不出锁；3 = 另一代正装着、等过一轮没抢到。
acquire_sync_lock() {
  local target="$1" attempt=0 waited=0 held=""
  while [ "$attempt" -lt 2 ]; do
    if mkdir "$SYNC_LOCK" 2>/dev/null; then
      SYNC_LOCK_TOKEN="$$-$(date +%s)-${RANDOM:-0}"
      printf '%s\n' "$target" >"$SYNC_LOCK/target" 2>/dev/null || true
      printf '%s\n' "$SYNC_LOCK_TOKEN" >"$SYNC_LOCK/owner" 2>/dev/null || true
      touch "$SYNC_LOCK/heartbeat" 2>/dev/null || true
      return 0
    fi
    # mkdir 失败**且锁不在** = 这个目录建不出东西（权限 / 只读），不是"别人正持锁" ——
    # 这两种要分开：说成"另一轮正在跑"会让日志把权限问题指成并发问题。
    if [ ! -d "$SYNC_LOCK" ]; then return 2; fi
    if sync_lock_stale; then
      log_line "→ 自愈锁超过 ${SYNC_LOCK_STALE_MINUTES} 分钟没有进度（心跳也没动过），当持锁者已崩，清掉重抢"
      drop_sync_lock
      attempt=$((attempt + 1))
      continue
    fi
    held="$(lock_field target)"
    # 目标是同一代：谁装都一样，让他装完就行，不必排队。
    if [ "$held" = "$target" ]; then return 1; fi
    # 目标是**另一代**：等一小会再抢一次（只等一轮），别让后到的那一代永远排不上。
    if [ "$waited" -eq 0 ]; then
      log_line "→ 自愈锁正在装 ${held:-未知} 那一代，我方目标是 ${target} —— 等 ${SYNC_LOCK_WAIT_SECONDS} 秒再抢一次"
      sleep "$SYNC_LOCK_WAIT_SECONDS"
      waited=1
      continue
    fi
    return 3
  done
  return 1
}

# 持锁期间的"我还在跑"：每 30 秒碰一下 heartbeat。锁没了、或者已经不是自己的锁了
# （被判过期、别人清了重抢）就自己退出 —— 别给**别人的**锁碰心跳，也别留孤儿进程。
start_sync_heartbeat() {
  (
    while [ -d "$SYNC_LOCK" ] && [ "$(lock_field owner)" = "$SYNC_LOCK_TOKEN" ]; do
      touch "$SYNC_LOCK/heartbeat" 2>/dev/null || exit 0
      sleep 30
    done
  ) &
  SYNC_HEARTBEAT_PID=$!
}

stop_sync_heartbeat() {
  [ -n "${SYNC_HEARTBEAT_PID:-}" ] || return 0
  kill "$SYNC_HEARTBEAT_PID" 2>/dev/null || true
  SYNC_HEARTBEAT_PID=""
}

# 只删**自己的**锁：锁被清过 / 换了主人时，这里必须放手（否则新持锁者的 install 被砍在半路）。
release_sync_lock() {
  if [ "${SYNC_LOCK:-}" = "$WORKBENCH_HOME/diy/.sync.lock" ]; then
    if [ -n "${SYNC_LOCK_TOKEN:-}" ] && [ "$(lock_field owner)" = "$SYNC_LOCK_TOKEN" ]; then
      rm -rf "$SYNC_LOCK"
    fi
  fi
}

# sync：幂等、可重跑、可续。**复核过才写 ok**。
run_sync() {
  # 没有基准 = 不知道谁是"正在跑的外壳"：这一轮**一个字节都不动**，也不写 `.sync.json`。
  # （`setup` 那趟就是这种情形：那时 profile 里那份还没装/还是旧的。）
  [ -n "$SHELL_ROOT" ] || return 0
  [ -f "$SHELL_ROOT/package.json" ] || return 0
  # 工坊还没建：那是 skeleton 模式的活，sync 不抢（首次要下几百 MB，不能挂在这条路上）。
  [ -f "$DIY_DIR/package.json" ] || return 0

  local shell_v reason=""
  shell_v="$(shell_version)"
  if [ -z "$shell_v" ]; then
    log_line "→ ⚠️ 基准 ${SHELL_ROOT} 里读不到版本，这一轮自愈没跑"
    return 1
  fi

  # 仓库副本：三个包都是 link 进本仓的，改源码工坊当场就变 —— 天然同代。
  if [ "$IN_REPO" = "1" ]; then
    write_sync_state ok "$shell_v" ""
    log_line "→ 工坊是仓库副本（link:），天然同代，写 ok（${shell_v}）"
    return 0
  fi

  if sync_backoff_active "$shell_v"; then
    log_line "→ 同代的上一次自愈失败过，还在一小时退避窗口内 —— 这一轮跳过（原因在 ${SYNC_STATE}）"
    return 0
  fi

  local lock_rc=0
  acquire_sync_lock "$shell_v" || lock_rc=$?
  if [ "$lock_rc" = "2" ]; then
    reason="建不出自愈锁（${SYNC_LOCK}）—— ${DIY_DIR} 不可写？"
    log_line "→ ⚠️ 自愈失败：${reason}"
    write_sync_state failed "$shell_v" "$reason"
    return 1
  fi
  if [ "$lock_rc" = "1" ]; then
    log_line "→ 同一代（${shell_v}）的自愈正持锁（${SYNC_LOCK}）—— 这一轮跳过"
    return 0
  fi
  if [ "$lock_rc" = "3" ]; then
    log_line "→ 另一代的自愈正持锁，等过一轮仍没抢到 —— 这一轮跳过（下一轮启动再试）"
    return 0
  fi
  trap 'stop_sync_heartbeat; release_sync_lock' EXIT
  start_sync_heartbeat

  write_sync_state syncing "$shell_v" ""
  log_line "→ 自愈：把工坊对齐到基准那一代 $shell_v"

  compute_specs "$shell_v"

  # 重写工坊根清单：devDependency 与 overrides 都对齐到这一代。
  # overrides 是**关键的那一半** —— 模块自己声明的 `^0.1.x` 会让 pnpm 给每个模块另装一份
  # **源上**的包，于是同一个工坊里两代工具链并存（那场事故见下面骨架段）。
  # 两处写的是**同一套值**：`compute_specs` 给的就是"同时能当 devDependency 与 overrides 用"的形状。
  # ⚠️ 一份值只从一个地方取：曾经 devDependencies 取 `$shell_v`、overrides 取 `$CORE_SPEC`，
  # 两个变量在正常路径上恰好相等，于是"它们漂开"这种病**判据抓不到**（变异测试当场露馅）。
  # 先说一句为什么先读一遍：清单坏了（手改坏 / 写了一半）时 JSON.parse 会当场抛，
  # 那会带着 `set -e` 直接退出去、状态停在 syncing —— 用户只看到"每次启动都重试"。
  if ! node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' \
    "$DIY_DIR/package.json" >>"$SEED_LOG" 2>&1; then
    reason="工坊根清单读不了（$DIY_DIR/package.json）—— 它坏了，先把它修回一份合法 JSON"
    write_sync_state failed "$shell_v" "$reason"
    log_line "→ ⚠️ 自愈失败：${reason}"
    return 1
  fi
  node - "$DIY_DIR/package.json" "$CORE_SPEC" "$TOOLS_SPEC" "$SHARED_SPEC" "$PRIMITIVES_SPEC" <<'NODE'
const [file, core, tools, shared, primitives] = process.argv.slice(2);
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const want = {
  '@dsh-workbench/core': core,
  '@dsh-workbench/module-tools': tools,
  '@dsh-workbench/shared': shared,
};
manifest.devDependencies = { ...(manifest.devDependencies ?? {}), ...want };
// dsh 原语（模块模板默认带的那个）：只进 devDependencies，**不进 overrides** ——
// 它不是 @dsh-workbench 的包，覆盖它没有意义（那是"多个模块各装一份"的另一种病）。
if (primitives !== undefined && primitives !== '') {
  manifest.devDependencies['@deepseek-ai/dsh-client-ui-primitives'] = primitives;
}
manifest.pnpm = {
  ...(manifest.pnpm ?? {}),
  overrides: { ...(manifest.pnpm?.overrides ?? {}), ...want },
};
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

  if ! command -v pnpm >/dev/null 2>&1; then
    reason="PATH 上没有 pnpm；装好 pnpm 后重跑：cd $DIY_DIR && pnpm install"
    write_sync_state failed "$shell_v" "$reason"
    log_line "→ ⚠️ 自愈失败：$reason"
    return 1
  fi

  log_line "→ 在工坊里 pnpm install（增量，用 .npmrc 里那份 store/cache）"
  local out="" ok=1
  out="$( (cd "$DIY_DIR" && pnpm install) 2>&1 )" || ok=0
  # 原话照录：失败时"为什么"全在这几行里，不能让用户只看到一句"装不上"。
  [ -z "$out" ] || printf '%s\n' "$out" >>"$SEED_LOG" 2>/dev/null || true

  # 复核实装版本 —— 这一条才是判据，pnpm 的退出码不是。
  local v_shell v_core v_tools v_shared
  {
    read -r v_shell || true
    read -r v_core || true
    read -r v_tools || true
    read -r v_shared || true
  } < <(read_generations)

  if [ "$v_core" = "$shell_v" ] && [ "$v_tools" = "$shell_v" ] && [ "$v_shared" = "$shell_v" ]; then
    write_sync_state ok "$shell_v" ""
    log_line "→ 自愈完成：工坊与基准同代（${shell_v}）"
    return 0
  fi

  reason="install 之后复核仍不同代：core=${v_core:-读不到} tools=${v_tools:-读不到} shared=${v_shared:-读不到}（目标 ${shell_v}）"
  write_sync_state failed "$shell_v" "$reason"
  [ "$ok" = "1" ] || log_line "→ pnpm install 退出码非 0（上面是它的原话）"
  log_line "→ ⚠️ 自愈失败：$reason"
  return 1
}

# entry 的挂钩：便宜比对一次；不一致就**后台**自愈并立刻返回（启动路径不许被拖住）。
#
# 没基准（`DSH_WB_SHELL_ROOT` 没设）→ **什么都不做**：不读工坊实装版本、不起 sync、不写状态。
# 读不到版本（工坊还没装好 / 首次）→ **也不做**：那是 skeleton 模式的活，
# 把首次安装搬进 entry 就是让第一次启动卡在几百 MB 的下载上。
maybe_start_workshop_sync() {
  [ -n "$SHELL_ROOT" ] || return 0
  [ -f "$SHELL_ROOT/package.json" ] || return 0
  [ -f "$DIY_DIR/package.json" ] || return 0

  local shell_v core_v tools_v shared_v
  {
    read -r shell_v || true
    read -r core_v || true
    read -r tools_v || true
    read -r shared_v || true
  } < <(read_generations)

  [ -n "$shell_v" ] && [ -n "$core_v" ] && [ -n "$tools_v" ] && [ -n "$shared_v" ] || return 0
  if [ "$core_v" = "$shell_v" ] && [ "$tools_v" = "$shell_v" ] && [ "$shared_v" = "$shell_v" ]; then
    return 0
  fi
  if sync_backoff_active "$shell_v"; then
    return 0
  fi

  mkdir -p "$(dirname "$SEED_LOG")" 2>/dev/null || true
  log_line "→ 工坊与基准不同代（实装 core=$core_v tools=$tools_v shared=${shared_v}；基准 ${SHELL_ROOT} = ${shell_v}）—— 后台自愈"
  # 两个 fd 都重定向进 seed.log：一来日志只有一处，二来后台子进程**不拖住调用者的管道**
  # （不然 execFileSync 那类调用会一直等它，entry 看起来就像卡住了）。
  # 基准要**显式传下去**：子进程是另一个 shell，不能指望环境里那份一定还在。
  DSH_HOME="$DSH_HOME" DSH_WB_SHELL_ROOT="$SHELL_ROOT" nohup bash "$SELF" sync >>"$SEED_LOG" 2>&1 &
  return 0
}

# sync 可以手敲，也是 entry 挂钩拉起来的那条路。
if [ "$MODE" = "sync" ]; then
  run_sync || exit $?
  exit 0
fi

# ── 稳定入口：$DSH_HOME/workbench/bin/dsh-wb-module ──────────────────────────
#
# 为什么要它：指引让 agent 写 `pnpm exec dsh-wb-module …`（到处都对，但它依赖 cwd 在工坊里、
# 且那句 pnpm 前缀每次都要写对）。这里给一个**与 cwd 无关**的同名入口，启动器把它
# 挂进 PATH —— 于是"在工坊里"和"在别的目录里"都叫得动同一个工具链。
#
# 转发脚本而不是软链：同 `bin/opencli-isolated` 那条坑 —— pnpm publish 之后包里的脚本没有 x 位，
# 软链过去一执行就是 Permission denied。x 位由 chmod 当场给。
# ⚠️ 先 rm -f：旧版本留下的软链还在时，`>` 会顺着软链把真脚本覆盖掉。
ENTRY_DIR="$WORKBENCH_HOME/bin"
mkdir -p "$ENTRY_DIR"
rm -f "$ENTRY_DIR/dsh-wb-module"
cat >"$ENTRY_DIR/dsh-wb-module" <<EOF
#!/bin/sh
BIN="$WORKBENCH_HOME/diy/node_modules/.bin/dsh-wb-module"
if [ -x "\$BIN" ]; then exec "\$BIN" "\$@"; fi
if command -v pnpm >/dev/null 2>&1; then
  exec pnpm --dir "$WORKBENCH_HOME/diy" exec dsh-wb-module "\$@"
fi
echo "dsh-wb-module: 工坊的依赖还没装 —— 先跑 dsh-workbench setup" >&2
exit 127
EOF
chmod +x "$ENTRY_DIR/dsh-wb-module"

if [ "$MODE" = "entry" ]; then
  echo "→ DIY 工坊入口：$ENTRY_DIR/dsh-wb-module"
  # 挂指引**不**看基准（每次启动都跑一遍，幂等）：它是"锦上添花"，不是代际决策。
  link_workshop_skills
  maybe_start_workshop_sync
  exit 0
fi

# ── 第 6 步：建 DIY 工坊 ────────────────────────────────────────────────
#
# 工坊是 DIY 模式的落点：agent 在那里造模块（一个模块一个目录），
# 而 **DIY 会话的 cwd 就是它** —— dsh 的沙箱把"会话 cwd"当作 workspace-write 的边界，
# 所以源码写在工坊里天然放行，不需要给用户开 danger-full-access。
#
# 为什么它是一个 pnpm workspace 而不是随便一个目录：模块要构建就得有
# module-tools / core / shared / react / typescript / vitest；把它做成 workspace 根，
# 依赖只装一次，每个模块只是 packages/ 下多一个目录。而且 module-tools 的发现逻辑
# 认 `pnpm-workspace.yaml`，于是模块单独跑 check 时能找到同仓的外壳（kit / standalone 两条判据
# 才不会静默跳过 —— 跳过等于没验）。
#
# 两个身份同 bin/dsh-workbench：**仓库副本**把三个 @dsh-workbench/* 用 link 指进本仓
# （改工具链立刻生效），**安装包副本**从源上按版本装。判据与值都归上面的 `compute_specs`。
mkdir -p "$DIY_DIR/packages"
compute_specs

# 工坊必须**钉住自己那一代 pnpm**（与仓库根钉的同一个）。
#
# 不钉的话它用用户机器上那个 pnpm —— 实测这台是 11.21.0，而仓库钉的是 10.32.1，
# 而**两代的设置住址与键名都不一样**：`store-dir` 在 pnpm 10 从 `.npmrc` 读、
# 在 pnpm 11 只认 `pnpm-workspace.yaml` 里的 `storeDir`；放行依赖构建的键
# 在 pnpm 10 是 `onlyBuiltDependencies`、11 是 `allowBuilds`（11 还会往
# pnpm-workspace.yaml 里写一行 `esbuild: set this to true or false` 占位）。
# 结果是同一份工坊配置在这台机器上对、在另一台上错，而且错法都是静默或半静默的。
# 钉了之后两边一致，且这一整轮验证过的就是这一代。
PNPM_PIN=""
if [ "$IN_REPO" = "1" ] && [ -f "$GIT_TOP/package.json" ]; then
  PNPM_PIN="$(node -p "require('$GIT_TOP/package.json').packageManager || ''" 2>/dev/null || true)"
fi
PNPM_PIN="${PNPM_PIN:-pnpm@10.32.1}"

if [ -f "$DIY_DIR/package.json" ]; then
  echo "→ DIY 工坊已存在，跳过建骨架（要重来就先删掉 ${DIY_DIR}）"
else
  echo "→ 建 DIY 工坊 $DIY_DIR"
  # 原语那一行可能没有（读不到外壳 manifest 时不写）：空行在 JSON 里无害。
  # ⚠️ 这里是 `if` 不是 `[ … ] && …`：后者在 `set -e` 下，测试为假时整条语句返回 1，
  # 脚本会**当场退出**（骨架只建到一半、自愈也不起了）—— 实测被 ④ 那一格抓到。
  PRIMITIVES_LINE=""
  if [ -n "$PRIMITIVES_SPEC" ]; then
    PRIMITIVES_LINE="    \"@deepseek-ai/dsh-client-ui-primitives\": \"$PRIMITIVES_SPEC\","
  fi
  cat >"$DIY_DIR/package.json" <<EOF
{
  "name": "dsh-workbench-diy",
  "version": "0.0.0",
  "private": true,
  "description": "DIY 工坊：工作台模块在这里造。这个目录由 dsh-workbench 的 setup 生成，手改会被覆盖。",
  "packageManager": "$PNPM_PIN",
  "devDependencies": {
    "@dsh-workbench/core": "$CORE_SPEC",
    "@dsh-workbench/module-tools": "$TOOLS_SPEC",
    "@dsh-workbench/shared": "$SHARED_SPEC",
${PRIMITIVES_LINE}
    "@types/node": "^24.19.0",
    "@types/react": "^19.3.0",
    "esbuild": "^0.28.2",
    "react": "^19.3.0",
    "typescript": "5.9",
    "vitest": "^5.0.2"
  }
}
EOF
  cat >"$DIY_DIR/pnpm-workspace.yaml" <<'EOF'
packages:
  - "packages/*"

# esbuild 的构建脚本要放行：pnpm 默认不跑依赖的 postinstall，而模块的构建就是 esbuild。
# 不放行的话每次 install 都会打一行
# `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2` —— 看着像失败，
# 其实退出码是 0（实测踩过）。
# 钉在 10.32.1 之后这个键名是对的（同一代 pnpm 也从 package.json 的 `pnpm` 段读它，
# 仓库根就是这么放的）；换 pnpm 11 会变成 `allowBuilds`，所以上面那句「钉住 pnpm」是前提。
onlyBuiltDependencies:
  - esbuild
EOF
  cat >"$DIY_DIR/.npmrc" <<EOF
# 工坊自己的 store 与 cache。
#
# 为什么必须指进来：agent 的 shell 跑在**会话沙箱**里，可写根就是会话 cwd（= 这个目录）。
# 而 pnpm 默认的 store（例如 ~/Library/pnpm/store/v10）与 npm 默认的 cache（~/.npm）
# 都在可写根**之外** —— 不指进来的话，agent 在会话里跑一次 pnpm install 会被沙箱拒（EPERM），
# 而"给模块加一个依赖"只有这一条路。setup 时的安装由人跑，不受沙箱限制，但用的也是这份配置，
# 于是装一次之后 agent 那边也能继续装。
store-dir=$DIY_DIR/.pnpm-store
cache-dir=$DIY_DIR/.npm-cache
EOF
  cat >"$DIY_DIR/README.md" <<'EOF'
# DIY 工坊

工作台模块在这里造。**一个模块一个目录**，都住在 `packages/` 下。

- 这个目录是「DIY 会话」的工作目录 —— 在对话里让 agent 造模块，它就写在这里。
- 依赖已经装好（`@dsh-workbench/core` / `module-tools` / `shared` / react / typescript / vitest）。
- 造一个新模块：`dsh-wb-module init <名字> --dir packages/module-<名字>`
  （`dsh-wb-module` 挂在 PATH 上、与 cwd 无关；写成 `pnpm exec dsh-wb-module …` 也对）
- 每个模块自己的四件事：`pnpm build` / `pnpm typecheck` / `pnpm test` / `pnpm selfcheck`，
  外加 `dsh-wb-module check` 的十条判据。

不要手改这个目录下的 `package.json` / `pnpm-workspace.yaml` / `.npmrc`：
它们是 `dsh-workbench setup` 生成的，模块要加依赖就加在**模块自己**的 `package.json` 里。
EOF
fi

# 工坊里只该有**一份** `@dsh-workbench/*` —— 模块自己声明的 `^0.1.x` 也算。
#
# 不钉的话 pnpm 会给每个模块**另装一份来源上的包**，于是同一个工坊里两代工具链并存：
# 模块自己的 `pnpm build` / `pnpm exec dsh-wb-module` 用的是源上那份（模板、判据、报错都是旧的，
# `init --template diy` 还会直接报"模板不存在"），而工坊根 `.bin/dsh-wb-module` 是 link 到本仓那份；
# `check --only kit` 比的也会是那份旧外壳（实测：0.1.13 与 0.1.14 两台工具并存，全程一声不响）。
#
# 用 pnpm 的 overrides 而不是改模块模板：模板里写死 link 路径会把"装到别人机器上"这条弄坏，
# overrides 活在**这个工坊**里，模块的 package.json 仍旧是干净的 `^0.1.x`。
# 放在第一次 `pnpm install` **之前**，这样一次装就是对的；已存在的工坊再跑一次 setup 也会被修好。
if [ "$IN_REPO" = "1" ] && [ -f "$DIY_DIR/package.json" ]; then
  node - "$DIY_DIR/package.json" "$CORE_SPEC" "$TOOLS_SPEC" "$SHARED_SPEC" <<'NODE'
const [file, core, tools, shared] = process.argv.slice(2);
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.pnpm = {
  overrides: {
    '@dsh-workbench/core': core,
    '@dsh-workbench/module-tools': tools,
    '@dsh-workbench/shared': shared,
  },
};
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
fi

if [ -d "$DIY_DIR/node_modules" ]; then
  echo "→ 工坊依赖已装，跳过"
elif ! command -v pnpm >/dev/null 2>&1; then
  echo "→ ⚠️ PATH 上没有 pnpm，工坊依赖没装。装好 pnpm 后跑一次：" >&2
  echo "     cd $DIY_DIR && pnpm install" >&2
else
  echo "→ 装工坊依赖（第一次会下载 react / typescript / vitest，几百 MB，之后不再下）"
  (cd "$DIY_DIR" && pnpm install 2>&1 | tail -6)
fi

# 完整的这一趟跑完：先挂指引（不管有没有基准 —— setup 那趟也要建起来），再看要不要自愈。
link_workshop_skills

# 完整的这一趟跑完，也顺手比一次代际 —— **有基准才算**。
#
# 这一趟有两个调用者：启动器（它 export 了 `DSH_WB_SHELL_ROOT` = profile 里那份）与
# `setup`（`seed-profile.sh`，**不设**基准）。前者比一下有意义：重跑 setup/自愈之后工坊当场
# 就跟上正在跑的那一代，不必等下一次启动被 entry 兜。后者在这一行**空转**（没基准 = 不动）——
# 那正是要的：setup 时 profile 里那份还没装/还是旧的，拿它当基准就是又一次"谁后跑谁说了算"。
# 不拖住收尾：`maybe_start_workshop_sync` 只做比对 + `nohup` 后台 spawn，立刻返回。
maybe_start_workshop_sync
