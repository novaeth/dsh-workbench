import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import type { DenialScope, SeamMode, SeamPolicy, WriteIntent } from './intent.js';
import { SeamError } from './intent.js';

export const SEAM_MODES: readonly SeamMode[] = ['read-only', 'workspace-write', 'danger-full-access'];

export function seamModeOf(value: string | undefined): SeamMode {
  const text = value?.trim();
  return text === 'read-only' || text === 'workspace-write' || text === 'danger-full-access' ? text : 'workspace-write';
}

function rank(mode: SeamMode): number {
  return mode === 'read-only' ? 0 : mode === 'workspace-write' ? 1 : 2;
}

export function narrowerMode(left: SeamMode, right: SeamMode): SeamMode {
  return rank(left) <= rank(right) ? left : right;
}

function realOf(path: string): string {
  const resolved = resolve(path);
  if (existsSync(resolved)) {
    try {
      return realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  }
  const parent = dirname(resolved);
  if (parent === resolved) return resolved;
  const realParent = realOf(parent);
  return realParent === parent ? resolved : join(realParent, basename(resolved));
}

export function insideOf(root: string, path: string): boolean {
  const confined = realOf(root);
  const target = realOf(path);
  if (target === confined) return true;
  return target.startsWith(confined.endsWith(sep) ? confined : `${confined}${sep}`);
}

export function productPolicy(ceiling: SeamMode, productRoot: string): SeamPolicy {
  return {
    mode: ceiling === 'read-only' ? 'read-only' : ceiling === 'danger-full-access' ? 'danger-full-access' : 'workspace-write',
    workspaceRoot: resolve(productRoot),
  };
}

export function workspacePolicy(ceiling: SeamMode, grant: SeamPolicy | undefined): SeamPolicy {
  if (grant === undefined) {
    throw new SeamError('workspace-unknown', '这条会话解析不到工作区：先在左栏选一个工作区再跑需要写工作区的命令');
  }
  const mode = narrowerMode(ceiling, grant.mode);
  if (mode === 'read-only') {
    throw new SeamError('read-only', '当前会话是只读模式：要写工作区，先在权限设置里切换模式');
  }
  return { mode, workspaceRoot: resolve(grant.workspaceRoot) };
}

function atFilesystemRoot(path: string): boolean {
  return parse(path).root === path;
}

function commonDirectory(paths: readonly string[]): string | undefined {
  const dirs = paths.map((path) => dirname(resolve(path)));
  let shared = dirs[0];
  if (shared === undefined) return undefined;
  for (const dir of dirs.slice(1)) {
    while (shared !== dirname(shared) && !insideOf(shared, dir)) {
      shared = dirname(shared);
    }
  }
  return shared;
}

export function pathsPolicy(ceiling: SeamMode, paths: readonly string[]): SeamPolicy {
  if (paths.length === 0) {
    throw new SeamError('paths-span-trees', '这次写入没有给出任何路径');
  }
  if (!paths.every((path) => isAbsolute(path))) {
    throw new SeamError('paths-span-trees', '外部路径必须是绝对路径');
  }
  if (ceiling === 'read-only') {
    throw new SeamError('read-only', '当前部署是只读模式：这条命令不能写外部路径');
  }
  const root = commonDirectory(paths);
  if (root === undefined) {
    throw new SeamError('paths-span-trees', '这次写入没有给出任何路径');
  }
  if (atFilesystemRoot(root)) {
    throw new SeamError(
      'paths-span-trees',
      paths.length > 1 ? '这次写入跨了多个目录：请分开做，或把产物改到工作台目录' : '不能把整个文件系统声明成写入域',
    );
  }
  return { mode: 'workspace-write', workspaceRoot: root };
}

export function denialScopeOf(path: string | undefined, policy: SeamPolicy, productRoot: string, grant: SeamPolicy | undefined): DenialScope {
  if (path === undefined) return 'unknown';
  if (insideOf(productRoot, path)) return 'product';
  if (grant !== undefined && insideOf(grant.workspaceRoot, path)) return 'workspace';
  if (insideOf(policy.workspaceRoot, path)) return policy.workspaceRoot === resolve(productRoot) ? 'product' : 'workspace';
  return 'external';
}

export function policyOf(intent: WriteIntent, ceiling: SeamMode, productRoot: string, grant: SeamPolicy | undefined): SeamPolicy {
  if (intent.kind === 'product' || intent.kind === 'none') return productPolicy(ceiling, productRoot);
  if (intent.kind === 'workspace') return workspacePolicy(ceiling, grant);
  return pathsPolicy(ceiling, intent.paths);
}
