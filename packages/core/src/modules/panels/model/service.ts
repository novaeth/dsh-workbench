import type { ModuleStore, WorkspaceStore } from '@dsh-workbench/shared/host';
import type { UnitManifest } from '@dsh-workbench/shared';
import {
  DEFAULT_BOARD_TARGET,
  EMPTY_BOARD,
  parseBoard,
  parseReleased,
  pluginPanelId,
  resolvePanels,
  resolvePluginPanels,
  resolveScope,
  withHidden,
  withMoved,
  withReleased,
  withShown,
  withoutPanel,
  withoutReleased,
  type BoardTarget,
  type PanelBoard,
  type PanelEntry,
  type PanelList,
  type PanelPluginEntry,
  type PanelPluginRef,
  type ScopeBoards,
} from './config';

export const PANELS_MODULE_ID = 'panels';

export const PANELS_FILE = 'config.json';

export const RELEASED_FILE = 'released.json';

export interface PanelsService {
  list(workspace: string | null, target?: BoardTarget): PanelEntry[];
  listPlugins(workspace: string | null, target?: BoardTarget): PanelPluginEntry[];
  boards(workspace: string | null): ScopeBoards;
  isReleased(id: string): boolean;
  release(id: string): void;
  accept(id: string): void;
  subscribe(listener: () => void): () => void;
  isEnabled(id: string, workspace: string | null): boolean;

  show(id: string, workspace: string | null, target?: BoardTarget): PanelEntry[];
  hide(id: string, workspace: string | null, target?: BoardTarget): PanelEntry[];
  move(id: string, index: number, workspace: string | null, target?: BoardTarget): PanelEntry[];
  reset(workspace: string | null, target?: BoardTarget): PanelEntry[];
  follow(workspace: string | null, id?: string): PanelEntry[];
  changedBy(): ReadonlyMap<string, number>;
}

