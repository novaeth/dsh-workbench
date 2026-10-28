import type {
  BundleCancellation,
  BundleChange,
  BundleInspection,
  BundleInstallRequest,
  BundleRegistries,
  BundleRegistry,
} from '../contract/protocol/bundle-install.js';

export type InstalledModule =
  | {
      readonly kind: 'module';
      readonly pkg: string;
      readonly unit: string;
      readonly version: string;
      readonly registry?: string;
      readonly local?: boolean;
    }
  | { readonly kind: 'not-module'; readonly pkg: string }
  | { readonly kind: 'unknown'; readonly pkg: string };

export interface ProfileModule {
  readonly pkg: string;
  readonly unit: string;
  readonly version: string;
  readonly registry?: string;
  readonly local?: boolean;
  readonly fromRegistry?: boolean;
}

export interface ProfilePackage {
  readonly pkg: string;
  readonly version: string;
  readonly registry?: string;
  readonly local?: boolean;
}

export interface BundleManager {
  registries(): Promise<BundleRegistries | null>;
  inspect(spec: string, registry?: BundleRegistry): Promise<BundleInspection | null>;
  install(request: BundleInstallRequest): Promise<BundleChange | null>;
  remove(name: string): Promise<BundleChange | null>;
  setEnabled?(name: string, enabled: boolean): Promise<BundleChange | null>;
  cancel(requestId: string): Promise<BundleCancellation | null>;
}

export interface RegistryEntry {
  readonly scope: string;
  readonly registry: string;
}

export interface RegistryNotebook {
  sources(): readonly RegistryEntry[];
  remember(entries: readonly RegistryEntry[]): readonly string[];
  swapScope?(scope: string, registry: string): () => void;
}

export interface SelfUpdatePaths {
  readonly dir: string;
  readonly script: string;
  readonly marker: string;
  readonly log: string;
}

export interface SelfUpdateRequest {
  readonly dshHome: string;
  readonly profile: string;
  readonly pkg: string;
  readonly from: string;
  readonly to: string;
  readonly pinned: boolean;
}

export interface SelfUpdateStart {
  readonly started: boolean;
  readonly paths: SelfUpdatePaths;
  readonly forward: string;
}

export interface RuntimeStatus {
  readonly command: string;
  readonly source: 'env' | 'isolated' | 'path';
  readonly isolated: string | null;
}

export function scopeOf(pkg: string): string | null {
  const slash = pkg.indexOf('/');
  return pkg.startsWith('@') && slash > 1 ? pkg.slice(0, slash) : null;
}

export function normalizeRegistry(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function sameRegistry(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (a.trim() === '' || b.trim() === '') return false;
  return normalizeRegistry(a) === normalizeRegistry(b);
}

export function registryFailure(change: { application?: string; packageResult?: { kind?: string; output?: string }; errorDetail?: string }): boolean {
  if (change.application !== 'failed') return false;
  if (change.packageResult?.kind === 'not-found') return true;
  const output = change.packageResult?.output ?? change.errorDetail ?? '';
  return /ERR_PNPM_[A-Z_]*FETCH/.test(output);
}
