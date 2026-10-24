import { PANEL_STATE_PATH, apiPost } from '@dsh-workbench/shared';
import type { PanelCardError, PanelCardPhase } from '@dsh-workbench/shared/host';

const FLUSH_MS = 400;

interface PendingRead {
  readonly unit: string;
  readonly route: string;
  readonly phase: PanelCardPhase;
  readonly at: number;
  readonly error?: PanelCardError;
}

let workspace: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const pending = new Map<string, PendingRead>();

export function unitOfRoute(route: string): string | null {
  const cut = route.indexOf('/');
  return cut <= 0 ? null : route.slice(0, cut);
}

export function setPanelWorkspace(path: string | null): void {
  if (path === workspace) return;
  const previous = workspace;
  workspace = path;
  if (previous !== null) pending.clear();
}

export function reportPanelRead(input: {
  readonly unit: string;
  readonly route: string;
  readonly phase: PanelCardPhase;
  readonly error?: PanelCardError | undefined;
}): void {
  pending.set(`${input.unit}\u0000${input.route}`, {
    unit: input.unit,
    route: input.route,
    phase: input.phase,
    at: Date.now(),
    ...(input.error === undefined ? {} : { error: input.error }),
  });
  if (timer !== null) return;
  timer = setTimeout(flush, FLUSH_MS);
}

export function reportPanelCrash(input: { readonly unit: string; readonly reason: string }): void {
  const target = workspace;
  if (target === null) return;
  void apiPost(`${PANEL_STATE_PATH}/crash`, {
    workspace: target,
    unit: input.unit,
    reason: input.reason,
    at: Date.now(),
  }).catch(() => undefined);
}

function flush(): void {
  timer = null;
  const target = workspace;
  const cards = [...pending.values()];
  pending.clear();
  if (target === null || cards.length === 0) return;
  void apiPost(`${PANEL_STATE_PATH}/cards`, { workspace: target, cards }).catch(() => undefined);
}
