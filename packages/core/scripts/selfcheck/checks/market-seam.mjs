import { join } from 'node:path';
import { SHARED_SRC, pkg, read } from '../lib.mjs';

const TIER_ONE = [
  'src/shared/api/host/market-index-fetch.ts',
  'src/shared/api/host/market-source-init.ts',
  'src/shared/api/host/market-doc.ts',
  'src/shared/api/host/git-probe.ts',
  'src/shared/api/host/diy-publish-preview.ts',
];

const SEAM_WORDS = /\brunShell\b|\bquoteShellArg\b|\bDshShell\b/;

const SEAM_TITLE = '★ 一级命令不走执行缝：市场索引 / 文档 / 体检 / 署名（argv 全由我们算，只碰自己的缓存）';

const SANDBOX_TITLE = '★ 沙箱拒绝单独成一种结论：EPERM → sandbox，界面有一句话，不再是 git-network';

const NO_PROMPT_TITLE = '★ 自己起 git 也禁交互：终端提示与 SSH 交互一律关（ASKPASS 只在 POSIX 上指 /usr/bin/false）';

function seamHits() {
  const hits = [];
  for (const rel of TIER_ONE) {
    const lines = read(pkg(rel)).split('\n');
    lines.forEach((line, index) => {
      if (SEAM_WORDS.test(line)) hits.push(`${rel}:${String(index + 1)}`);
    });
  }
  return hits;
}

function sandboxGaps() {
  const gaps = [];
  const reader = read(pkg('src/shared/api/host/market-index-fetch.ts'));
  if (!reader.includes("kind: 'sandbox'")) gaps.push('读索引没有 sandbox 结论');
  if (!/operation not permitted/i.test(reader)) gaps.push('读索引不认 operation not permitted');
  const contract = read(join(SHARED_SRC, 'contract/protocol/market-index.ts'));
  if (!/\|\s*'sandbox'/.test(contract)) gaps.push('契约里没有 sandbox');
  for (const lang of ['zh', 'en']) {
    const dict = read(join(SHARED_SRC, `i18n/${lang}.ts`));
    if (!dict.includes("'panels.discover.sandbox'")) gaps.push(`${lang} 缺 panels.discover.sandbox`);
  }
  return gaps;
}

function noPromptGaps() {
  const gaps = [];
  const runner = read(pkg('src/shared/api/host/git-process.ts'));
  const exec = read(pkg('src/shared/api/host/git-exec.ts'));
  if (!runner.includes('gitNoPromptProcessEnv')) gaps.push('git-process 没用共用的禁交互环境');
  for (const name of ['GIT_TERMINAL_PROMPT', 'GIT_ASKPASS', 'SSH_ASKPASS_REQUIRE']) {
    if (!exec.includes(name)) gaps.push(`git-exec 少了 ${name}`);
  }
  return gaps;
}

export const checks = [
  {
    title: SEAM_TITLE,
    run(_ctx, report) {
      const hits = seamHits();
      report(SEAM_TITLE, hits.length === 0, hits.length === 0 ? `${String(TIER_ONE.length)} 个文件 0 处` : hits.join('、'));
    },
  },
  {
    title: SANDBOX_TITLE,
    run(_ctx, report) {
      const gaps = sandboxGaps();
      report(SANDBOX_TITLE, gaps.length === 0, gaps.length === 0 ? '读索引 / 契约 / 中英文案都对上了' : gaps.join('、'));
    },
  },
  {
    title: NO_PROMPT_TITLE,
    run(_ctx, report) {
      const gaps = noPromptGaps();
      report(NO_PROMPT_TITLE, gaps.length === 0, gaps.length === 0 ? '三件都在' : gaps.join('、'));
    },
  },
];
