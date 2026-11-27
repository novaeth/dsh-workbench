import type { DiagRecorder, PostResource } from '@dsh-workbench/shared/host';
import { diagTextOf, firstLineOfText, now } from '@dsh-workbench/shared/host';

export const DIAG_CLIENT_RESOURCE = 'diag-client';

const CORR_ID = /^[A-Za-z0-9-]{4,32}$/;
const WINDOW_MS = 10 * 60 * 1000;

export function diagClientAction(diag: DiagRecorder): PostResource {
  return {
    resource: DIAG_CLIENT_RESOURCE,
    handle(payload) {
      const box = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
      const screen = diagTextOf(box['screen']) ?? 'unknown';
      const step = diagTextOf(box['step']);
      const reason = diagTextOf(box['reason']);
      const given = diagTextOf(box['corrId']);
      const corrId = given !== undefined && CORR_ID.test(given) ? given : undefined;
      if (corrId !== undefined) {
        const existing = diag.recent({ since: now() - WINDOW_MS, code: 'CLIENT_FAILED' })
          .find((one) => one.corrId === corrId);
        if (existing !== undefined) return { ok: true, corrId };
      }
      const made = diag.record({
        code: 'CLIENT_FAILED',
        level: 'error',
        ...(corrId === undefined ? {} : { corrId }),
        subject: { route: screen, ...(step === undefined ? {} : { unit: step }) },
        ...(reason === undefined ? {} : { detail: { reason: firstLineOfText(reason) } }),
      });
      return { ok: true, corrId: made?.corrId ?? corrId ?? '' };
    },
  };
}
