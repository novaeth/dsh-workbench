import { createElement as h } from 'react';
import type { ModuleBlocker, Translate } from '@dsh-workbench/shared';
import { askAgentActionOf, blockerOfDiag, isDiagCode } from '@dsh-workbench/shared';
import { BlockerState } from '@/shared/components/BlockerState';

function fallbackOf(
  t: Translate,
  detail: string | null,
  code: string | null | undefined,
  manifestsOnly: boolean,
): ModuleBlocker {
  const title = t(manifestsOnly ? 'panels.manifestsReadFailed' : 'panels.boardReadFailed');
  const reason = (detail ?? '')
    .split('\n')
    .map((one) => one.trim())
    .find((one) => one !== '');
  return {
    id: code ?? 'board-read-failed',
    severity: 'block',
    title,
    hint: t(manifestsOnly ? 'panels.manifestsReadFailedHint' : 'panels.boardReadFailedHint'),
    ...(detail === null ? {} : { detail }),
    actions: [
      askAgentActionOf(t, {
        screen: t('askAgent.screen.board'),
        step: title,
        problem: { why: title, ...(reason === undefined ? {} : { reason }) },
      }),
      { kind: 'retry', label: t('panels.retry') },
    ],
  };
}

export function BoardReadFailed({
  t,
  detail,
  code,
  busy,
  manifestsOnly = false,
  onRetry,
}: {
  readonly t: Translate;
  readonly detail: string | null;
  readonly code?: string | null | undefined;
  readonly busy?: boolean | undefined;
  readonly manifestsOnly?: boolean | undefined;
  readonly onRetry: () => void;
}) {
  const blocker: ModuleBlocker =
    code !== undefined && code !== null && isDiagCode(code)
      ? blockerOfDiag(code, t, detail)
      : fallbackOf(t, detail, code, manifestsOnly);
  return <BlockerState blocker={blocker} t={t} busy={busy ?? false} onRetry={onRetry} />;
}
