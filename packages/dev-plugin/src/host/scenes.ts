import type { UnitManifest } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import {
  emptyWorld,
  transport,
  world,
  type BundleState,
  type CapabilityRow,
  type CatalogState,
  type Faults,
  type InstalledModule,
  type WorkbenchState,
  type World,
  type Writes,
} from '@dsh-workbench/testkit';
import addModuleScenes from './scenes/add-module.json';
import bootGateScenes from './scenes/boot-gate.json';
import marketScenes from './scenes/market.json';
import panelScenes from './scenes/panel.json';

interface GeneratedModule {
  readonly unit: string;
  readonly pkg: string;
  readonly title: { readonly zh: string; readonly en?: string };
  readonly installed: string;
  readonly latest?: string;
  readonly local?: boolean;
  readonly refused?: readonly string[];
  readonly manifest: UnitManifest;
  readonly packageModule: boolean;
  readonly installable: boolean;
}

interface GeneratedScene {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly group?: string | undefined;
  readonly catalog: CatalogState;
  readonly modules: readonly GeneratedModule[];
  readonly workbench: WorkbenchState;
  readonly panels: {
    readonly units: readonly { readonly id: string; readonly shown: boolean; readonly source: 'default' | 'user'; readonly order?: number; readonly hasCard?: boolean }[];
    readonly plugins: readonly { readonly pkg: string; readonly title?: string; readonly shown: boolean; readonly source: 'default' | 'user'; readonly name?: string }[];
    readonly defaults: readonly string[];
    readonly own: boolean;
    readonly changed: Readonly<Record<string, number>>;
  };
  readonly plugins: readonly { readonly pkg: string; readonly name?: string }[];
  readonly unreadable?: readonly { readonly pkg: string; readonly reason: string }[];
  readonly capabilities: readonly CapabilityRow[];
  readonly preflight: PreflightSnapshot;
  readonly faults: Faults;
  readonly writes: Writes;
  readonly bundle?: BundleState;
}

interface GeneratedFile {
  readonly scenes: readonly GeneratedScene[];
}

const data = {
  scenes: [...marketScenes, ...panelScenes, ...addModuleScenes, ...bootGateScenes],
} as unknown as GeneratedFile;

export interface Scene {
  readonly id: string;
  readonly label: string;
  readonly note?: string | undefined;
  readonly group?: string | undefined;
  readonly world: World;
}

const generated: readonly Scene[] = data.scenes.map((item) => ({
  id: item.id,
  label: item.label,
  note: item.note,
  ...(item.group === undefined ? {} : { group: item.group }),
  world: world({
    provenance: transport('由 dev-fixtures 旧场景反建（2026-11-28）'),
    modules: item.modules as readonly InstalledModule[],
    plugins: item.plugins,
    capabilities: item.capabilities,
    workbench: item.workbench,
    preflight: item.preflight,
    catalog: item.catalog,
    workspaces: [
      {
        id: 'legacy',
        path: '/repo',
        units: item.panels.units.map((row) => ({ unit: row.id, shown: row.shown, source: row.source, ...(row.order === undefined ? {} : { order: row.order }), ...(row.hasCard === undefined ? {} : { hasCard: row.hasCard }) })),
        plugins: item.panels.plugins.map((row) => ({ pkg: row.pkg, ...(row.title === undefined ? {} : { title: row.title }), shown: row.shown, source: row.source })),
        defaults: item.panels.defaults,
        changed: item.panels.changed,
        own: item.panels.own,
      },
    ],
    faults: item.faults,
    writes: item.writes,
    ...(item.bundle === undefined ? {} : { bundle: item.bundle }),
    ...(item.unreadable === undefined ? {} : { unreadable: item.unreadable }),
  }),
}));

export const REAL_SCENE: Scene = {
  id: 'real',
  label: '真实（走真宿主）',
  note: '不接管：所有路由回到真宿主',
  world: emptyWorld(),
};

export const SCENES: readonly Scene[] = [...generated, REAL_SCENE];

export function sceneById(id: string): Scene | undefined {
  return SCENES.find((scene) => scene.id === id);
}
