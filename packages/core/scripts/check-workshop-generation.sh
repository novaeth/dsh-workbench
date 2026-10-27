#!/usr/bin/env bash
#
# 工坊代际自愈的行为探针（selfcheck 调它；十八格各自独立、**并行**跑）。
#
# 不变量：工坊里那三个 @dsh-workbench/* 必须与**正在跑的那份外壳**同代。坏法全都**不报错**
# （agent 拿到的判据 / 模板 / 报错话术属于错的那一代，而读起来像"你写错了"），所以只能连行为一起钉。
# 基准是**显式输入**（DSH_WB_SHELL_ROOT），跑脚本那份副本不算数。
# 口径与代价见 内部设计记录。
#
# 为什么并行：串行那版靠 wall-clock sleep 排队，54 秒里 96% 是干等。每格各带自己的临时包根与
# 假 pnpm、互不共享，所以能并行；假 pnpm 睡 2 秒、锁等待压到 1 秒（SYNC_LOCK_WAIT_SECONDS
# 在 seed-workshop.sh 里可覆盖）—— 整条探针从 54s 收到 <10s。
# 负数格（"不该动"）仍需等一拍：它们彼此重叠，总时长由最慢那格（⑩/⑫）决定。
#
# 十八格：① 同代 / ② 不同代 / ③ 退避 / ④ 无参 setup / ⑤ 首次无基准 / ⑥ 装成才 ok /
# ⑦ 漂移（启动器不降级）/ ⑧ 目标取基准 / ⑨ 没基准一个字节不动 / ⑩ 撞锁目标不同要排队 /
# ⑪ 撞锁目标相同看心跳 / ⑫ 被抢锁后不碰别人的锁 / ⑬–⑱ 指引软链六格。
#
# 用法: bash scripts/check-workshop-generation.sh   # 成功打印 ALL OK，失败打印 FAIL: ...

set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SEED="$SELF_DIR/seed-workshop.sh"
[ -f "$SEED" ] || { echo "FAIL: 找不到 seed-workshop.sh（$SEED）"; exit 1; }

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $1"; exit 1; }

# $1=fresh $2=launcher_v $3=installed（none=没装） $4=profile_v（默认=launcher_v）
setup_shell() {
  fresh="$1"; installed="$3"; profile_v="${4:-$2}"
  for who in launcher profile; do
    mkdir -p "$fresh/$who/scripts"
    cp "$SEED" "$fresh/$who/scripts/seed-workshop.sh"
  done
  printf '{"name":"@dsh-workbench/core","version":"%s"}\n' "$2" > "$fresh/launcher/package.json"
  printf '{"name":"@dsh-workbench/core","version":"%s"}\n' "$profile_v" > "$fresh/profile/package.json"
  mkdir -p "$fresh/workbench/diy"
  printf '{"name":"dsh-workbench-diy","version":"0.0.0","private":true}\n' > "$fresh/workbench/diy/package.json"
  if [ "$installed" != none ]; then
    for part in core module-tools shared; do
      mkdir -p "$fresh/workbench/diy/node_modules/@dsh-workbench/$part"
      printf '{"name":"@dsh-workbench/%s","version":"%s"}\n' "$part" "$installed" > "$fresh/workbench/diy/node_modules/@dsh-workbench/$part/package.json"
    done
  fi
  mkdir -p "$fresh/fakebin"
  # 假 pnpm：报原话（② 要它进 seed.log）、记调用与目标（锁判据读它）、睡一下再按模式改实装版本。
  # 退出码永远 0 —— ⑥ 就是钉"不信退出码，复核过才写 ok"。
  # started / done 两个标记取代了原来"entry 必须 <3s 返回"那条计时断言：那条在假 pnpm 从 5 秒
  # 压到 2 秒之后就假绿了（同步版 entry 也能在 3 秒内"等完"）。现在 ②④⑥⑧ 断言 run_it 返回时
  # done **还没出现** —— 与假 install 多长无关。
  cat >"$fresh/fakebin/pnpm" <<'SH'
#!/bin/sh
echo "FAKE-PNPM-RAW mode=$FAKE_PNPM_MODE"
echo called >>"$SYNC_PROBE_MARK"
echo started >"$SYNC_PROBE_MARK.started"
target="$(node -e 'process.stdout.write(String(require(process.argv[1]).devDependencies["@dsh-workbench/core"]).replace("^",""))' "$FAKE_PNPM_DIY/package.json")"
echo "$target" >>"$SYNC_PROBE_MARK.target"
sleep 2
if [ "$FAKE_PNPM_MODE" = fix ]; then
  for n in core module-tools shared; do
    printf '{"name":"@dsh-workbench/%s","version":"%s"}\n' "$n" "$target" > "$FAKE_PNPM_DIY/node_modules/@dsh-workbench/$n/package.json"
  done
fi
echo done >"$SYNC_PROBE_MARK.done"
exit 0
SH
  chmod +x "$fresh/fakebin/pnpm"
}

