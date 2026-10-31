import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT } from './lib.mjs';

export function gateSteps() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const chain = pkg.scripts?.check;
  if (typeof chain !== 'string') throw new Error('根 package.json 缺 scripts.check');
  return chain.split(' && ').map(stepOf);
}

function stepOf(segment) {
  const text = segment.trim();
  const pnpm = text.match(/^pnpm(?: -w)? run ([^\s]+)(?: -- (.+))?$/);
  if (pnpm !== null) return { name: pnpm[1], arg: pnpm[2] ?? '' };
  const node = text.match(/^node (scripts\/[^\s]+)$/);
  if (node !== null) return { name: node[1], arg: '' };
  return { name: text, arg: '' };
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
