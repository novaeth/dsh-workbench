#!/usr/bin/env bash
#
# 一次性引导：从 shipped 的 web 模板创建 workbench profile，
# 继承 web 的 **bundle 清单**（这台机器上装了哪些 bundle），
# 补上可写根那一行；新 profile 直接跟 web 共用数据根，旧 profile 保持原状，等用户跑 migrate。
#
# **设置不在这里继承**（这里曾经把 web 的 cordis.patch.yml 快照一份过来）：
# 工作台自己的 patch 是唯一真相，想同步 web 的哪几行由用户走「设置 → 配置同步」。
# 为什么这么分（安装 vs 设置）、为什么不再是自动的：内部设计记录
#
# 幂等 / 可续跑：profile 已存在就跳过创建；数据根已经是共用的、或旧数据还没迁
# （只提示 migrate）就什么都不写 —— 重复运行不会覆盖任何东西。
# 安全：全程只**读** web 的 profile 目录，只**写** workbench 自己的目录。
#
# 用法:
#   ./scripts/seed-profile.sh
#   WORKBENCH_PROFILE=wb2 ./scripts/seed-profile.sh   # 建到别的 profile 名下（试装用）
#   ./scripts/seed-profile.sh ensure-selected         # 只做"确保选中"这一步：
#                                                     # 把工作台 bundle 补进 dsh.profile.bundles
#                                                     # （setup 在 `dsh plugin add` **之后**调它）

set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${WORKBENCH_PROFILE:-workbench}"
SRC_PROFILE_NAME="${WORKBENCH_SOURCE_PROFILE:-web}"
SRC_PROFILE="$DSH_HOME/profiles/$SRC_PROFILE_NAME"
DST_PROFILE="$DSH_HOME/profiles/$PROFILE"
WORKBENCH_HOME="${DSH_WORKBENCH_HOME:-$DSH_HOME/$PROFILE}"
export DSH_WORKBENCH_HOME="$WORKBENCH_HOME"
PKG='@dsh-workbench/core'
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GIT_TOP="$(git -C "$REPO_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
# 同 bin/dsh-workbench 那一处（那边写清了为什么）：`--show-toplevel` 只说明**某个祖先**是仓库，
# 装出来的那份可能刚好落在某个仓库里（`$HOME` 是 dotfiles 仓库时最常见）—— 还要证明这份
# package.json 本身被那个仓库跟踪，才算是仓库副本。
if [ -n "$GIT_TOP" ] && ! git -C "$REPO_DIR" ls-files --error-unmatch package.json >/dev/null 2>&1; then
  GIT_TOP=""
fi

# `verify.sh` 留在**仓库根**（它证明的是"dsh web 未被动过 / 组合树差异 / 数据分家"，
# 与包边界无关），所以不能按 $REPO_DIR 拼。装成安装包（没有 git 工作树）时它不存在，
# 那就只说"见仓库的 scripts/verify.sh"。
VERIFY_DIR="${GIT_TOP:-$REPO_DIR}/scripts"

die() {
  echo "seed-profile: $*" >&2
  exit 1
}

# ── 确保工作台 bundle 被**选中**（`ensure-selected` 子命令，幂等）──────────────
#
# 为什么单独一步、还要排在 `dsh plugin add` **之后**：装包与"选中"在 dsh 那侧是两件事。
# `dsh plugin add` 的 pnpm 那半把包装进 profile；登记 `dsh.profile.bundles` 是它装完后的
# 对账，而那条对账**跳过已存在的依赖** —— 所以依赖已经在清单里时（重跑 setup、上次装到
# 一半），bundle 名单永远缺那一项。症状是静默的：profile 照常组起来、服务照常监听，
# 只是侧边栏什么也不出现。启动器现在拿"选中"当硬门禁（拒绝启动 + 打印修复命令），
# 这一步就是那条修复命令的落点。
#
# 与 dsh 自己的 `selectBundle(name, true)` 等价：已经在清单里就一个字节都不写；
# 补之前先确认包真的装着（`dsh plugin add` 落了 dependencies）—— 把没装的包塞进
# bundles 只会让 profile 组不起来，比"面板不出现"更糟。
ensure_selected() {
  local manifest="$DST_PROFILE/package.json"
  [ -f "$manifest" ] ||
    die "找不到 $manifest —— 先跑一次 '$REPO_DIR/bin/dsh-workbench setup'。"

  WB_MANIFEST="$manifest" WB_PKG="$PKG" node -e '
const fs = require("node:fs");
const manifestPath = process.env.WB_MANIFEST;
const pkg = process.env.WB_PKG;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const dependencies = manifest.dependencies || {};
if (!Object.hasOwn(dependencies, pkg)) {
  console.error("seed-profile: dependencies 里没有 " + pkg + " —— dsh plugin add 那一步没成，先重装一遍。");
  process.exit(1);
}
const profile = (manifest.dsh || {}).profile || {};
const bundles = Array.isArray(profile.bundles) ? profile.bundles : [];
if (bundles.includes(pkg)) {
  console.log("→ 工作台 bundle 已选中: " + pkg);
  process.exit(0);
}
manifest.dsh = Object.assign({}, manifest.dsh, {
  profile: Object.assign({}, profile, { bundles: bundles.concat([pkg]) }),
});
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("→ 已把工作台 bundle 补进 dsh.profile.bundles: " + pkg);
' ||
    die "'$PKG' 没被选中，也没能补上（原因见上一行）。"
}