# $1=fresh  $2=模式（entry / 空）  $3=跑哪份（launcher|profile）  $4="none"=不设基准 / 路径=显式基准 / 省略=跑的那份自己
run_it() {
  who="${3:-launcher}"
  if [ "${4:-}" = "none" ]; then base=""
  elif [ -n "${4:-}" ]; then base="$4"
  else base="$1/$who"; fi
  mode="${FAKE_PNPM_MODE:-noop}"
  if [ -n "${2:-}" ]; then
    SYNC_PROBE_MARK="$1/pnpm.called" FAKE_PNPM_MODE="$mode" FAKE_PNPM_DIY="$1/workbench/diy" \
      SYNC_LOCK_WAIT_SECONDS="${SYNC_LOCK_WAIT:-1}" \
      DSH_HOME="$1" DSH_WB_SHELL_ROOT="$base" PATH="$1/fakebin:$PATH" \
      bash "$1/$who/scripts/seed-workshop.sh" "$2" >/dev/null
  else
    SYNC_PROBE_MARK="$1/pnpm.called" FAKE_PNPM_MODE="$mode" FAKE_PNPM_DIY="$1/workbench/diy" \
      SYNC_LOCK_WAIT_SECONDS="${SYNC_LOCK_WAIT:-1}" \
      DSH_HOME="$1" DSH_WB_SHELL_ROOT="$base" PATH="$1/fakebin:$PATH" \
      bash "$1/$who/scripts/seed-workshop.sh" >/dev/null
  fi
}

wait_state() {
  i=0
  while [ "$i" -lt 100 ]; do
    if [ -f "$1/workbench/diy/.sync.json" ] && grep -q "$2" "$1/workbench/diy/.sync.json"; then return 0; fi
    sleep 0.1; i=$((i + 1))
  done
  return 1
}
installed_v() { node -p "require('$1/workbench/diy/node_modules/@dsh-workbench/core/package.json').version"; }
# macOS 的 /var 是 /private/var 的软链，而脚本里的 $REPO_DIR 就是这么来的 —— 比较前两边都解析真实路径。
real_of() { (cd "$1" && pwd -P); }
link_real_of() { local t; t="$(readlink "$1" 2>/dev/null || true)"; if [ -n "$t" ]; then (cd "$t" && pwd -P); fi; }

c1() {
  a="$work/a"; setup_shell "$a" 9.9.9 9.9.9
  run_it "$a" entry; sleep 2
  [ ! -f "$a/workbench/diy/.sync.json" ] || fail "① 同代却写了 .sync.json"
  [ ! -f "$a/pnpm.called" ] || fail "① 同代却动了 pnpm"
  echo "① 同代不动 ✅"
}

