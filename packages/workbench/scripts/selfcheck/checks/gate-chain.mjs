import { join } from 'node:path';

import { PKG, read } from '../lib.mjs';

export const checks = [
  {
    title:
      '★ 门禁链不漂：包内那条 check 是把仓库根那条跑起来（不许自己串一份短的 —— 会漏 lint / 文档 / 模块判据）',
    run(_ctx, report) {

      const ownCheckChain = JSON.parse(read(join(PKG, 'package.json'))).scripts.check ?? '';
      report(
        '★ 门禁链不漂：包内那条 check 是把仓库根那条跑起来（不许自己串一份短的 —— 会漏 lint / 文档 / 模块判据）',
        /(?:^|\s)pnpm\s+(?:-w|--workspace-root)\s+run\s+check(?:\s|$)/.test(ownCheckChain),
        ownCheckChain,
      );
    },
  },
];