export function createPanelsService(options: {
  manifests: () => readonly UnitManifest[];
  store: WorkspaceStore;
  owned?: (() => readonly string[]) | undefined;
  plugins?: (() => readonly PanelPluginRef[]) | undefined;
  logger?: { warn?(message: string): void } | undefined;
}): PanelsService {
  const { manifests, store, owned, logger } = options;
  const listeners = new Set<() => void>();

  const machine = store.machine(PANELS_MODULE_ID);

  const folders = new Map<string, ModuleStore>();

  function folderOf(workspace: string): ModuleStore {
    const hit = folders.get(workspace);
    if (hit !== undefined) return hit;
    const folder = store.for(PANELS_MODULE_ID, workspace);
    folders.set(workspace, folder);
    return folder;
  }

  function readBoard(folder: ModuleStore): PanelBoard | null {
    const raw = folder.read(PANELS_FILE);
    return raw === null ? null : parseBoard(raw);
  }

  function boardIn(folder: ModuleStore): PanelBoard {
    return readBoard(folder) ?? EMPTY_BOARD;
  }

  function writeBoard(folder: ModuleStore, next: PanelBoard): void {
    const order = next.order ?? [];
    folder.write(PANELS_FILE, {
      shown: next.shown,
      hidden: next.hidden,
      ...(order.length === 0 ? {} : { order }),
    });
  }

  function boardsOf(workspace: string | null): ScopeBoards {
    const key = workspace?.trim() ?? '';
    return {
      workspace: key === '' ? null : readBoard(folderOf(key)),
      machine: readBoard(machine),
    };
  }

  function targetOf(
    target: BoardTarget,
    workspace: string | null,
  ): { folder: ModuleStore; key: string | null } {
    if (target === 'machine') return { folder: machine, key: null };
    const key = requireWorkspace(workspace);
    return { folder: folderOf(key), key };
  }

  let released: PanelList | undefined;

  function readReleased(): PanelList {
    released ??= parseReleased(machine.read(RELEASED_FILE));
    return released;
  }

  function writeReleased(next: PanelList): void {
    released = next;
    if (next.length === 0) machine.remove(RELEASED_FILE);
    else machine.write(RELEASED_FILE, { ids: next });
  }

  function ownedSet(): ReadonlySet<string> {
    return new Set(owned?.() ?? []);
  }

  function notify(): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        logger?.warn?.(`[dsh-workbench] 面板配置订阅者报错：${String(error)}`);
      }
    }
  }

  function withPersisted(folder: ModuleStore, next: PanelBoard, key: string | null): PanelEntry[] {
    writeBoard(folder, next);
    notify();
    return resolvePanels(manifests(), boardsOf(key), ownedSet());
  }

  function takeBackReleased(id: string): void {
    const current = readReleased();
    if (!current.includes(id)) return;
    writeReleased(withoutReleased(current, id));
  }

  function requireKnown(id: string): void {
    const all = manifests();
    if (!all.some((manifest) => manifest.id === id)) {
      throw new Error(`没有这个套件：${id}（可用：${all.map((manifest) => manifest.id).join(', ')}）`);
    }
  }

  function pluginRefs(): readonly PanelPluginRef[] {
    return options.plugins?.() ?? [];
  }

  function pluginIds(): ReadonlySet<string> {
    return new Set(pluginRefs().map((plugin) => pluginPanelId(plugin.pkg)));
  }

  function requireSwitchable(id: string): void {
    if (pluginIds().has(id)) return;
    requireKnown(id);
    const manifest = manifests().find((item) => item.id === id);
    if (manifest?.card === null && ownedSet().has(id)) {
      throw new Error(`${id} 没有卡片，不能收起（它是把别的套件放回来的入口）`);
    }
  }

  function requireWorkspace(workspace: string | null): string {
    const key = workspace?.trim() ?? '';
    if (key === '') {
      throw new Error('这个会话不属于任何工作区：面板按工作区存，先打开或新建一个工作区');
    }
    return key;
  }

  function visibleOrder(workspace: string | null): string[] {
    return resolvePanels(manifests(), boardsOf(workspace), ownedSet())
      .filter((entry) => entry.shown && entry.hasCard)
      .map((entry) => entry.id);
  }

  return {
    list(workspace, target) {
      return resolvePanels(
        manifests(),
        target === 'machine' ? boardsOf(null) : boardsOf(workspace),
        ownedSet(),
      );
    },
    listPlugins(workspace, target) {
      return resolvePluginPanels(
        pluginRefs(),
        target === 'machine' ? boardsOf(null) : boardsOf(workspace),
      );
    },
    boards(workspace) {
      return boardsOf(workspace);
    },
    isEnabled(id, workspace) {
      if (!manifests().some((item) => item.id === id)) return false;
      if (owned?.().includes(id) === true) return true;
      return resolveScope({ id, boards: boardsOf(workspace) });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isReleased(id) {
      return readReleased().includes(id);
    },
    release(id) {
      writeReleased(withReleased(readReleased(), id));
      const seen = new Set<string>();
      const drop = (folder: ModuleStore): void => {
        seen.add(folder.dir);
        const current = readBoard(folder);
        if (current === null) return;
        if (!current.shown.includes(id) && !current.hidden.includes(id)) return;
        writeBoard(folder, withoutPanel(current, id));
      };
      for (const folder of store.scan(PANELS_MODULE_ID)) drop(folder);
      for (const folder of folders.values()) {
        if (!seen.has(folder.dir)) drop(folder);
      }
      drop(machine);
      notify();
    },
    accept(id) {
      takeBackReleased(id);
    },
    show(id, workspace, target) {
      requireSwitchable(id);
      const scope = target ?? DEFAULT_BOARD_TARGET;
      const { folder, key } = targetOf(scope, workspace);
      takeBackReleased(id);
      const board = withShown(
        boardIn(folder),
        id,
        key === null ? undefined : visibleOrder(key),
      );
      return withPersisted(folder, board, key);
    },
    hide(id, workspace, target) {
      requireSwitchable(id);
      const scope = target ?? DEFAULT_BOARD_TARGET;
      const { folder, key } = targetOf(scope, workspace);
      return withPersisted(folder, withHidden(boardIn(folder), id), key);
    },
    move(id, index, workspace, target) {
      requireSwitchable(id);
      const scope = target ?? DEFAULT_BOARD_TARGET;
      if (scope === 'machine') {
        throw new Error(
          '机器级默认板没有顺序这一说：它只回答"默认开哪几行"。顺序是每个工作区自己的 —— 要排顺序就用默认作用域的那一次 move（或面板里拖动）。',
        );
      }
      const { folder, key } = targetOf(scope, workspace);
      const current = boardIn(folder);
      if (!current.shown.includes(id)) takeBackReleased(id);
      return withPersisted(folder, withMoved(current, id, index, visibleOrder(key)), key);
    },
    reset(workspace, target) {
      const { folder, key } = targetOf(target ?? DEFAULT_BOARD_TARGET, workspace);
      return withPersisted(folder, EMPTY_BOARD, key);
    },
    changedBy() {
      const counts = new Map<string, number>();
      for (const folder of store.scan(PANELS_MODULE_ID)) {
        const board = readBoard(folder);
        if (board === null) continue;
        for (const id of new Set([...board.shown, ...board.hidden])) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      return counts;
    },
    follow(workspace, id) {
      const { folder, key } = targetOf('workspace', workspace);
      if (id === undefined) {
        folder.remove(PANELS_FILE);
        notify();
        return resolvePanels(manifests(), boardsOf(key), ownedSet());
      }
      return withPersisted(folder, withoutPanel(boardIn(folder), id), key);
    },
  };
}
