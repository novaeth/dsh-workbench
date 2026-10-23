import { sourceIndex } from '../lib.mjs';

const ADAPTERS = [
  'shared/api/host/platform.ts',
  'shared/api/host/toolchain.ts',
  'shared/api/host/browser-wake.ts',
  'shared/api/host/self-update.ts',
  'shared/api/host/runtime-seed.ts',
  'shared/api/platform/client.ts',
  'shared/api/platform/contract.ts',
  'host/shell-text.ts',
  'host/opencli-runtime.ts',
];

function normal(name) {
  return name.replaceAll('\\', '/');
}

function isAdapter(name) {
  return ADAPTERS.some((suffix) => name.endsWith(suffix));
}

function isTest(name) {
  return name.includes('/__tests__/') || /\.test\.[cm]?[jt]sx?$/.test(name);
}

export const checks = [
  {
    title: '★ Desktop/Electron 的原始事实只在平台适配器里读（业务代码只许问能力）',
    run(_ctx, report) {
      const hits = [];
      for (const { name, source } of sourceIndex()) {
        const file = normal(name);
        if (isAdapter(file) || isTest(file)) continue;
        for (const line of source.split('\n')) {
          if (line.includes('versions.electron') || line.includes('dshDesktop')) {
            hits.push(`${file}: ${line.trim()}`);
          }
        }
      }
      report(
        '★ Desktop/Electron 的原始事实只在平台适配器里读（业务代码只许问能力）',
        hits.length === 0,
        hits.length === 0 ? '只在 host/platform、host/toolchain、platform/client 与测试里' : hits.join(' · '),
      );
    },
  },
  {
    title: '★ 宿主 OS 的原始判定只在平台适配器里读（业务代码只问 capabilities）',
    run(_ctx, report) {
      const hits = [];
      for (const { name, source } of sourceIndex()) {
        const file = normal(name);
        if (isAdapter(file) || isTest(file)) continue;
        for (const line of source.split('\n')) {
          if (line.includes('process.platform') || line.includes('hostOs')) {
            hits.push(`${file}: ${line.trim()}`);
          }
        }
      }
      report(
        '★ 宿主 OS 的原始判定只在平台适配器里读（业务代码只问 capabilities）',
        hits.length === 0,
        hits.length === 0 ? '只在 host/platform、toolchain、browser-wake、self-update、runtime-seed 与 client 契约里' : hits.join(' · '),
      );
    },
  },
];