c2() {
  b="$work/b"; setup_shell "$b" 9.9.9 0.0.1
  run_it "$b" entry
  [ ! -f "$b/pnpm.called.done" ] || fail "② entry 等到了安装结束（被后台 install 拖住）"
  wait_state "$b" failed || fail "② 没写 failed"
  [ -f "$b/pnpm.called" ] || fail "② 没走到 pnpm"
  node -e '
const m = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
const names = ["@dsh-workbench/core", "@dsh-workbench/module-tools", "@dsh-workbench/shared"];
const o = (m.pnpm && m.pnpm.overrides) || {};
const wrong = names.filter((n) => o[n] !== "^9.9.9");
if (wrong.length > 0) { console.log("overrides 不是纯范围：" + wrong.map((n) => n + "=" + o[n]).join("、")); process.exit(1); }
' "$b/workbench/diy/package.json" || fail "② overrides 不是纯范围 ^9.9.9"
  grep -q "FAKE-PNPM-RAW" "$b/workbench/seed.log" || fail "② pnpm 的原话没进 seed.log"
  echo "② 不同代 + 退出码 0 也写 failed + overrides 纯范围（entry 不等安装）✅"
}

c3() {
  c="$work/c"; setup_shell "$c" 9.9.9 0.0.1
  printf '{"state":"failed","version":"9.9.9","at":"%s"}\n' "$(date -u +%FT%TZ)" > "$c/workbench/diy/.sync.json"
  before="$(cat "$c/workbench/diy/.sync.json")"; run_it "$c" entry; sleep 1
  [ ! -f "$c/pnpm.called" ] || fail "③ 退避窗口内重试了"
  [ "$before" = "$(cat "$c/workbench/diy/.sync.json")" ] || fail "③ 退避时改了 .sync.json"
  echo "③ 退避不重试 ✅"
}

c4() {
  d="$work/d"; setup_shell "$d" 9.9.9 0.0.1
  run_it "$d"
  [ ! -f "$d/pnpm.called.done" ] || fail "④ 无参那趟被后台 install 拖住"
  wait_state "$d" failed || fail "④ 无参（带基准）没拉起自愈"
  echo "④ 无参（setup 那条路 + 基准）也自愈 ✅"
}

c5() {
  e="$work/e"; setup_shell "$e" 9.9.9 none
  run_it "$e" entry; sleep 2
  [ ! -f "$e/workbench/diy/.sync.json" ] || fail "⑤ 首次却动手了"
  [ ! -f "$e/pnpm.called" ] || fail "⑤ 首次安装搬进了 entry"
  echo "⑤ 读不到实装版本就不动手 ✅"
}

c6() {
  f="$work/f"; setup_shell "$f" 9.9.9 0.0.1
  FAKE_PNPM_MODE=fix run_it "$f" entry
  [ ! -f "$f/pnpm.called.done" ] || fail "⑥ entry 等到了安装结束（被后台 install 拖住）"
  wait_state "$f" '"ok"' || fail "⑥ 装成了却没写 ok"
  grep -q '"version": "9.9.9"' "$f/workbench/diy/.sync.json" || fail "⑥ ok 里的版本不对"
  echo "⑥ 复核通过才写 ok ✅"
}

c7() {
  g="$work/g"; setup_shell "$g" 0.2.0 0.3.1 0.3.1
  run_it "$g" entry launcher none; sleep 2
  [ ! -f "$g/pnpm.called" ] || fail "⑦ 启动器那份拿自己当基准，把工坊降级了"
  [ ! -f "$g/workbench/diy/.sync.json" ] || fail "⑦ 启动器那次（无基准）不该写状态"
  [ "$(installed_v "$g")" = "0.3.1" ] || fail "⑦ 工坊被降级到 $(installed_v "$g")"
  run_it "$g" entry profile; sleep 2
  [ ! -f "$g/pnpm.called" ] || fail "⑦ 宿主同代却动了 pnpm"
  echo "⑦ 漂移：启动器（无基准）不降级、宿主（基准=profile 0.3.1）同代 no-op ✅"
}