if [ "${1:-}" = "ensure-selected" ]; then
  ensure_selected
  exit 0
fi

HAS_SOURCE=0
if [ -f "$SRC_PROFILE/package.json" ]; then
  HAS_SOURCE=1
fi

DST_PATCH="$DST_PROFILE/cordis.patch.yml"

# ── 第 1 步：创建 profile ────────────────────────────────────────────────
# --from-default-profile web 只复制 web 模板的 bundle 列表
# （dsh-base + dsh-web-app），**不**复制 web 的 cordis.patch.yml。
# 用 --dump-config 而不是直接启动：走同一条初始化路径，但只打印
# 组合树，不挂载、不监听端口。
if [ -f "$DST_PROFILE/package.json" ]; then
  echo "→ profile '$PROFILE' 已存在，跳过创建"
else
  echo "→ 创建 profile '$PROFILE'（模板: ${SRC_PROFILE_NAME}）"
  dsh "$PROFILE" --from-default-profile "$SRC_PROFILE_NAME" --dump-config >/dev/null
fi

[ -f "$DST_PATCH" ] || die "profile 缺少 $DST_PATCH"

# ── 第 2 步：继承 web 的 profile 清单 ───────────────────────────────────
# --from-default-profile 只复制**出厂模板**的 bundle 列表（dsh-base +
# dsh-web-app），而 web 的清单可能后来被 install_bundle / plugin_manager
# 改过（例如启用了某个可选 bundle）。所以这里把 web 清单里的 bundles
# 并进来，同时保留 workbench 自己已有的额外项（例如 @dsh-workbench/core），
# 使脚本可重复运行。
if [ "$HAS_SOURCE" = "1" ]; then
WB_MANIFEST="$DST_PROFILE/package.json" \
  WEB_MANIFEST="$SRC_PROFILE/package.json" \
  WB_SOURCE_NAME="$SRC_PROFILE_NAME" \
  node -e '
const fs = require("node:fs");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const wb = read(process.env.WB_MANIFEST);
const web = read(process.env.WEB_MANIFEST);
const webProfile = (web.dsh && web.dsh.profile) || {};
const wbProfile = (wb.dsh && wb.dsh.profile) || {};
const webBundles = webProfile.bundles || [];
const wbBundles = wbProfile.bundles || [];
const merged = webBundles.concat(
  wbBundles.filter((b) => webBundles.indexOf(b) === -1),
);
wb.dsh = Object.assign({}, wb.dsh, {
  profile: Object.assign({}, webProfile, wbProfile, { bundles: merged }),
});
fs.writeFileSync(process.env.WB_MANIFEST, JSON.stringify(wb, null, 2) + "\n");
console.log("→ 已继承 " + process.env.WB_SOURCE_NAME + " 的 bundle 列表: " + merged.join(", "));
'
else
  echo "→ 本机还没有来源 profile '$SRC_PROFILE_NAME'；用 dsh 出厂模板的 bundle 列表（如需继承它的设置/插件，先跑一次来源 profile）"
fi

# ── 第 2.5 步：修掉旧版启动器留下的"装出来的那份被当成仓库副本" ──────────
#
# 旧判据只问 `git rev-parse --show-toplevel`（"**某个祖先**是不是仓库"），于是包目录落在任何
# 仓库里的机器（最常见：`$HOME` 是 dotfiles 仓库，而 npm/nvm 的前缀就在 `$HOME` 下）在 setup
# 时会把**全局安装目录**以 `link:` 装进 profile —— 市场里工作台那一行因此打上「本地」标
# （不比对源、不提示更新），而 `npm i -g …@latest` 还会悄悄换掉
# profile 跑的东西。判据窄到只认那一个坏形状：**我自己是装出来的那份**（GIT_TOP 为空）
# **且 profile 里那条 `link:` 指着的正是我自己这份目录** —— 指别处的 link:（用户自己链的）不动。
if [ -z "$GIT_TOP" ] && [ -f "$DST_PROFILE/package.json" ]; then
  WB_MANIFEST="$DST_PROFILE/package.json" WB_PKG="$PKG" WB_SELF="$REPO_DIR" \
    WB_TARGET="$PKG@^$(node -p "require('$REPO_DIR/package.json').version" 2>/dev/null || echo 0)" \
    node -e '
