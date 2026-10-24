#!/usr/bin/env bash
#
# 启动器"装哪一份"的探针（selfcheck 调它）：**仓库副本**以 link 装本目录，**装出来的那份**按
# 源上那个版本区间装 —— 后者就算正好落在某个 git 仓库里也一样。
#
# 为什么必须钉：`git rev-parse --show-toplevel` 只说明"**某个祖先目录**是个仓库"。装出来的那份
# 完全可能刚好在某个仓库里（`$HOME` 本身是 dotfiles 仓库、而 npm 前缀就在 `$HOME` 下，最常见），
# 判错的症状是市场里工作台那一行说「这份是本仓正在开发的那一份，不从源上取。」——顺带不比对源、
# 不给更新；`npm i -g …@latest` 之后 profile 指向的东西还会悄悄变。全程不报错。
#
# 四格：① 装出来的那份在一个空 git 仓库里 → 走源上那支 ② 同一份不在任何仓库里 → 走源上那支
#      ③ 工作树里那份（package.json 被那个仓库跟踪）→ 走仓库副本那支
#      ④ 已经装坏的机器（profile 里那条 link: 正指着装出来的那份）→ 重跑 setup 改回版本区间并说明
#
# 只跑启动器自己那两步（`seed-profile.sh` + `dsh plugin add`），dsh 与 pnpm 都是假的：
# 假 dsh 把 profile 骨架摆好、并把"装的是哪条 spec"照 pnpm 的做法写进 profile 清单；
# 假 pnpm 按工坊清单里的目标版本把三个包"装上"。
#
# 用法: bash scripts/check-launcher-spec.sh   # 成功打印 ALL OK，失败打印 FAIL: ...

set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PKG_DIR="$(cd "$SELF_DIR/.." && pwd -P)"
PKG_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
# 版本下限门禁要的是 `>=X`：假 dsh 直接报那个 X（正好够）。
DSH_FLOOR="$(node -p "require('$PKG_DIR/package.json').engines?.dsh ?? ''" 2>/dev/null || true)"
FAKE_DSH_VERSION="${DSH_FLOOR#>=[[:space:]]}"

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $1"; exit 1; }

fake_bin() {
  mkdir -p "$1"
  cat >"$1/dsh" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then echo "$FAKE_DSH_VERSION"; exit 0; fi
if [ "${1:-}" = "plugin" ]; then
  shift; profile=""; spec=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --profile) profile="$2"; shift 2 ;;
      add) shift; spec="${1:-}"; shift ;;
      *) shift ;;
    esac
  done
  [ -n "$profile" ] && [ -n "$spec" ] || exit 0
  WB_MANIFEST="$FAKE_DSH_HOME/profiles/$profile/package.json" WB_SPEC="$spec" node -e '
const fs = require("node:fs");
const file = process.env.WB_MANIFEST;
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.dependencies = { ...(manifest.dependencies ?? {}), "@dsh-workbench/core": process.env.WB_SPEC };
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
'
  exit 0
fi
profile="${1:-}"
[ -n "$profile" ] || exit 0
mkdir -p "$FAKE_DSH_HOME/profiles/$profile"
printf '{"name":"%s","dependencies":{},"dsh":{"profile":{"bundles":[]}}}\n' "$profile" \
  >"$FAKE_DSH_HOME/profiles/$profile/package.json"
printf '# profile patch（假 dsh 摆的骨架）\n[]\n' >"$FAKE_DSH_HOME/profiles/$profile/cordis.patch.yml"
exit 0
SH
  cat >"$1/pnpm" <<'SH'
#!/bin/sh
if [ "${1:-}" = "--version" ] || [ "${1:-}" = "-v" ]; then echo "0.0.0-fake"; exit 0; fi
[ -n "${FAKE_PNPM_DIY:-}" ] || exit 0
[ -f "$FAKE_PNPM_DIY/package.json" ] || exit 0
target="$(node -p "String(require('$FAKE_PNPM_DIY/package.json').devDependencies['@dsh-workbench/core'] ?? '').replace('^','')")"
[ -n "$target" ] || exit 0
for name in core module-tools shared; do
  mkdir -p "$FAKE_PNPM_DIY/node_modules/@dsh-workbench/$name"
  printf '{"name":"@dsh-workbench/%s","version":"%s"}\n' "$name" "$target" \
    >"$FAKE_PNPM_DIY/node_modules/@dsh-workbench/$name/package.json"
done
exit 0
SH
  chmod +x "$1/dsh" "$1/pnpm"
}

