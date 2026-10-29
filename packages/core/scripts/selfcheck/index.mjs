import * as host from './checks/host.mjs';
import * as client from './checks/client.mjs';
import * as kitFace from './checks/kit-face.mjs';
import * as slots from './checks/slots.mjs';
import * as cssHygiene from './checks/css-hygiene.mjs';
import * as cardReporting from './checks/card-reporting.mjs';
import * as wiring from './checks/wiring.mjs';
import * as shellArtifacts from './checks/shell-artifacts.mjs';
import * as shellScripts from './checks/shell-scripts.mjs';
import * as rightbarWire from './checks/rightbar-wire.mjs';
import * as workshop from './checks/workshop.mjs';
import * as workshopWiring from './checks/workshop-wiring.mjs';
import * as diyEntry from './checks/diy-entry.mjs';
import * as diyTools from './checks/diy-tools.mjs';
import * as gateChain from './checks/gate-chain.mjs';
import * as kernelShape from './checks/kernel-shape.mjs';
import * as platform from './checks/platform.mjs';
import * as marketSeam from './checks/market-seam.mjs';

const MODULES = [
  host,
  client,
  kitFace,
  slots,
  cssHygiene,
  cardReporting,
  wiring,
  shellArtifacts,
  shellScripts,
  rightbarWire,
  workshop,
  workshopWiring,
  diyEntry,
  diyTools,
  gateChain,
  kernelShape,
  platform,
  marketSeam,
];

const results = [];
const report = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  const mark = passed ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ctx = {};
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
