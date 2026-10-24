import type { BoardTarget } from './config';
import type { PanelsService } from './service';

export const PANELS_PREF_RESOURCE = 'panels';

export interface PanelsPrefAction {
  readonly action: 'show' | 'hide' | 'move' | 'reset' | 'follow';
  readonly id?: string;
  readonly index?: number;
  readonly path?: string;
  readonly scope?: BoardTarget;
}

const ACTIONS = ['show', 'hide', 'move', 'reset', 'follow'] as const;

export function parsePanelsPrefAction(payload: unknown): PanelsPrefAction {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('偏好写需要一个对象：{ action, id?, index?, path?, scope? }');
  }
  const value = payload as {
    action?: unknown;
    id?: unknown;
    index?: unknown;
    path?: unknown;
    scope?: unknown;
  };
  const action = value.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`不认识的 action：${String(action)}（可用：${ACTIONS.join(' / ')}）`);
  }
  if (value.scope !== undefined && value.scope !== 'machine' && value.scope !== 'workspace') {
    throw new Error(`不认识的 scope：${String(value.scope)}（可用：workspace / machine）`);
  }
  return {
    action: action as PanelsPrefAction['action'],
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    ...(typeof value.index === 'number' ? { index: value.index } : {}),
    ...(typeof value.path === 'string' ? { path: value.path } : {}),
    ...(value.scope === undefined ? {} : { scope: value.scope }),
  };
}

export function applyPanelsPref(panels: PanelsService, payload: unknown): { ok: true; units: unknown } {
  const action = parsePanelsPrefAction(payload);
  const path = action.path ?? null;
  const scope = action.scope ?? 'workspace';

  if (action.action === 'follow') {
    if (scope === 'machine') {
      throw new Error('机器级默认板没有"回到跟随"一说：它就是那份默认本身（要回到的是"没配过"）。');
    }
    return {
      ok: true,
      units: action.id === undefined ? panels.follow(path) : panels.follow(path, action.id),
    };
  }
  if (action.action === 'reset') return { ok: true, units: panels.reset(path, scope) };
  if (action.id === undefined) {
    throw new Error(
      `${action.action} 需要一个 id（当前套件：${panels.list(path).map((entry) => entry.id).join(', ')}）`,
    );
  }
  if (action.action === 'show') return { ok: true, units: panels.show(action.id, path, scope) };
  if (action.action === 'hide') return { ok: true, units: panels.hide(action.id, path, scope) };
  return { ok: true, units: panels.move(action.id, action.index ?? 0, path, scope) };
}
