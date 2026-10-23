import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PostResource, RouteHandler } from '@dsh-workbench/shared/host';
import type { SidebarEdition, SidebarEditionApplied } from '../sidebar-edition.js';
import { SIDEBAR_EDITION_RESOURCE } from '../sidebar-edition.js';
import { patchBlocks, writePatchFile } from './config-sync.js';

export interface SidebarEditionDeps {
  readonly profileDir: string | null;
  readonly reconcile?: (() => Promise<void>) | undefined;
}

const UI_SIDEBAR = 'ui-sidebar';
const BLOCK_START = /^- id:[ \t]*"?ui-sidebar"?[ \t]*(?:#.*)?$/;
const TOP_LEVEL = /^- /;
const DISABLED_LINE = /^[ \t]+disabled:[ \t]*true[ \t]*$/;

function patchPathOf(deps: SidebarEditionDeps): string | null {
  return deps.profileDir === null ? null : join(deps.profileDir, 'cordis.patch.yml');
}

export function editionOfPatch(text: string): SidebarEdition {
  const block = patchBlocks(text).find((one) => !one.insert && one.id === UI_SIDEBAR);
  if (block === undefined) return 'official';
  return block.body.split('\n').some((line) => DISABLED_LINE.test(line)) ? 'custom' : 'official';
}

function spanOf(lines: readonly string[]): { readonly from: number; readonly to: number } | null {
  const from = lines.findIndex((line) => BLOCK_START.test(line));
  if (from < 0) return null;
  let to = from + 1;
  while (to < lines.length && !TOP_LEVEL.test(lines[to] ?? '')) to += 1;
  return { from, to };
}

function withoutPlaceholder(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '[]')
    .join('\n')
    .replace(/\s+$/, '');
}

function withDisabled(lines: string[], span: { from: number; to: number }): string[] {
  const next = [...lines];
  for (let index = span.from + 1; index < span.to; index += 1) {
    if (/^[ \t]+disabled:/.test(next[index] ?? '')) {
      next[index] = '  disabled: true';
      return next;
    }
  }
  let at = span.to;
  while (at > span.from + 1 && (next[at - 1] ?? '').trim() === '') at -= 1;
  next.splice(at, 0, '  disabled: true');
  return next;
}

function withoutDisabled(lines: string[], span: { from: number; to: number }): string[] {
  const block = lines.slice(span.from, span.to).filter((line) => !/^[ \t]+disabled:/.test(line));
  const own = block.slice(1).filter((line) => line.trim() !== '' && !/^[ \t]*#/.test(line));
  if (own.length > 0) {
    const next = [...lines.slice(0, span.from), ...block, ...lines.slice(span.to)];
    return next;
  }
  let dropFrom = span.from;
  if (dropFrom > 0 && (lines[dropFrom - 1] ?? '').trim() === '') dropFrom -= 1;
  return [...lines.slice(0, dropFrom), ...lines.slice(span.to)];
}

export function withEdition(text: string, edition: SidebarEdition): string {
  if (editionOfPatch(text) === edition) return text;
  const lines = text.split('\n');
  if (edition === 'custom') {
    const span = spanOf(lines);
    if (span === null) {
      const base = withoutPlaceholder(text);
      return `${base === '' ? '' : `${base}\n\n`}- id: ${UI_SIDEBAR}\n  disabled: true\n`;
    }
    return `${withDisabled(lines, span).join('\n').replace(/\s+$/, '')}\n`;
  }
  const span = spanOf(lines);
  if (span === null) return text;
  return `${withoutDisabled(lines, span).join('\n').replace(/\s+$/, '')}\n`;
}

function readText(deps: SidebarEditionDeps): { readonly path: string; readonly text: string } | { readonly error: string } {
  const path = patchPathOf(deps);
  if (path === null) return { error: '拿不到当前 profile 目录' };
  try {
    return { path, text: readFileSync(path, 'utf8') };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function sidebarEditionHandler(deps: SidebarEditionDeps): RouteHandler {
  return () => {
    const read = readText(deps);
    if ('error' in read) {
      return { ok: false, error: { code: 'workbench/no-profile', message: read.error } };
    }
    return { ok: true, edition: editionOfPatch(read.text) };
  };
}

function requestedEdition(payload: unknown): SidebarEdition | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as { edition?: unknown }).edition;
  return value === 'official' || value === 'custom' ? value : null;
}

export async function sidebarEditionApply(deps: SidebarEditionDeps, payload: unknown): Promise<SidebarEditionApplied | { readonly ok: false; readonly text: string }> {
  const edition = requestedEdition(payload);
  if (edition === null) return { ok: false, text: '这一档不认识：只能选官方或自定义' };
  const read = readText(deps);
  if ('error' in read) return { ok: false, text: read.error };
  const next = withEdition(read.text, edition);
  if (next !== read.text) {
    try {
      writePatchFile(read.path, next);
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
  }
  const confirmed = editionOfPatch(readFileSync(read.path, 'utf8'));
  if (confirmed !== edition) return { ok: false, text: '写进去之后读回来不是目标档位，先别刷新' };
  if (next !== read.text && deps.reconcile !== undefined) {
    try {
      await deps.reconcile();
    } catch (error) {
      return {
        ok: false,
        text: `配置写了，但重组没成功：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return { ok: true, edition, reloadRequired: true };
}

export function sidebarEditionAction(deps: SidebarEditionDeps): PostResource {
  return {
    resource: SIDEBAR_EDITION_RESOURCE,
    handle: (payload: unknown) => sidebarEditionApply(deps, payload),
  };
}
