import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PKG, pkg, read } from '../lib.mjs';

const RUNTIME_WORDS = /opencli/i;

export const checks = [
  {
    title: '★ 随包的启动 / 安装脚本不点名运行时（文案与入口都跟着适配器走）',
    run(_ctx, report) {
      const dirs = [pkg('bin'), pkg('scripts')];
      const hits = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) {
            walk(path);
            continue;
          }
          if (path.includes('/selfcheck/')) continue;
          const source = read(path);
          if (!RUNTIME_WORDS.test(source)) continue;
          const line = source.split('\n').findIndex((one) => RUNTIME_WORDS.test(one)) + 1;
          hits.push(`${relative(PKG, path)}:${String(line)}`);
        }
      };
      for (const dir of dirs) walk(dir);
      report(
        '★ 随包的启动 / 安装脚本不点名运行时（文案与入口都跟着适配器走）',
        hits.length === 0,
        hits.length === 0 ? '0 处' : hits.slice(0, 5).join('、'),
      );
    },
  },
  {
    title:
      '★ 随包脚本不靠 x 位（pnpm publish 只给 bin 字段那条 755；直接执行 = 别人机器上 Permission denied）',
    run(ctx, report) {
      const launcher = read(pkg('bin/dsh-workbench'));
      const seedViaBash = launcher.includes('bash "$REPO_DIR/scripts/seed-profile.sh"');
      const noDirectSeed = !/^\s*"\$REPO_DIR\/scripts\/seed-profile\.sh"/m.test(launcher);
      const passed = seedViaBash && noDirectSeed;
      report(
        '★ 随包脚本不靠 x 位（pnpm publish 只给 bin 字段那条 755；直接执行 = 别人机器上 Permission denied）',
        passed,
        passed
          ? 'seed-profile.sh 经 bash 呼；运行时的隔离包装不归启动器写（随适配器出货、由宿主自举落盘）'
          : '有随包脚本是按可执行位调用的',
      );
    },
  },
  {
    title:
      '★ 装了 ≠ 选中：启动器拒启并给修复命令；setup 的"确保选中"幂等补回（否则只有一台没入口的实例）',
    run(ctx, report) {
      const launcherPath = pkg('bin/dsh-workbench');
      const seedPath = pkg('scripts/seed-profile.sh');
      const launcherText = read(launcherPath);
      const addAt = launcherText.indexOf('dsh plugin --profile "$PROFILE" add');
      const ensureAt = launcherText.indexOf('seed-profile.sh" ensure-selected');
      let probe;
      try {
        probe = execFileSync(
          'bash',
          [
            '-c',
            `
set -e
fresh="$(mktemp -d)"
trap 'rm -rf "$fresh"' EXIT
mkdir -p "$fresh/bin" "$fresh/profiles/workbench"
cat > "$fresh/bin/dsh" <<'SH'
#!/bin/sh
exit 0
SH
chmod +x "$fresh/bin/dsh"

cat > "$fresh/profiles/workbench/package.json" <<'JSON'
{"dependencies":{"@dsh-workbench/core":"link:/dev/null"},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base"]}}}
JSON

if refusal="$(PATH="$fresh/bin:$PATH" DSH_HOME="$fresh" WORKBENCH_PROFILE=workbench bash "$1" 2>&1)"; then
  echo "launcher did not refuse: $refusal"; exit 0
fi
case "$refusal" in *dsh.profile.bundles*) ;; *) echo "no bundles reason: $refusal"; exit 0;; esac
case "$refusal" in *setup*) ;; *) echo "no repair command: $refusal"; exit 0;; esac

DSH_HOME="$fresh" bash "$2" ensure-selected >/dev/null
node -e 'const m=require(process.argv[1]); if(!m.dsh.profile.bundles.includes("@dsh-workbench/core")) process.exit(1)' "$fresh/profiles/workbench/package.json"
cp "$fresh/profiles/workbench/package.json" "$fresh/before.json"
DSH_HOME="$fresh" bash "$2" ensure-selected >/dev/null
cmp -s "$fresh/before.json" "$fresh/profiles/workbench/package.json"

cat > "$fresh/profiles/workbench/package.json" <<'JSON'
{"dependencies":{},"dsh":{"profile":{"bundles":[]}}}
JSON
if DSH_HOME="$fresh" bash "$2" ensure-selected >/dev/null 2>&1; then
  echo "ensure-selected accepted a missing dependency"; exit 0
fi

echo ok
`,
            'bash',
            launcherPath,
            seedPath,
          ],
          { encoding: 'utf8' },
        ).trim();
      } catch (error) {
        probe = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
      }
      report(
        '★ 装了 ≠ 选中：启动器拒启并给修复命令；setup 的"确保选中"幂等补回（否则只有一台没入口的实例）',
        probe === 'ok' && addAt !== -1 && ensureAt !== -1 && addAt < ensureAt,
        probe === 'ok'
          ? `缺则拒启 + 补齐 + 第二遍不写 + 依赖没装成不硬塞；ensure 排在 add 之后（${addAt} < ${ensureAt}）✅`
          : `探针输出：${probe}`,
      );
    },
  },
];
