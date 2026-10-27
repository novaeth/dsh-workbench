import { declarationProblemsOf } from '@dsh-workbench/shared/host';

export const title = '模块声明协议';

export async function run() {
  const { discoverPackages } = await import('../discover.mjs');
  const packages = discoverPackages({ root: process.cwd() });
  const problems = [];
  const versions = new Set();
  let declared = 0;

  for (const pkg of packages) {
    const raw = pkg.manifest.dsh?.workbench;
    if (raw === undefined) continue;
    problems.push(...declarationProblemsOf(pkg.manifest.name, raw));
    if (typeof raw === 'object' && raw !== null && Number.isInteger(raw.apiVersion)) {
      declared += 1;
      versions.add(raw.apiVersion);
    }
  }

  if (problems.length > 0) {
    return {
      status: 'fail',
      notes: [`${packages.length} 个包里带 dsh.workbench 声明的已逐个读过`],
      problems,
    };
  }

  return {
    status: 'pass',
    notes: [
      declared === 0
        ? '这个工作区里还没有模块（没有带 dsh.workbench 的包）'
        : `${declared} 个模块都声明了协议 v${[...versions].sort().join(' / v')}，静态半形状齐、没有生字段`,
    ],
    problems: [],
  };
}