c8() {
  h="$work/h"; setup_shell "$h" 0.2.0 0.2.0 0.3.1
  FAKE_PNPM_MODE=fix run_it "$h" entry launcher "$h/profile"
  [ ! -f "$h/pnpm.called.done" ] || fail "⑧ entry 等到了安装结束（被后台 install 拖住）"
  wait_state "$h" '"ok"' || fail "⑧ 没装成 ok"
  [ "$(head -n 1 "$h/pnpm.called.target")" = "0.3.1" ] || fail "⑧ 目标不是基准那一代（$(head -n 1 "$h/pnpm.called.target")）"
  [ "$(installed_v "$h")" = "0.3.1" ] || fail "⑧ 装完不是基准那一代"
  echo "⑧ 目标取基准那一代（^0.3.1），不是跑脚本这份 0.2.0 ✅"
}

c9() {
  i="$work/i"; setup_shell "$i" 0.2.0 0.1.0 0.3.1
  before="$(cat "$i/workbench/diy/package.json")"
  run_it "$i" entry profile none; sleep 2
  [ ! -f "$i/pnpm.called" ] || fail "⑨ 没基准却装了"
  [ ! -f "$i/workbench/diy/.sync.json" ] || fail "⑨ 没基准却写了状态"
  [ "$before" = "$(cat "$i/workbench/diy/package.json")" ] || fail "⑨ 没基准却动了工坊清单"
  echo "⑨ 没基准：不读、不比、不落状态、不动工坊 ✅"
}

c10() {
  j="$work/j"; setup_shell "$j" 9.9.9 0.0.1
  lock="$j/workbench/diy/.sync.lock"
  mkdir -p "$lock"; printf '1.1.1\n' >"$lock/target"; printf 'other\n' >"$lock/owner"; touch "$lock/heartbeat"
  # 放锁要等**证据**（脚本已经撞上这把锁、把"等一轮"那句写进日志了），不能盲等一个秒数：
  # 十八格是并行起的，机器有负载时脚本可能 >1 秒才走到锁，那时锁已经被放掉 —— "等一轮再抢"
  # 那条路根本没走，日志里自然没那句，这格就成了假红（2026-10-19 整链实测：同一份代码单跑
  # ALL OK、整链里 ⑩ 红）。等证据之后放锁，脚本正好还在它那一轮 sleep 里，下一枪就抢到。
  (
    k=0
    while [ "$k" -lt 60 ]; do
      grep -q "再抢一次" "$j/workbench/seed.log" 2>/dev/null && break
      [ -f "$j/pnpm.called.target" ] && break
      sleep 0.25; k=$((k + 1))
    done
    rm -rf "$lock"
  ) &
  run_it "$j" entry
  k=0; while [ "$k" -lt 60 ]; do [ -f "$j/pnpm.called.target" ] && break; sleep 0.25; k=$((k + 1)); done
  [ -f "$j/pnpm.called.target" ] || fail "⑩ 目标不同却没有等一轮再抢"
  [ "$(head -n 1 "$j/pnpm.called.target")" = "9.9.9" ] || fail "⑩ 抢到之后目标不对"
  grep -q "再抢一次" "$j/workbench/seed.log" || fail "⑩ 日志没说它等了一轮"
  echo "⑩ 撞锁：目标不同 → 等一轮再抢，抢到并按自己的目标装 ✅"
}

