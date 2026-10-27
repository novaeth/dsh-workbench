#!/usr/bin/env bash
#
# 验收脚本：证明三条设计约束真的成立。
#
#   ./scripts/verify.sh --record   记录 web profile 基线（建议一开始就记录）
#   ./scripts/verify.sh            跑全部检查
#
# 检查项：
#   ① web profile 的清单与设置文档一个字节都没变
#   ② workbench 组合树：工作台行在位、出厂左栏被禁用、没有叠层回来（ADR-0044）
#   ③ 会话 / 项目 / 附件跟 web 共用数据根（工作台 profile 不再覆盖它们）
#   ④ 工作台 profile 里没有隔离那三行；可写根那一行在位
#   ⑤ 别的 profile 也没被隔离层盖住（盖了 = 它看不到自己的历史）
#
# 说明：任何一次 dsh 启动都会重写 profiles/<name>/cordis.yml（空数组占位，
# 防止组合树被 Loader 回写），这是正常行为，不在基线范围内。

set -uo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
WEB="$DSH_HOME/profiles/web"
WB="$DSH_HOME/profiles/workbench"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="$REPO_DIR/.verify/web-profile.sha256"

fail=0
ok() { echo "  ✅ $*"; }
bad() {
  echo "  ❌ $*"
  fail=1
}
info() { echo "  · $*"; }

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

baseline_lines() {
  for f in "$WEB/package.json" "$WEB/cordis.patch.yml"; do
    [ -f "$f" ] && printf '%s  %s\n' "$(hash_file "$f")" "$f"
  done
}

if [ "${1:-}" = "--record" ]; then
  mkdir -p "$(dirname "$BASELINE")"
  baseline_lines >"$BASELINE"
  echo "已记录 web profile 基线 → $BASELINE"
  echo "之后任何时刻跑 ./scripts/verify.sh 都能证明 web 是否被动过。"
  exit 0
fi

echo "=== ⓪ 代码接线自检（不依赖 dsh 运行时）==="
if (cd "$REPO_DIR" && pnpm --filter @dsh-workbench/core --silent run selfcheck >/dev/null 2>&1); then
  ok "接线自检（packages/core 的 selfcheck）全部通过"
else
  bad "接线自检有失败项，单独运行看明细：pnpm --filter @dsh-workbench/core run selfcheck"
fi

echo "=== ① web profile 是否被动过 ==="
if [ ! -f "$BASELINE" ]; then
  info "还没有基线；先跑一次 ./scripts/verify.sh --record（越早越好）"
else
  now="$(baseline_lines)"
  if [ "$now" = "$(cat "$BASELINE")" ]; then
    ok "web 的 package.json 与 cordis.patch.yml 与基线完全一致"
  else
    bad "web profile 发生了变化："
    diff <(cat "$BASELINE") <(echo "$now") | sed 's/^/      /'
    info "先说清楚责任：工作台对 web 的 profile **只有读路径**（设置 → 「配置同步」读的是它的"
    info "cordis.patch.yml；写路径指的全是工作台自己那份，见 ADR-0044）；写 web 的只有 dsh 自己的"
    info "Settings 页。所以这条红通常等于「用户自己改过 web 的设置」，不是工作台动的手。"
    info "确认改动是你自己做的、内容正常之后，重记基线并**把旧的那份留档**（本仓已经有这个约定）："
    info "  cp .verify/web-profile.sha256 .verify/web-profile.sha256.pre-<改了什么>"
    info "  ./scripts/verify.sh --record"
  fi
fi

echo "=== ② 组合树：工作台行在位 · 出厂左栏被禁用 · 没有叠层回来 ==="
if [ ! -f "$WB/package.json" ]; then
  bad "profile 'workbench' 不存在，先跑 ./scripts/seed-profile.sh"
