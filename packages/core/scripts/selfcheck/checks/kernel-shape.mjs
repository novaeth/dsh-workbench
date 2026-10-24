import { existsSync } from 'node:fs';

import { pkg } from '../lib.mjs';

const EXPECTED = [
  'src/kernel/host/unit-registry.ts',
  'src/kernel/host/mount-units.ts',
  'src/kernel/host/unit-readiness.ts',
  'src/kernel/client/registry.ts',
  'src/kernel/client/board-registry.ts',
];

const STALE = [
  'src/app/units/registry.ts',
  'src/shared/api/host/unit-registry.ts',
  'src/shared/api/host/mount-units.ts',
  'src/shared/api/host/unit-readiness.ts',
  'src/app/layouts/rightbar/registry.ts',
];

export const checks = [
  {
    title: '★ 内核住 kernel/host + kernel/client，旧位置不再住内核',
    run(_ctx, report) {
      const missing = EXPECTED.filter((rel) => !existsSync(pkg(rel)));
      const stale = STALE.filter((rel) => existsSync(pkg(rel)));
      const detail = [
        missing.length === 0 ? '' : `缺：${missing.join(' / ')}`,
        stale.length === 0 ? '' : `旧位置又出现：${stale.join(' / ')}`,
      ]
        .filter(Boolean)
        .join('；');
      report(
        '★ 内核住 kernel/host + kernel/client，旧位置不再住内核',
        missing.length === 0 && stale.length === 0,
        detail || '两个运行时内核各就各位',
      );
    },
  },
];