# $1=当成"启动器落点"的包目录 $2=格名 $3=（可选）先按这条写法把依赖写进 profile（造"已经装坏"的现场）
# → 打印那一格的 profile 目录
run_setup() {
  local pkg="$1" tag="$2" pre_dep="${3:-}"
  if [ $# -ge 3 ]; then shift 3; else shift $#; fi
  local bin="$work/$tag-bin" home="$work/$tag-home"
  mkdir -p "$home/profiles/web"
  printf '{"name":"web","dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]}}}\n' \
    >"$home/profiles/web/package.json"
  if [ -n "$pre_dep" ]; then
    mkdir -p "$home/profiles/probe"
    printf '{"name":"probe","dependencies":{"@dsh-workbench/core":"%s"},"dsh":{"profile":{"bundles":[]}}}\n' "$pre_dep" \
      >"$home/profiles/probe/package.json"
    printf '# profile patch（假 dsh 摆的骨架）\n[]\n' >"$home/profiles/probe/cordis.patch.yml"
  fi
  fake_bin "$bin"
  PATH="$bin:$PATH" \
    DSH_HOME="$home" WORKBENCH_PROFILE=probe \
    FAKE_DSH_HOME="$home" FAKE_DSH_VERSION="$FAKE_DSH_VERSION" \
    FAKE_PNPM_DIY="$home/workbench/diy" \
    bash "$pkg/bin/dsh-workbench" setup "$@" >"$work/$tag.out" 2>&1
  echo "$home"
}

# ① 装出来的那份，落在一个**空 git 仓库**里（$HOME 是 dotfiles 仓库那一类）
mkdir -p "$work/trap/lib/node_modules/@dsh-workbench"
cp -a "$PKG_DIR" "$work/trap/lib/node_modules/@dsh-workbench/core"
( cd "$work/trap" && git init -q . ) || fail "建不了那个 git 仓库"
home="$(run_setup "$work/trap/lib/node_modules/@dsh-workbench/core" trap)"
spec="$(node -p "require('$home/profiles/probe/package.json').dependencies['@dsh-workbench/core']")"
[ "$spec" = "@dsh-workbench/core@^$PKG_VERSION" ] ||
  fail "① 装出来的那份落在 git 仓库里时被判成了仓库副本（装的是 ${spec}）"
grep -q "仓库副本" "$work/trap.out" && fail "① 启动器说了「仓库副本」"

# ② 同一份不在任何仓库里（对照组：这支本来就在做对的事）
mkdir -p "$work/plain/lib/node_modules/@dsh-workbench"
cp -a "$PKG_DIR" "$work/plain/lib/node_modules/@dsh-workbench/core"
home="$(run_setup "$work/plain/lib/node_modules/@dsh-workbench/core" plain)"
spec="$(node -p "require('$home/profiles/probe/package.json').dependencies['@dsh-workbench/core']")"
[ "$spec" = "@dsh-workbench/core@^$PKG_VERSION" ] || fail "② 不在仓库里时也装错了（装的是 ${spec}）"

# ③ 工作树里那份（package.json 被这个仓库跟踪）→ 仓库副本那支
home="$(run_setup "$PKG_DIR" repo)"
spec="$(node -p "require('$home/profiles/probe/package.json').dependencies['@dsh-workbench/core']")"
[ "$spec" = "$PKG_DIR" ] || fail "③ 工作树里那份没以 link 装本目录（装的是 ${spec}）"
grep -q "仓库副本" "$work/repo.out" || fail "③ 工作树里那份没说「仓库副本」"

# ④ 已经装坏的机器：profile 里那条 link: 正指着我这份装出来的副本（旧版启动器判错的产物）
#    —— 重跑一次 setup 就该改回版本区间，并且说清改了什么（不然用户只看到"装好了"）。
home="$(run_setup "$work/trap/lib/node_modules/@dsh-workbench/core" heal \
  "link:$work/trap/lib/node_modules/@dsh-workbench/core")"
spec="$(node -p "require('$home/profiles/probe/package.json').dependencies['@dsh-workbench/core']")"
[ "$spec" = "@dsh-workbench/core@^$PKG_VERSION" ] || fail "④ 旧版留下的那条 link: 没被改回去（还是 ${spec}）"
grep -q "旧启动器判错的产物" "$work/heal.out" || fail "④ 改了却没说（用户看不到发生了什么）"

# ⑤ 新入口：一条命令以 web 为模板建新 profile（不再是五个环境变量）
home="$(run_setup "$PKG_DIR" flags "" --from web --profile wb3 --with-sessions)"
[ -f "$home/profiles/wb3/package.json" ] || fail "⑤ --from/--profile 没建出目标 profile"
spec="$(node -p "require('$home/profiles/wb3/package.json').dependencies['@dsh-workbench/core']")"
[ "$spec" = "$PKG_DIR" ] || fail "⑤ 目标 profile 没装对（装的是 ${spec}）"
grep -q -- "--profile wb3" "$work/flags.out" || fail "⑤ 没说清怎么启动新 profile"

# ⑥ create 是交互入口；非终端下要明确拒绝，不能挂着等输入
if bash "$PKG_DIR/bin/dsh-workbench" create </dev/null >"$work/create.out" 2>&1; then
  fail "⑥ create 在非终端下没有拒绝"
fi
grep -q "交互终端" "$work/create.out" || fail "⑥ create 非终端下没说清为什么不能跑"

# ⑦ 没有本机 web 也能建：dsh 自带出厂 web 模板，seed 不该把「先跑 dsh web」当硬前提
home="$work/nosource-home"
mkdir -p "$home"
fake_bin "$work/nosource-bin"
PATH="$work/nosource-bin:$PATH" \
  DSH_HOME="$home" WORKBENCH_PROFILE=wb6 \
  FAKE_DSH_HOME="$home" FAKE_DSH_VERSION="$FAKE_DSH_VERSION" \
  FAKE_PNPM_DIY="$home/wb6/diy" \
  bash "$PKG_DIR/bin/dsh-workbench" setup --profile wb6 >"$work/nosource.out" 2>&1 ||
  fail "⑦ 没有 web 时 setup 失败"
[ -f "$home/profiles/wb6/package.json" ] || fail "⑦ 没有 web 时没建出 profile"
grep -q "本机还没有来源 profile" "$work/nosource.out" || fail "⑦ 没有 web 时没说清用了出厂模板"

echo "ALL OK"
