import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bundleInspectOf,
  bundleRegistriesOf,
  capabilityPayloadOf,
  installedPluginsOf,
  marketInstalledOf,
  moduleVersionsOf,
  panelsOf,
  unitManifestsOf,
  validateWorld,
  worldOfCaptured,
  type CapturedHost,
} from '../index';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPTURE = join(HERE, '..', '..', 'captures', 'real-host');

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(CAPTURE, name), 'utf8')) as T;
}

const captured: CapturedHost = {
  meta: read('meta.json'),
  unitManifests: read('unit-manifests.json'),
  moduleVersions: read('module-versions.json'),
  panels: read('panels.json'),
  capability: read('capability.json'),
  marketInstalled: read('market-installed.json'),
  installedPlugins: read('installed-plugins.json'),
  bundleRegistries: read('bundle-registries.json'),
  bundleInspect: read('bundle-inspect.json'),
  bundleInspectSpec: '@dsh-workbench/module-hello',
};

describe('真实宿主 parity：从捕获的响应反建世界，再逐条投影', () => {
  const world = worldOfCaptured(captured);

  it('世界本身合法', () => {
    expect(validateWorld(world)).toEqual({ ok: true });
  });

  it('★ unit-manifests：清单、可装、refusals 与真宿主逐字段一致', () => {
    expect(unitManifestsOf(world)).toEqual(captured.unitManifests);
  });

  it('★ module-versions：模块行与工作台本体行一致', () => {
    expect(moduleVersionsOf(world)).toEqual(captured.moduleVersions);
  });

  it('★ panels：顺序、shown、source、hasCard 一致', () => {
    expect(panelsOf(world)).toEqual(captured.panels);
  });

  it('capability：空表也一致', () => {
    expect(capabilityPayloadOf(world)).toEqual(captured.capability);
  });

  it('market-installed：本地模块不进市场已装，与真宿主一致', () => {
    expect(marketInstalledOf(world)).toEqual(captured.marketInstalled);
  });

  it('installed-plugins：空表也一致', () => {
    expect(installedPluginsOf(world)).toEqual(captured.installedPlugins);
  });

  it('bundle-registries：可用性与解析结果一致', () => {
    expect(bundleRegistriesOf(world)).toEqual(captured.bundleRegistries);
  });

  it('bundle-inspect：已装拒绝的信封一致', () => {
    expect(bundleInspectOf(world, captured.bundleInspectSpec)).toEqual(captured.bundleInspect);
  });
});
