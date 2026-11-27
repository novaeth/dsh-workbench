import { sweepProbes } from '../../../../scripts/selfcheck-sweep.mjs';
import { reportAndExit } from '../../../../scripts/selfcheck-report.mjs';
import * as host from './checks/host.mjs';
import * as client from './checks/client.mjs';
import * as kitFace from './checks/kit-face.mjs';
import * as skillRefs from './checks/skill-refs.mjs';
import * as skillEntry from './checks/skill-entry.mjs';
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
import * as diySkillCoverage from './checks/diy-skill-coverage.mjs';
import * as diyTools from './checks/diy-tools.mjs';
import * as gateChain from './checks/gate-chain.mjs';
import * as kernelShape from './checks/kernel-shape.mjs';
import * as platform from './checks/platform.mjs';
import * as testPathLiterals from './checks/test-path-literals.mjs';
import * as platformCi from './checks/platform-ci.mjs';
import * as marketSeam from './checks/market-seam.mjs';
import * as bootstrapSeam from './checks/bootstrap-seam.mjs';
import * as seamIntent from './checks/seam-intent.mjs';
import * as toolOutput from './checks/tool-output.mjs';
import * as faultExits from './checks/fault-exits.mjs';

const ENTRY_CHECKS = [
  host,
  client,
  kitFace,
  skillRefs,
  skillEntry,
  slots,
];

const PANEL_CHECKS = [
  cssHygiene,
  cardReporting,
  wiring,
  shellArtifacts,
  shellScripts,
  rightbarWire,
  workshop,
  workshopWiring,
  diyEntry,
  diySkillCoverage,
  diyTools,
];

const SYSTEM_CHECKS = [
  gateChain,
  kernelShape,
  platform,
  testPathLiterals,
  platformCi,
  marketSeam,
  bootstrapSeam,
  seamIntent,
  faultExits,
  toolOutput,
];

const MODULES = [...ENTRY_CHECKS, ...PANEL_CHECKS, ...SYSTEM_CHECKS];

const results = [];
const report = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  const mark = passed ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
};

const onlyAt = process.argv.indexOf('--only');
const only = onlyAt === -1 ? undefined : new RegExp(process.argv[onlyAt + 1] ?? '', 'u');

const wantedTags = [];
for (let index = 0; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === '--tag') wantedTags.push(process.argv[index + 1] ?? '');
  else if (arg.startsWith('--tag=')) wantedTags.push(arg.slice('--tag='.length));
}
const tags = wantedTags
  .flatMap((one) => one.split(','))
  .map((one) => one.trim())
  .filter((one) => one !== '');
const selected = (check) => {
  if (only !== undefined && !only.test(check.title)) return false;
  if (tags.length === 0) return true;
  const own = Array.isArray(check.tags) ? check.tags : [];
  return tags.some((tag) => own.includes(tag));
};

const selectedChecks = MODULES.flatMap((module) => (module.checks ?? []).filter(selected));
if (selectedChecks.length === 0) {
  console.error(`✖ 没有判据匹配筛选条件（--only ${only === undefined ? '无' : String(only)} / --tag ${tags.join(',') || '无'}）`);
  process.exit(2);
}

sweepProbes();

const ctx = {};
for (const check of selectedChecks) {
  try {
    const out = check.run(ctx, report);
    if (out !== undefined && typeof out.then === 'function') await out;
  } catch (error) {
    report(
      check.title,
      false,
      `这条判据自己抛了（别的判据继续跑）：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

reportAndExit(results);