c11() {
  l="$work/l"; setup_shell "$l" 9.9.9 0.0.1
  lock="$l/workbench/diy/.sync.lock"
  mkdir -p "$lock"; printf '9.9.9\n' >"$lock/target"; printf 'other\n' >"$lock/owner"
  touch "$lock/heartbeat"                # 心跳刚碰过 = 持锁者活着（正在跑一个长 install）
  touch -t 202001010000 "$lock"          # 目录 mtime 拉到 2020 年（旧判据会在这里误判）
  run_it "$l" entry; sleep 2
  [ ! -f "$l/pnpm.called" ] || fail "⑪ 目标相同却抢了锁"
  [ ! -f "$l/workbench/diy/.sync.json" ] || fail "⑪ 跳过的这一轮不该写状态"
  if grep -q "当持锁者已崩" "$l/workbench/seed.log"; then fail "⑪ 把心跳新鲜的持锁者判成了崩"; fi
  grep -q "同一代（9.9.9）的自愈正持锁" "$l/workbench/seed.log" || fail "⑪ 没走\"目标相同就跳过\"那一支"
  echo "⑪ 撞锁：目标相同 → 跳过；过期判据看心跳（目录 mtime 很旧也不算崩）✅"
}

c12() {
  m="$work/m"; setup_shell "$m" 9.9.9 0.0.1
  run_it "$m" entry
  lock="$m/workbench/diy/.sync.lock"
  k=0; while [ "$k" -lt 40 ]; do [ -d "$lock" ] && break; sleep 0.1; k=$((k + 1)); done
  [ -d "$lock" ] || fail "⑫ 后台没抢到锁（探针无法继续）"
  rm -rf "$lock"
  mkdir -p "$lock"; printf 'other-target\n' >"$lock/target"; printf 'someone-else\n' >"$lock/owner"; touch "$lock/heartbeat"
  wait_state "$m" failed || fail "⑫ 原持锁者没跑完"
  sleep 1
  [ -d "$lock" ] || fail "⑫ 原持锁者的 trap 把别人的锁删了"
  [ "$(head -n 1 "$lock/owner")" = "someone-else" ] || fail "⑫ 别人的锁被人动过"
  echo "⑫ 被抢锁之后，原持锁者不碰别人的锁 ✅"
}

c13() {
  # 指引软链只有一份写口（seed-workshop.sh），源**优先基准那份**，第二遍不重写。
  # 这里故意跑"启动器那份"、基准给"profile 那份"，且只有 profile 里有 skills —— 区分开
  # "指基准"与"指跑脚本这份副本"。
  r="$work/r"; setup_shell "$r" 9.9.9 9.9.9
  mkdir -p "$r/profile/skills/workbench-module-diy"; printf 'x\n' >"$r/profile/skills/workbench-module-diy/SKILL.md"
  link="$r/workbench/diy/.agents/skills/workbench-module-diy"
  run_it "$r" entry launcher "$r/profile"
  [ -L "$link" ] || fail "⑬ 带基准跑 entry 没把指引链上"
  [ "$(link_real_of "$link")" = "$(real_of "$r/profile/skills/workbench-module-diy")" ] || fail "⑬ 链的不是基准那份（$(readlink "$link" 2>/dev/null)）"
  inode="$(ls -i "$link" | awk '{print $1}')"
  run_it "$r" entry launcher "$r/profile"
  [ "$(ls -i "$link" | awk '{print $1}')" = "$inode" ] || fail "⑬ 第二遍把软链重写了（inode 变了）"
  [ "$(link_real_of "$link")" = "$(real_of "$r/profile/skills/workbench-module-diy")" ] || fail "⑬ 第二遍改了指向"
  echo "⑬ 指引软链：源优先基准那份、第二遍不重写 ✅"
}

c14() {
  o="$work/o"; setup_shell "$o" 9.9.9 9.9.9
  mkdir -p "$o/profile/skills/workbench-module-diy"; printf 'x\n' >"$o/profile/skills/workbench-module-diy/SKILL.md"
  run_it "$o" entry profile "$o/launcher"
  [ "$(link_real_of "$o/workbench/diy/.agents/skills/workbench-module-diy")" = "$(real_of "$o/profile/skills/workbench-module-diy")" ] || fail "⑭ 基准里没有时没退回跑脚本那份"
  echo "⑭ 基准里没有就退回副本那份 ✅"
}

