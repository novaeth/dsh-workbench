import type { UnitManifest } from '@dsh-workbench/shared';
import type { BoardModule, UnitClientFace } from '@dsh-workbench/shared';
import { createBoardRegistry, type BoardRegistry } from './board-registry';

export interface ClientUnitRefusal {
  readonly unit: string;
  readonly kind: ClientRefusalKind;
  readonly reasons: readonly string[];
}

export type ClientRefusalKind = 'no-manifest' | 'withdrawn' | 'old-shape';

export interface ClientUnitRegistry {
  register(face: UnitClientFace): () => void;
  all(): readonly UnitClientFace[];
  manifests(): readonly UnitManifest[];
  installable(): ReadonlySet<string> | null;
  refusals(): readonly ClientUnitRefusal[];
  setManifests(manifests: readonly UnitManifest[], installable?: readonly string[]): void;
  readonly board: BoardRegistry;
  subscribe(listener: () => void): () => void;
  version(): number;
}

export function toBoardModule(face: UnitClientFace, manifest: UnitManifest): BoardModule | undefined {
  const View = face.card;
  if (View === undefined) return undefined;
  return {
    id: manifest.id,
    titleKey: manifest.titleKey,
    order: manifest.card?.order ?? 100,
    View,
    ...(face.steps === undefined ? {} : { steps: face.steps }),
  };
}

interface Registration {
  readonly face: UnitClientFace;
  readonly unit: string;
  mounted: { readonly manifest: UnitManifest; readonly unmount: () => void } | null;
}

export function createClientUnitRegistry(
  options: { readonly onUnknownUnit?: (unit: string) => void } = {},
): ClientUnitRegistry {
  const registrations: Registration[] = [];
  const refusals: ClientUnitRefusal[] = [];
  const listeners = new Set<() => void>();
  const board = createBoardRegistry();
  let known = new Map<string, UnitManifest>();
  let installableIds: ReadonlySet<string> | null = null;
  let revision = 0;
  let manifestsCache: readonly UnitManifest[] | undefined;
  let titleSignature = '';

  function titlesOf(manifests: readonly UnitManifest[]): string {
    return manifests
      .flatMap((manifest) =>
        manifest.title === undefined
          ? []
          : [`${manifest.id}=${manifest.title.zh}/${manifest.title.en}`],
      )
      .join('|');
  }

  function notify(): void {
    revision += 1;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.warn(`[dsh-workbench] 套件注册的订阅者报错（不影响其它订阅者与这次注册）：${String(error)}`);
      }
    }
  }

  function warnRefusal(unit: string, kind: ClientRefusalKind, reasons: readonly string[]): void {
    refusals.push({ unit, kind, reasons });
    console.warn(`[dsh-workbench] ${unit === '' ? '这个模块' : unit} 的卡片没挂上：${reasons.join('；')}`);
  }

  function takeBackRefusal(unit: string): void {
    for (let at = refusals.length - 1; at >= 0; at -= 1) {
      if (refusals[at]?.unit === unit) refusals.splice(at, 1);
    }
  }

  function attach(entry: Registration): boolean {
    const manifest = known.get(entry.unit);
    if (manifest === undefined) return false;
    const boardModule = toBoardModule(entry.face, manifest);
    entry.mounted = {
      manifest,
      unmount: boardModule === undefined ? () => {} : board.register(boardModule),
    };
    takeBackRefusal(entry.unit);
    return true;
  }

  function detach(entry: Registration): void {
    entry.mounted?.unmount();
    entry.mounted = null;
  }

  return {
    register(face) {
      const unit = typeof face?.unit === 'string' ? face.unit.trim() : '';
      if (unit === '') {
        warnRefusal('', 'old-shape', [
          'registerUnit({ unit, card }) 里的 unit 是空的 —— U1b 之前的旧形状是 registerUnit({ manifest, card })；' +
            '现在清单由工作台从**已装清单**读出来、按 unit 交给浏览器',
        ]);
        notify();
        return () => {};
      }
      if (registrations.some((entry) => entry.unit === unit)) {
        throw new Error(`套件 id 重复：${unit}（id 会进持久化配置，不能撞）`);
      }

      const entry: Registration = { face, unit, mounted: null };
      registrations.push(entry);
      manifestsCache = undefined;
      if (!attach(entry)) {
        warnRefusal(unit, 'no-manifest', [
          `宿主没有担保 unit「${unit}」的清单 —— 这个包要么没装进这份 profile，要么它的 dsh.workbench 没通过校验。` +
            '卡片先不挂：清单只有一处真相',
        ]);
        options.onUnknownUnit?.(unit);
      }
      notify();

      return () => {
        const at = registrations.indexOf(entry);
        if (at < 0) return;
        registrations.splice(at, 1);
        detach(entry);
        takeBackRefusal(unit);
        manifestsCache = undefined;
        notify();
      };
    },

    all: () => registrations.map((entry) => entry.face),

    manifests: () => {
      manifestsCache ??= registrations.flatMap((entry) =>
        entry.mounted === null ? [] : [entry.mounted.manifest],
      );
      return manifestsCache;
    },

    refusals: () => refusals,

    installable: () => installableIds,

    setManifests(manifests, installable) {
      known = new Map(manifests.map((manifest) => [manifest.id, manifest]));
      installableIds = installable === undefined ? null : new Set(installable);
      let changed = false;
      for (const entry of registrations) {
        const next = known.get(entry.unit);
        if (entry.mounted === null) {
          if (next !== undefined) {
            attach(entry);
            changed = true;
          }
          continue;
        }
        if (next === undefined) {
          detach(entry);
          warnRefusal(entry.unit, 'withdrawn', [`宿主不再担保 unit「${entry.unit}」的清单（模块被卸了？）—— 这张卡片先摘下来`]);
          changed = true;
        }
      }
      const titles = titlesOf(manifests);
      if (titles !== titleSignature) {
        titleSignature = titles;
        changed = true;
      }
      if (!changed) return;
      manifestsCache = undefined;
      notify();
    },

    board,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    version: () => revision,
  };
}
