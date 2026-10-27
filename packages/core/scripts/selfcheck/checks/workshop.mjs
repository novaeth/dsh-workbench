import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

import { pkg, read } from '../lib.mjs';

const SKILL_CHAR_BUDGET = 8192;
const skillsDir = pkg('skills');
const markdownUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return markdownUnder(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });

export const checks = [
  {
    title: '★ 干净机器兜底：启动器自愈工坊骨架 + 挂上 dsh-wb-module 入口（幂等）',
    run(_ctx, report) {

      const launcher = read(pkg('bin/dsh-workbench'));
      const seed = pkg('scripts/seed-workshop.sh');
      let probe;
      try {
        probe = execFileSync(
          'bash',
          [
            '-c',
            `set -e
fresh="$(mktemp -d)"
trap 'rm -rf "$fresh"' EXIT
mkdir -p "$fresh/workbench/diy/node_modules"
DSH_HOME="$fresh" bash "${seed}" >/dev/null
DSH_HOME="$fresh" bash "${seed}" >/dev/null
test -f "$fresh/workbench/diy/package.json"
test -f "$fresh/workbench/diy/pnpm-workspace.yaml"
test -x "$fresh/workbench/bin/dsh-wb-module"
echo ok`,
          ],
          { encoding: 'utf8' },
        ).trim();
      } catch (error) {
        probe = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
      }
      report(
        '★ 干净机器兜底：启动器自愈工坊骨架 + 挂上 dsh-wb-module 入口（幂等）',
        probe === 'ok' &&
          launcher.includes('seed-workshop.sh" entry') &&
          launcher.includes('export PATH="$WORKBENCH_HOME/bin:$PATH"') &&
          launcher.includes('scripts/seed-workshop.sh" || {'),
        probe === 'ok' ? '骨架建起来、入口可执行、再跑一遍不炸 ✅' : `探针输出：${probe}`,
      );
    },
  },
  {
    title:
      '★ 工坊代际自愈：基准显式输入（启动器不降级 / 目标取基准 / 没基准不动）+ 三条锁判据 + 六格指引软链',
    run(_ctx, report) {

      let probe;
      try {
        probe = execFileSync('bash', [pkg('scripts/check-workshop-generation.sh')], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      } catch (error) {
        probe = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
      }
      const passed = probe.endsWith('ALL OK');
      report(
        '★ 工坊代际自愈：基准显式输入（启动器不降级 / 目标取基准 / 没基准不动）+ 三条锁判据 + 六格指引软链',
        passed,
        passed ? '十八格都按契约 ✅' : `探针输出：${probe}`,
      );
    },
  },
  {
    title: 'skills/ 随外壳包出货（DIY 模式的指引住这儿）',
    run(_ctx, report) {
      report('skills/ 随外壳包出货（DIY 模式的指引住这儿）', existsSync(skillsDir), skillsDir);
    },
  },
  {
    title: '★ skills 在 package.json 的 files 里（漏了不报错，只是装出去没有它）',
    run(_ctx, report) {
      if (!existsSync(skillsDir)) return;
      const manifest = JSON.parse(read(pkg('package.json')));
      report(
        '★ skills 在 package.json 的 files 里（漏了不报错，只是装出去没有它）',
        (manifest.files ?? []).includes('skills'),
      );
    },
  },
  {
    title: 'skills/ 里有 SKILL.md 与它指向的 references',
    run(_ctx, report) {
      if (!existsSync(skillsDir)) return;
      const guides = markdownUnder(skillsDir);
      report(
        'skills/ 里有 SKILL.md 与它指向的 references',
        guides.some((file) => basename(file) === 'SKILL.md') && guides.length > 1,
        `${guides.length} 份`,
      );
    },
  },
  {
    title: `★ 每份指引都在 ${SKILL_CHAR_BUDGET} 字符内（超了会被修剪器裁掉中间）`,
    run(_ctx, report) {
      if (!existsSync(skillsDir)) return;
      const guides = markdownUnder(skillsDir);
      const over = guides
        .map((file) => ({ file, chars: read(file).length }))
        .filter((one) => one.chars > SKILL_CHAR_BUDGET)
        .map((one) => `${relative(skillsDir, one.file)}=${one.chars}`);
      report(
        `★ 每份指引都在 ${SKILL_CHAR_BUDGET} 字符内（超了会被修剪器裁掉中间）`,
        over.length === 0,
        over.join('、'),
      );
    },
  },
  {
    title: '指引之间的相对链接都指得到（改名不许烂在半路）',
    run(_ctx, report) {
      if (!existsSync(skillsDir)) return;
      const guides = markdownUnder(skillsDir);
      const rotten = [];
      for (const file of guides) {
        for (const match of read(file).matchAll(/\]\(([^)\s#]+)\)/g)) {
          const target = match[1];
          if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
          if (!existsSync(resolve(dirname(file), target))) rotten.push(`${relative(skillsDir, file)} → ${target}`);
        }
      }
      report('指引之间的相对链接都指得到（改名不许烂在半路）', rotten.length === 0, rotten.join('、'));
    },
  },
];