const fs = require("node:fs");
const path = require("node:path");
const file = process.env.WB_MANIFEST;
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const deps = manifest.dependencies ?? {};
const spec = String(deps[process.env.WB_PKG] ?? "");
if (!spec.startsWith("link:")) process.exit(0);
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const target = path.resolve(path.dirname(file), spec.slice("link:".length));
if (real(target) !== real(process.env.WB_SELF)) process.exit(0);
manifest.dependencies = Object.assign({}, deps, { [process.env.WB_PKG]: process.env.WB_TARGET });
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log("→ profile 里那条 link: 指的是我这份装出来的副本（旧启动器判错的产物）—— 已改回 " + process.env.WB_TARGET);
'
fi

# ── 第 3 步：数据根配置 + 可写根那一行 ─────────────────────────────────
#
# 新 profile 跟 `dsh web` / Desktop 一样只分 profile，数据落在 `$DSH_HOME`。
# 旧 profile 如果还有没迁的数据，这里只打印 migrate 提示，保持隔离、不动数据；
# 用户自己跑 `dsh-workbench migrate` 才切共用根并并数据。
# 每一步都幂等：已经是共用数据根的 profile 一个字节都不写。
WORKBENCH_PROFILE="$PROFILE" DSH_HOME="$DSH_HOME" DSH_WORKBENCH_HOME="$WORKBENCH_HOME" \
  node "$REPO_DIR/scripts/share-data-root.mjs" || die "整理数据根失败（见上一行）"

# ── 第 4 步：建 DIY 工坊 ────────────────────────────────────────────────
#
# 工坊是 DIY 模式的落点：agent 在那里造模块（一个模块一个目录），而 **DIY 会话的 cwd 就是它**。
# 骨架 + 依赖 + 稳定入口都交给 `scripts/seed-workshop.sh` —— 启动器（bin/dsh-workbench）
# 每次启动也调它（幂等），所以"干净机器上工坊是空的"这件事不再需要人来处理。
bash "$REPO_DIR/scripts/seed-workshop.sh"

# 装 bundle 的目标：开发态是这个仓库（link），安装包态是源上那个包。
# 判据是「git 顶层在不在」—— npm pack 的产物里不含 .git（见 package.json 的 files）。
# ⚠️ 不能判 `$REPO_DIR/.git`：workspace 之后 .git 在仓库根（同 bin/dsh-workbench）。
if [ -n "$GIT_TOP" ]; then
  BUNDLE_TARGET="$REPO_DIR"
else
  BUNDLE_TARGET="$PKG@^$(node -p "require('$REPO_DIR/package.json').version" 2>/dev/null || echo 0)"
fi

cat <<EOF

profile '$DST_PROFILE' 的骨架好了（bundle 清单 + 可写根）。
旧实例如果还有数据没迁，启动时会提示；要切共用根并并旧数据，跑 dsh-workbench migrate。

设置按创建时的勾选从 $SRC_PROFILE_NAME 继承（只同步改已有插件的行；挂新插件的行不同步）；
直接跑 setup 时只继承 bundle 清单，想要 web 那边的模型供应商 / 搜索源 / MCP，起工作台后去
「设置 → 配置同步」按行勾（读的是那个 profile 的 cordis.patch.yml；同步完重启生效）。

装 bundle —— 两条**等价**的路，任选一条（都走 dsh 的 runPluginCommand，装完会
把 bundle 登记进 profile 清单）：

  ① 一条命令（建 profile + 装 bundle，幂等，可重复跑）
       $REPO_DIR/bin/dsh-workbench setup

  ② 在**工作台进程**的会话里让 agent 做（plugin_manager 只作用于当前 profile）
       启动: $REPO_DIR/bin/dsh-workbench
       让 agent 执行: install_bundle target=$BUNDLE_TARGET

然后验收（工作台占另一个端口，dsh web 继续用 3080，可同时开）：

  ${VERIFY_DIR}/verify.sh --record   # 先记录基线（可选，越早越好）
  ${VERIFY_DIR}/verify.sh

EOF
