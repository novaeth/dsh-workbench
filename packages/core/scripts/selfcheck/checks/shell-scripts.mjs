import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { pkg, read } from '../lib.mjs';

const LAUNCHER_SPEC_TITLE =
  '★ 启动器"装哪一份"：仓库副本 link 本目录，装出来的那份按源上版本装（哪怕它正好落在某个 git 仓库里）';

export const checks = [
  {
    title: '★ 随包 shell 脚本都带 shebang，而且开了 -u 与 pipefail（少了就静默跑半截）',
    run(_ctx, report) {

      const dir = pkg('scripts');
      const scripts = readdirSync(dir)
        .filter((name) => name.endsWith('.sh'))
        .sort();
      const problems = scripts.filter((name) => {
        const source = read(join(dir, name));
        const shebang = source.startsWith('#!/usr/bin/env bash') || source.startsWith('#!/bin/bash');
        const strict = source
          .split('\n')
          .filter((line) => /^set\s/.test(line))
          .some((line) => /-[a-z]*u[a-z]*/.test(line) && line.includes('pipefail'));
        return !shebang || !strict;
      });
      report(
        '★ 随包 shell 脚本都带 shebang，而且开了 -u 与 pipefail（少了就静默跑半截）',
        problems.length === 0,
        problems.length ? `缺头部的：${problems.join('、')}` : `${scripts.length} 份：${scripts.join('、')}`,
      );
    },
  },
  {
    title: LAUNCHER_SPEC_TITLE,
    run(_ctx, report) {

      let probe;
      try {
        probe = execFileSync('bash', [pkg('scripts/check-launcher-spec.sh')], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      } catch (error) {
        probe = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
      }
      const passed = probe.endsWith('ALL OK');
      report(LAUNCHER_SPEC_TITLE, passed, passed ? '四格都按契约 ✅' : `探针输出：${probe}`);
    },
  },
];