else
  # dump 里的注释会带上各自 profile 目录名，先归一化掉，否则看不出结构差异。
  # 两棵树**本来就不该一样**：工作台不再继承 web 的设置（ADR-0044），
  # 所以这里只把它打出来给人看，不再当判据。
  normalize() {
    sed -E 's#/profiles/(web|workbench)/cordis\.patch\.yml#/profiles/<profile>/cordis.patch.yml#g'
  }
  info "web vs workbench 组合树差异（仅供参考）："
  diff \
    <(dsh web --dump-config 2>/dev/null | normalize) \
    <(dsh workbench --dump-config 2>/dev/null | normalize) |
    sed 's/^/      /' || true
  if dsh workbench --dump-config 2>/dev/null | grep -q "id: workbench"; then
    ok "工作台插件行已进入 workbench 组合树"
  else
    bad "工作台插件行不在组合树里 —— 检查 cordis.patch.yml / dsh.profile.bundles"
  fi
  # 左栏替换的前提：出厂 ui-sidebar 必须被关掉，否则两个 entry 抢同一批
  # 子座位声明（SlotSpec 无 priority），ui-sidebar 会激活失败、前端白屏。
  if dsh workbench --dump-config 2>/dev/null |
    grep -A2 '^- id: ui-sidebar$' | grep -q 'disabled: true'; then
    ok "出厂 ui-sidebar 已在 workbench 组合树中被禁用"
  else
    bad "ui-sidebar 未被禁用 —— 左栏会和出厂 SidebarRoot 抢 sidebar 槽"
  fi
  if grep -q 'WEB_PATCH' "$REPO_DIR/packages/core/bin/dsh-workbench"; then
    bad "启动器又在叠 web 的 patch —— 那一层盖住的行在 :3081 改不动（ADR-0044）"
  else
    ok "启动器只叠工作台自己那层（sandbox 可写根），没有 web 设置的叠层"
  fi
  if [ -f "$WB/cordis.patch.yml" ] && ! grep -q 'id: llm-' "$WB/cordis.patch.yml"; then
    info "工作台自己那层还没有模型供应商行 —— 起工作台后去 设置 → 「配置同步」从 web 拉一次"
  fi
fi

echo "=== ③ 会话 / 项目 / 附件是否跟 web 共用数据根 ==="
for d in "$DSH_HOME/sessions" "$DSH_HOME/storages" "$DSH_HOME/attachments"; do
  if [ -d "$d" ]; then
    n="$(find "$d" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
    ok "$d （${n} 个顶层条目）"
  else
    info "$d 尚未创建"
  fi
done

echo "=== ④ 工作台 profile 不再隔离数据、可写根在位 ==="
for id in session-persistence-jsonl storage-json attachment-local; do
  if [ -f "$WB/cordis.patch.yml" ] && grep -q "id: $id" "$WB/cordis.patch.yml"; then
    bad "$id 还在 $WB/cordis.patch.yml 里 —— 删掉它（下次启动会把数据并回 $DSH_HOME）"
  else
    ok "$id 不在工作台 profile 里"
  fi
done
if [ -f "$WB/cordis.patch.yml" ] && grep -q 'id: sandbox-policy' "$WB/cordis.patch.yml"; then
  ok "可写根（sandbox-policy）在位"
else
  bad "可写根那一行不在 $WB/cordis.patch.yml 中"
fi

echo "=== ⑤ 隔离行没有漏进任何 profile ==="
# 漏进去的代价是那个 profile 看不到 `$DSH_HOME/sessions` 里已有的历史 —— 数据没丢，
# 视图上"消失"，而且没有任何报错。2026-10-23 的 desktop profile 就是这么中招的。
leak=0
for pdir in "$DSH_HOME"/profiles/*/; do
  name="$(basename "$pdir")"
  if [ -f "$pdir/cordis.patch.yml" ] && grep -q 'id: session-persistence-jsonl' "$pdir/cordis.patch.yml"; then
    bad "profile '$name' 的会话根被覆盖了 —— 删掉那三行（session-persistence-jsonl / storage-json / attachment-local）"
    leak=1
  fi
done
[ "$leak" = "0" ] && ok "所有 profile 都没有会话根覆盖"

echo
if [ "$fail" = "0" ]; then
  echo "全部通过。"
else
  echo "存在失败项，见上方 ❌。"
fi
exit "$fail"
