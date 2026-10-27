import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGES_DIR, findToolchain } from './lib.mjs';
import * as golden from './checks/golden.mjs';
import * as scaffold from './checks/scaffold.mjs';
import * as cardsShape from './checks/cards-shape.mjs';
import * as kitUsage from './checks/kit-usage.mjs';
import * as primitivesFace from './checks/primitives-face.mjs';
import * as styleShape from './checks/style-shape.mjs';
import * as declaration from './checks/declaration.mjs';
import * as cardContent from './checks/card-content.mjs';
import * as cardsNegative from './checks/cards-negative.mjs';
import * as publish from './checks/publish.mjs';
import * as release from './checks/release.mjs';
import * as changelog from './checks/changelog.mjs';
import * as negativeProbe from './checks/negative-probe.mjs';
import * as archGate from './checks/arch-gate.mjs';
import * as lintGate from './checks/lint-gate.mjs';
import * as protocol from './checks/protocol.mjs';
import * as approval from './checks/approval.mjs';
import * as runtimeShape from './checks/runtime-shape.mjs';
import * as artifacts from './checks/artifacts.mjs';
import * as meta from './checks/meta.mjs';
import * as commentGate from './checks/comment-gate.mjs';
import * as recipes from './checks/recipes.mjs';
import * as marketIndex from './checks/market-index.mjs';

const MODULES = [
  golden,
  scaffold,
  cardsShape,
  kitUsage,
  primitivesFace,
  styleShape,
  declaration,
  cardContent,
  cardsNegative,
  publish,
  release,
  changelog,
  negativeProbe,
  archGate,
  lintGate,
  protocol,
  approval,
  runtimeShape,
  artifacts,
  meta,
  commentGate,
  recipes,
  marketIndex,
];

const staleProbes = readdirSync(PACKAGES_DIR).filter((entry) => entry.startsWith('.'));
for (const entry of staleProbes) rmSync(join(PACKAGES_DIR, entry), { recursive: true, force: true });
if (staleProbes.length > 0) {
  console.log(`（上一次跑留下的探针已清掉 ${staleProbes.length} 个：${staleProbes.join('、')}）`);
}

const toolchain = findToolchain();
if (toolchain === undefined) {
  console.error('✖ 找不到一个装好依赖的模块包来借 node_modules —— 先在仓库根跑一次 pnpm install');
  process.exit(2);
}

const results = [];
const report = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ctx = { toolchain };
for (const module of MODULES) {
  for (const check of module.checks ?? []) {
    const out = check.run(ctx, report);
    if (out !== undefined && typeof out.then === 'function') await out;
  }
}

const failed = results.filter((one) => !one.passed);
console.log(
  `\n${results.length - failed.length}/${results.length} 通过` +
    (failed.length ? ` —— 失败：${failed.map((one) => one.name).join('、')}` : ''),
);
process.exit(failed.length === 0 ? 0 : 1);
