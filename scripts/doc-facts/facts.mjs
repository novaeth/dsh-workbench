import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT } from './lib.mjs';
import { GATE_STEPS } from '../gate/steps.mjs';

export function gateSteps() {
  return GATE_STEPS.map((step) => ({ name: step.name, arg: (step.args ?? []).join(' ') }));
}

export function workspacePackages() {
  return readdirSync(join(ROOT, 'packages'))
    .filter((entry) => statSync(join(ROOT, 'packages', entry)).isDirectory())
    .map((entry) => {
      const dir = `packages/${entry}`;
      const manifestPath = join(ROOT, dir, 'package.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        return { dir, manifest };
      } catch {
        return undefined;
      }
    })
    .filter((one) => one !== undefined && typeof one.manifest.name === 'string')
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

export function packageByName(name) {
  return workspacePackages().find((one) => one.manifest.name === name);
}

export async function coreArchRules() {
  const url = pathToFileURL(join(ROOT, 'packages/core/arch.config.mjs')).href;
  const config = (await import(url)).default;
  const rules = config.overrides?.customRules ?? [];
  const seen = new Set();
  const out = [];
  for (const rule of rules) {
    if (typeof rule.id !== 'string' || !/^S\d+$/.test(rule.id)) continue;
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push({ id: rule.id, title: rule.title });
  }
  return out.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

export function sharedExports() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages/shared/package.json'), 'utf8'));
  return Object.keys(pkg.exports ?? {}).filter((key) => key !== './package.json');
}
