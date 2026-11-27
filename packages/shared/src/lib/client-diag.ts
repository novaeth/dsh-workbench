import { API_PREFIX } from '../config/constants.js';

const CORR_BYTES = 4;

export function newCorrId(): string {
  const bytes = new Uint8Array(CORR_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((one) => one.toString(16).padStart(2, '0')).join('');
}

export function reportClientFailure(input: {
  readonly corrId: string;
  readonly screen: string;
  readonly step?: string | undefined;
  readonly reason?: string | undefined;
}): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  const target = new URL(`${API_PREFIX}/actions/diag-client`, window.location.origin).toString();
  const reason = (input.reason ?? '')
    .split('\n')
    .map((one) => one.trim())
    .find(Boolean);
  void fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      corrId: input.corrId,
      screen: input.screen,
      ...(input.step === undefined || input.step === '' ? {} : { step: input.step }),
      ...(reason === undefined ? {} : { reason }),
    }),
  }).catch((error: unknown) => {
    console.warn(`[dsh-workbench] 客户端失败没上报：${String(error)}`);
  });
}
