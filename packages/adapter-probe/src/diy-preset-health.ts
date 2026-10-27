import type { DshAgentPresetRegistry, DshAgentPresetRow, DshHostContext } from '@dsh-workbench/shared';
import { DIY_PRESET_ID } from '@dsh-workbench/shared/contract/protocol/diy';

export const DIY_UPGRADE_COMMAND = 'npm i -g @deepseek-ai/dsh@latest';

export interface DiyPresetVerdict {
  readonly ok: boolean;
  readonly rows: readonly string[];
  readonly detail: string;
}

export function brokenRowsOf(detail: string): readonly string[] {
  const rows: string[] = [];
  for (const line of String(detail ?? '').split('\n')) {
    const text = line.trim();
    if (text === '') continue;
    const at = text.indexOf(' (');
    rows.push(at < 0 ? text : text.slice(0, at));
  }
  return rows;
}

export function diyPresetVerdictOf(presets: readonly DshAgentPresetRow[]): DiyPresetVerdict | undefined {
  if (!Array.isArray(presets) || presets.length === 0) return undefined;
  const mine = presets.find((row) => row?.id === DIY_PRESET_ID);
  if (mine === undefined) return { ok: false, rows: [], detail: `preset 名单里没有 ${DIY_PRESET_ID}` };
  const broken = typeof mine.broken === 'string' ? mine.broken.trim() : '';
  if (broken === '') return { ok: true, rows: [], detail: '' };
  return { ok: false, rows: brokenRowsOf(broken), detail: broken };
}

export function createDiyPresetProbe(
  ctx: DshHostContext,
  options: { deadlineMs?: number; everyMs?: number } = {},
): () => Promise<DiyPresetVerdict | undefined> {
  const deadlineMs = options.deadlineMs ?? 15_000;
  const everyMs = options.everyMs ?? 400;
  return async () => {
    const registry = ctx.get<DshAgentPresetRegistry>('agentPresets');
    if (registry === undefined || typeof registry.list !== 'function') return undefined;
    const until = Date.now() + deadlineMs;
    for (;;) {
      const rows = await registry.list().catch(() => undefined);
      if (rows === undefined) return undefined;
      const verdict = diyPresetVerdictOf(rows);
      if (verdict !== undefined) return verdict;
      if (Date.now() >= until) return undefined;
      await new Promise((resolve) => setTimeout(resolve, everyMs));
    }
  };
}
