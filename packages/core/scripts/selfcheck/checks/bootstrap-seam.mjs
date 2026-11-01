import { pkg, read } from '../lib.mjs';

const BOOTSTRAP_TITLE = '★ 首次装工具链不出执行缝：bootstrap 不依赖可写根与部署 mode';
const PNPM_TITLE = '★ pnpm 的 cache/state 钉在运行时根（执行缝里跑也不写 HOME）';

function bootstrapGaps() {
  const gaps = [];
  const route = read(pkg('../adapter-probe/src/preflight-route.ts'));
  const toolchain = read(pkg('../adapter-probe/src/toolchain.ts'));
  if (!route.includes('runBootstrapCommand')) gaps.push('preflight-route 没用 runBootstrapCommand');
  if (!/\binstall:\s*\(\)\s*=>/.test(route)) gaps.push('preflight-route 没把 install 覆盖掉');
  if (route.includes('runShell(')) gaps.push('preflight-route 还在走执行缝');
  if (!toolchain.includes('bootstrapEnv(')) gaps.push('provisionLocalPnpmSync 没钉自举环境');
  const runner = read(pkg('../adapter-probe/src/bootstrap-run.ts'));
  if (/process\.platform|versions\.electron/.test(runner)) gaps.push('bootstrap-run 自己判平台（走 platform.ts）');
  return gaps;
}

function pnpmGaps() {
  const gaps = [];
  const source = read(pkg('../adapter-supply/src/plugin-source.ts'));
  const runtime = read(pkg('../adapter-runtime/src/cli/opencli-runtime.ts'));
  if (!source.includes('pnpmIsolationFlags')) gaps.push('plugin-source 的 pnpm add 没钉 cache/state');
  if (!runtime.includes('pnpmIsolationFlags')) gaps.push('opencli-runtime 没定义 isolation flags');
  const used = (runtime.match(/pnpmIsolationFlags\(\)/g) ?? []).length;
  if (used < 2) gaps.push('两个 opencli 安装命令没都用上 isolation flags');
  return gaps;
}

export const checks = [
  {
    title: BOOTSTRAP_TITLE,
    run(_ctx, report) {
      const gaps = bootstrapGaps();
      report(BOOTSTRAP_TITLE, gaps.length === 0, gaps.length === 0 ? '安装 / provision 都出缝' : gaps.join('、'));
    },
  },
  {
    title: PNPM_TITLE,
    run(_ctx, report) {
      const gaps = pnpmGaps();
      report(PNPM_TITLE, gaps.length === 0, gaps.length === 0 ? 'cache / state 都在运行时根里' : gaps.join('、'));
    },
  },
];