c15() {
  p="$work/p"; setup_shell "$p" 9.9.9 9.9.9
  run_it "$p" entry profile
  if [ -L "$p/workbench/diy/.agents/skills/workbench-module-diy" ] || [ -e "$p/workbench/diy/.agents/skills/workbench-module-diy" ]; then fail "⑮ 没有源却挂出了死链"; fi
  echo "⑮ 两份都没有就不挂（死链比没有更坏）✅"
}

c16() {
  # 挂指引不是代际决策：没基准也照挂（skills 在跑脚本那份里 → 退回它那份）。
  t="$work/t"; setup_shell "$t" 9.9.9 9.9.9
  mkdir -p "$t/launcher/skills/workbench-module-diy"; printf 'x\n' >"$t/launcher/skills/workbench-module-diy/SKILL.md"
  run_it "$t" entry launcher none
  [ "$(link_real_of "$t/workbench/diy/.agents/skills/workbench-module-diy")" = "$(real_of "$t/launcher/skills/workbench-module-diy")" ] || fail "⑯ 没基准就不挂了（挂指引不该挂在代际判断上）"
  echo "⑯ 没基准也照挂（退回跑脚本那份）✅"
}

c17() {
  q="$work/q"; setup_shell "$q" 9.9.9 9.9.9
  mkdir -p "$q/profile/skills/workbench-module-diy"; printf 'x\n' >"$q/profile/skills/workbench-module-diy/SKILL.md"
  printf 'not a directory\n' >"$q/workbench/diy/.agents"
  if run_it "$q" entry profile; then :; else fail "⑰ 挂不上时把 entry 带崩了"; fi
  [ -x "$q/workbench/bin/dsh-wb-module" ] || fail "⑰ 挂不上时入口没写完"
  [ ! -L "$q/workbench/diy/.agents/skills/workbench-module-diy" ] || fail "⑰ 竟然还挂上了"
  echo "⑰ 挂不上只留一句话、不当场炸 ✅"
}

c18() {
  w2="$work/w2"; setup_shell "$w2" 9.9.9 9.9.9
  mkdir -p "$w2/profile/skills/workbench-module-diy"; printf 'x\n' >"$w2/profile/skills/workbench-module-diy/SKILL.md"
  mkdir -p "$w2/workbench/diy/.agents/skills/workbench-module-diy"
  printf 'mine\n' >"$w2/workbench/diy/.agents/skills/workbench-module-diy/keep.md"
  run_it "$w2" entry profile
  [ -f "$w2/workbench/diy/.agents/skills/workbench-module-diy/keep.md" ] || fail "⑱ 把别人的真目录里的东西弄没了"
  [ ! -L "$w2/workbench/diy/.agents/skills/workbench-module-diy" ] || fail "⑱ 竟然把别人的真目录换成了软链"
  [ ! -e "$w2/workbench/diy/.agents/skills/workbench-module-diy/workbench-module-diy" ] || fail "⑱ 往别人的真目录里套了一层软链"
  echo "⑱ 那儿是别人的真目录就不碰 ✅"
}

# 每格一个文件记结果：子 shell 不继承父的 EXIT trap（bash 语义），所以 $work 不会被谁提前删。
cell() {
  n="$1"; shift
  ( "$@" ) >"$work/cell.$n.log" 2>&1 && : >"$work/cell.$n.ok" || true
}

cell 1 c1 & cell 2 c2 & cell 3 c3 & cell 4 c4 & cell 5 c5 & cell 6 c6 &
cell 7 c7 & cell 8 c8 & cell 9 c9 & cell 10 c10 & cell 11 c11 & cell 12 c12 &
cell 13 c13 & cell 14 c14 & cell 15 c15 & cell 16 c16 & cell 17 c17 & cell 18 c18 &
wait

bad=""
for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
  cat "$work/cell.$n.log" 2>/dev/null || true
  [ -f "$work/cell.$n.ok" ] || bad="$bad $n"
done
[ -z "$bad" ] || { echo "FAIL: 这几格没过：$bad"; exit 1; }
echo "ALL OK"
