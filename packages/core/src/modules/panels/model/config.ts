import type { UnitManifest } from '@dsh-workbench/shared/host';

export type PanelList = readonly string[];

export interface PanelBoard {
  readonly shown: PanelList;
  readonly hidden: PanelList;
  readonly order?: PanelList | undefined;
}

export const EMPTY_BOARD: PanelBoard = { shown: [], hidden: [] };

export interface ScopeBoards {
  readonly workspace: PanelBoard | null;
  readonly machine: PanelBoard | null;
}

export type BoardTarget = 'machine' | 'workspace';

export const BOARD_TARGETS: readonly BoardTarget[] = ['workspace', 'machine'];

export const DEFAULT_BOARD_TARGET: BoardTarget = 'workspace';

export interface ScopeQuery {
  readonly id: string;
  readonly boards: ScopeBoards;
}

export function overrideOf(board: PanelBoard | null, id: string): boolean | undefined {
  if (board === null) return undefined;
  if (board.hidden.includes(id)) return false;
  if (board.shown.includes(id)) return true;
  return undefined;
}

export function defaultOf(board: PanelBoard | null, id: string): boolean {
  if (board === null) return false;
  if (board.hidden.includes(id)) return false;
  return board.shown.includes(id);
}

export function resolveScope(query: ScopeQuery): boolean {
  const { id, boards } = query;
  const own = overrideOf(boards.workspace, id);
  return own ?? defaultOf(boards.machine, id);
}

export interface PanelEntry {
  readonly id: string;
  readonly titleKey: string;
  readonly order: number;
  readonly shown: boolean;
  readonly source: 'default' | 'user';
  readonly hasCard: boolean;
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

export function parseBoard(raw: unknown): PanelBoard {
  if (typeof raw !== 'object' || raw === null) return EMPTY_BOARD;
  const value = raw as { shown?: unknown; hidden?: unknown; order?: unknown };
  const order = strings(value.order);
  return {
    shown: strings(value.shown),
    hidden: strings(value.hidden),
    ...(order.length === 0 ? {} : { order }),
  };
}

export function parseReleased(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  return strings((raw as { ids?: unknown }).ids);
}

export function resolvePanels(
  manifests: readonly UnitManifest[],
  boards: ScopeBoards,
  owned: ReadonlySet<string> = new Set(),
): PanelEntry[] {
  const listed = manifests.filter(
    (manifest) => manifest.card !== null || !owned.has(manifest.id),
  );
  const carded = listed.filter((manifest) => manifest.card !== null);
  const declared = (manifest: UnitManifest): number => manifest.card?.order ?? 0;
  const byDeclared = (a: UnitManifest, b: UnitManifest): number =>
    declared(a) - declared(b) || a.id.localeCompare(b.id);
  const queued = [...new Set(boards.workspace?.order ?? [])]
    .map((id) => carded.find((manifest) => manifest.id === id))
    .filter((manifest): manifest is UnitManifest => manifest !== undefined)
    .filter((manifest) => resolveScope({ id: manifest.id, boards }));
  const placed = new Set(queued.map((manifest) => manifest.id));
  const ordered = [
    ...queued,
    ...carded
      .filter((manifest) => !placed.has(manifest.id) && resolveScope({ id: manifest.id, boards }))
      .sort(byDeclared),
  ];
  const rank = new Map(ordered.map((manifest, index) => [manifest.id, index]));

  return listed
    .map((manifest) => {
      const hasCard = manifest.card !== null;
      const on = resolveScope({ id: manifest.id, boards });
      const order = hasCard
        ? (rank.get(manifest.id) ?? ordered.length + declared(manifest))
        : 0;
      return {
        id: manifest.id,
        titleKey: manifest.card?.titleKey ?? manifest.id,
        order,
        shown: on,
        source: (overrideOf(boards.workspace, manifest.id) === undefined ? 'default' : 'user') as
          | 'default'
          | 'user',
        hasCard,
      };
    })
    .sort((a, b) => {
      if (a.hasCard !== b.hasCard) return a.hasCard ? -1 : 1;
      return a.order - b.order || a.id.localeCompare(b.id);
    });
}

export interface PanelPluginRef {
  readonly pkg: string;
  readonly title: string;
  readonly name?: string | undefined;
}

export interface PanelPluginEntry {
  readonly id: string;
  readonly pkg: string;
  readonly title: string;
  readonly name?: string | undefined;
  readonly order: number;
  readonly shown: boolean;
  readonly source: 'default' | 'user';
}

export const PLUGIN_PANEL_PREFIX = 'plugin:';

export function pluginPanelId(pkg: string): string {
  return `${PLUGIN_PANEL_PREFIX}${pkg}`;
}

export function resolvePluginPanels(
  plugins: readonly PanelPluginRef[],
  boards: ScopeBoards,
): PanelPluginEntry[] {
  const ordered = [...new Set(boards.workspace?.order ?? [])];
  const rank = new Map(ordered.map((id, index) => [id, index]));
  const seen = new Set<string>();

  return plugins
    .map((plugin) => {
      const id = pluginPanelId(plugin.pkg);
      return {
        id,
        pkg: plugin.pkg,
        title: plugin.title,
        ...(plugin.name === undefined ? {} : { name: plugin.name }),
        order: rank.get(id) ?? ordered.length,
        shown: resolveScope({ id, boards }),
        source: (overrideOf(boards.workspace, id) === undefined ? 'default' : 'user') as
          | 'default'
          | 'user',
      };
    })
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => a.order - b.order || a.pkg.localeCompare(b.pkg));
}

export function withoutReleased(released: PanelList, id: string): string[] {
  return released.filter((item) => item !== id);
}

export function withReleased(released: PanelList, id: string): string[] {
  return [...new Set([...released, id])];
}

function added(list: PanelList, id: string): string[] {
  return list.includes(id) ? [...list] : [...list, id];
}

function dropped(list: PanelList, id: string): string[] {
  return list.filter((item) => item !== id);
}

export function withShown(board: PanelBoard, id: string, visible?: PanelList): PanelBoard {
  const next = { shown: added(board.shown, id), hidden: dropped(board.hidden, id) };
  return visible === undefined ? next : { ...next, order: added(board.order ?? visible, id) };
}

export function withHidden(board: PanelBoard, id: string): PanelBoard {
  const order = dropped(board.order ?? [], id);
  return {
    shown: dropped(board.shown, id),
    hidden: added(board.hidden, id),
    ...(order.length === 0 ? {} : { order }),
  };
}

export function withoutPanel(board: PanelBoard, id: string): PanelBoard {
  return { shown: dropped(board.shown, id), hidden: dropped(board.hidden, id) };
}

export function withMoved(
  board: PanelBoard,
  id: string,
  index: number,
  visible: PanelList,
): PanelBoard {
  const current = visible.includes(id) ? [...visible] : [...visible, id];
  const from = current.indexOf(id);
  const to = Math.max(0, Math.min(current.length - 1, Math.trunc(index)));
  if (from !== to) current.splice(to, 0, ...current.splice(from, 1));
  return { shown: added(board.shown, id), hidden: dropped(board.hidden, id), order: current };
}
