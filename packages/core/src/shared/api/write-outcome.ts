import type { ApiResponse, WriteChannel, WriteOutcome } from '@dsh-workbench/shared';

export function writeRoute(channel: WriteChannel, resource: string): string {
  if (channel === 'provision') return 'provision';
  return `${channel}/${resource}`;
}

export function writeOutcomeOf<T>(response: ApiResponse<T> | null, networkText: string): WriteOutcome<T> {
  if (response === null) return { ok: false, message: networkText };
  if (!response.ok) {
    const box = response as {
      readonly error?:
        | { readonly message?: unknown; readonly detail?: unknown; readonly helpUrl?: unknown }
        | undefined;
      readonly text?: unknown;
    };
    const own = typeof box.error?.message === 'string' && box.error.message !== '' ? box.error.message : undefined;
    const fallback = typeof box.text === 'string' && box.text !== '' ? box.text : networkText;
    const detail = typeof box.error?.detail === 'string' ? box.error.detail : undefined;
    const helpUrl =
      typeof box.error?.helpUrl === 'string' && box.error.helpUrl !== '' ? box.error.helpUrl : undefined;
    return {
      ok: false,
      message: own ?? fallback,
      ...(detail === undefined ? {} : { detail }),
      ...(helpUrl === undefined ? {} : { helpUrl }),
    };
  }
  return { ok: true, value: response };
}
