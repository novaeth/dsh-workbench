import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { discoverModulePackages, discoverPackages } from '../discover.mjs';

const SHELL = '@dsh-workbench/core';

export const title = '独立构建';

export async function run() {
  const shell = discoverPackages({ root: process.cwd() }).find((pkg) => pkg.manifest.name === SHELL);
  const visible = shell === undefined ? undefined : join(shell.dir, 'src');

  if (visible === undefined || !existsSync(visible)) {
    return {
      status: 'skip',
      notes: [`本仓没有 ${SHELL} 的源码（"不许 @/ 指外壳"那条判据照旧在守）`],
      problems: [],
    };
  }

  const modules = discoverModulePackages({ root: process.cwd() });
  if (modules.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有可独立构建的对象'],
      problems: [],
    };
  }

  const hidden = join(shell.dir, 'src.hidden');
  if (existsSync(hidden)) {
    return {
      status: 'fail',
      notes: [],
      problems: [`上次没还原干净：${hidden} 还在，手动改名回去再跑。`],
    };
  }

  const restore = () => {
    if (existsSync(hidden) && !existsSync(visible)) renameSync(hidden, visible);
  };

  const onInterrupt = () => {
    restore();
    process.removeListener('SIGINT', onInterrupt);
    process.kill(process.pid, 'SIGINT');
  };
  process.on('SIGINT', onInterrupt);

  const problems = [];
  renameSync(visible, hidden);
  try {
    for (const pkg of modules) {
      const name = pkg.manifest.name;
      for (const script of ['build', 'typecheck']) {
        if (pkg.manifest.scripts?.[script] === undefined) continue;
        try {
          execFileSync('pnpm', ['run', script], { cwd: pkg.dir, stdio: 'pipe' });
        } catch (error) {
          const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
          const first = output
            .split('\n')
            .filter((line) => /error|Cannot find|Could not resolve|ERR_/.test(line))
            .slice(0, 2)
            .map((line) => line.trim())
            .join(' | ');
          problems.push(`${name} ${script} 在外壳源码不在场时失败 —— ${first.slice(0, 220)}`);
        }
      }
    }
  } finally {
    restore();
    process.removeListener('SIGINT', onInterrupt);
  }

  if (problems.length > 0) {
    return {
      status: 'fail',
      notes: ['（上面的清单就是"发布出去会散架"的地方：模块只许依赖已发布的接口）'],
      problems,
    };
  }
  return {
    status: 'pass',
    notes: [`${modules.length} 个模块包在外壳源码不在场时都能 build + typecheck`],
    problems: [],
  };
}
