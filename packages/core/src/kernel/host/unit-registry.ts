import type { UnitManifest } from '@dsh-workbench/shared';
import { readDeclaration } from '@dsh-workbench/shared/host';
import type { UnitModuleFace, UnitOwnedFace } from '@dsh-workbench/shared/host';

export interface UnitRefusal {
  readonly unit: string;
  readonly pkg?: string;
  readonly reasons: readonly string[];
}

export type UnitSource =
  | { readonly kind: 'package'; readonly pkg: string }
  | { readonly kind: 'owned' }
  | { readonly kind: 'plugin' };

export interface HostUnit {
  readonly unit: string;
  readonly manifest: UnitManifest;
  readonly face: UnitModuleFace;
  readonly source: UnitSource;
}

export interface UnitDeclarationSource {
  readonly pkg: string;
  readonly declaration: unknown;
}

export function installableUnitsOf(registry: {
  all(): readonly HostUnit[];
}): readonly string[] {
  return registry
    .all()
    .filter((host) => host.source.kind === 'package')
    .map((host) => host.unit);
}

export interface UnitRegistry {
  register(face: UnitModuleFace): () => void;
  registerOwned(face: UnitOwnedFace): () => void;
  registerPlugin(face: UnitOwnedFace): () => void;
  all(): readonly HostUnit[];
  owned(): readonly string[];
  refusals(): readonly UnitRefusal[];
  manifests(): readonly UnitManifest[];
  subscribe(listener: () => void): () => void;
  fail(unit: string, reason: string): void;
  recovered(unit: string): void;
  failureOf(unit: string): string | undefined;
}

function sourceLabel(source: UnitSource): string {
  if (source.kind === 'owned') return '工作台自己';
  if (source.kind === 'plugin') return '按已装 opencli 插件合成';
  return source.pkg;
}

export function createUnitRegistry(options: {
  declarationOf: (unit: string) => UnitDeclarationSource | undefined;
  logger?: { warn?(message: string): void } | undefined;
}): UnitRegistry {
  const refusals: UnitRefusal[] = [];
  const hosts: HostUnit[] = [];
  const byUnit = new Map<string, HostUnit>();
  const failures = new Map<string, string>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function add(host: HostUnit): () => void {
    const taken = byUnit.get(host.unit);
    if (taken !== undefined) {
      throw new Error(
        `套件 id 重复：${host.unit}（id 会进持久化配置，不能撞）—— 已被 ${sourceLabel(taken.source)} 占着`,
      );
    }
    byUnit.set(host.unit, host);
    hosts.push(host);
    notify();

    return () => {
      if (byUnit.get(host.unit) !== host) return;
      byUnit.delete(host.unit);
      const index = hosts.indexOf(host);
      if (index >= 0) hosts.splice(index, 1);
      notify();
    };
  }

  return {
    register(face) {
      const unit = typeof face?.unit === 'string' ? face.unit.trim() : '';
      const refuse = (pkg: string | undefined, reasons: readonly string[]) => {
        refusals.push({ unit, ...(pkg === undefined ? {} : { pkg }), reasons });
        options.logger?.warn?.(
          `[dsh-workbench] ${pkg ?? '这个模块'}没挂上（unit ${unit === '' ? '没写' : unit}）：${reasons.join('；')}`,
        );
        notify();
        return () => {};
      };
      if (unit === '') {
        return refuse(undefined, [
          'register({ unit, mount }) 里的 unit 是空的 —— U1b 之前的旧形状是 register({ manifest, mount })；' +
            '现在清单由工作台从**已装包**的 dsh.workbench 读出来，模块里的 id 从 deps.manifest.id 拿',
        ]);
      }
      const source = options.declarationOf(unit);
      if (source === undefined) {
        return refuse(undefined, [
          `没有哪个已装模块声明了 unit「${unit}」—— 查过这份 profile 的已装清单。` +
            '要么 package.json 里 dsh.workbench.unit 写错了（改完要重启工作台），' +
            '要么这个包根本没被装进这份 profile',
        ]);
      }
      const read = readDeclaration(source.pkg, source.declaration);
      if (read.manifest === undefined) return refuse(source.pkg, read.problems);
      return add({ unit, manifest: read.manifest, face, source: { kind: 'package', pkg: source.pkg } });
    },

    registerOwned(face) {
      return add({ unit: face.manifest.id, manifest: face.manifest, face, source: { kind: 'owned' } });
    },

    registerPlugin(face) {
      return add({
        unit: face.manifest.id,
        manifest: face.manifest,
        face,
        source: { kind: 'plugin' },
      });
    },

    all: () => hosts,

    owned: () => hosts.filter((host) => host.source.kind === 'owned').map((host) => host.unit),

    refusals: () => refusals,

    manifests: () => hosts.map((host) => host.manifest),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    fail(unit, reason) {
      failures.set(unit, reason);
    },

    recovered(unit) {
      failures.delete(unit);
    },

    failureOf: (unit) => failures.get(unit),
  };
}
