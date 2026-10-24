import { sourceIndex } from '../lib.mjs';

const ADAPTERS = [
  'adapters/probe/platform.ts',
  'kernel/contract/platform.ts',
  'contract/protocol/platform.ts',
  'adapters/probe/self-update.ts',
  'adapters/probe/toolchain.ts',
  'adapters/probe/browser-wake.ts',
  'adapters/probe/runtime-seed.ts',
  'shared/api/platform/client.ts',
  'shared/api/platform/contract.ts',
  'adapters/opencli/shell-text.ts',
  'adapters/opencli/opencli-runtime.ts',
  'host/platform.ts',
  'host/shell-text.ts',
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
        hits.length === 0 ? '只在 adapters/probe/platform、adapters/probe/toolchain、platform/client 与测试里' : hits.join(' · '),
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
        hits.length === 0 ? '只在 adapters/probe/platform、toolchain、browser-wake、self-update、runtime-seed 与 client 契约里' : hits.join(' · '),
      );
    },
  },
];
