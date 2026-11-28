import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  capabilityOf,
  derived,
  emptyWorld,
  installedModule,
  installedPlugin,
  marketSource,
  panelUnit,
  projectRoute,
  transport,
  workspacePanel,
  world,
  type World,
} from '../../index';
import { CHANGES_ROUTE, READ_ROUTES } from '../routes';

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'goldens');
const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface GoldenCase {
  readonly id: string;
  readonly world: World;
  readonly query?: string;
}

const CASES: readonly GoldenCase[] = [
  { id: 'empty', world: emptyWorld() },
  {
    id: 'installed',
    world: world({
      provenance: derived('empty', ['machine.modules', 'machine.capabilities', 'workspaces', 'market.sources']),
      modules: [
        installedModule('issues', { sourceId: 'registry', latest: '0.2.0' }),
        installedModule('builds'),
      ],
      capabilities: [capabilityOf('issues'), capabilityOf('builds', 'unchecked')],
      plugins: [installedPlugin('@fixture/notes', { name: 'notes' })],
      workspaces: [
        workspacePanel('w1', [panelUnit('issues'), panelUnit('builds', false)], {
          path: '/repo',
          plugins: [{ pkg: '@fixture/notes', shown: true }],
          defaults: ['issues'],
        }),
      ],
      market: { sources: [marketSource('registry', { registry: 'https://registry.invalid/' })] },
    }),
    query: '/repo',
  },
  {
    id: 'manifests-failed',
    world: world({
      provenance: derived('installed', ['faults.unit-manifests']),
      modules: [installedModule('issues', { sourceId: 'registry' })],
      capabilities: [capabilityOf('issues')],
      workspaces: [workspacePanel('w1', [panelUnit('issues')], { path: '/repo' })],
      faults: { 'unit-manifests': { kind: 'http', status: 503 } },
    }),
    query: '/repo',
  },
];

const ROUTES: readonly string[] = READ_ROUTES.filter((route) => route !== CHANGES_ROUTE);

function goldenPath(id: string, route: string): string {
  return join(GOLDENS, id, `${route.replaceAll('/', '-')}.json`);
}

function valueOf(item: GoldenCase, route: string): unknown {
  return projectRoute(item.world, route);
}

describe('契约 golden：每个场景 × 每条接管读口', () => {
  for (const item of CASES) {
    for (const route of ROUTES) {
      it(`${item.id} / ${route}`, () => {
        const actual = `${JSON.stringify(valueOf(item, route), null, 2)}\n`;
        const file = goldenPath(item.id, route);
        if (UPDATE || !existsSync(file)) {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, actual);
        }
        expect(actual).toBe(readFileSync(file, 'utf8'));
      });
    }
  }

  it('★ 所有 golden 都有 provenance 可追（不是凭空生成）', () => {
    for (const item of CASES) {
      expect(['captured', 'derived', 'fault', 'transport']).toContain(item.world.provenance.kind);
    }
    expect(emptyWorld().provenance.kind).toBe('transport');
    expect(world({ provenance: transport('golden') }).provenance.kind).toBe('transport');
  });
});
