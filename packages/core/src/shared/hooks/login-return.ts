export const LOGIN_RETURN_MIN_MS = 1000;

export type LoginReturnEvent = 'hidden' | 'visible' | 'blur' | 'focus';

export interface LoginReturnOptions {
  readonly onRetry: () => void;
  readonly now?: (() => number) | undefined;
  readonly minimumMs?: number | undefined;
  readonly hidden?: (() => boolean) | undefined;
  readonly subscribe?: ((listener: (event: LoginReturnEvent) => void) => () => void) | undefined;
}

function subscribeWindow(listener: (event: LoginReturnEvent) => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  const onVisibility = (): void => listener(document.hidden ? 'hidden' : 'visible');
  const onBlur = (): void => listener('blur');
  const onFocus = (): void => listener('focus');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
  };
}

export function watchLoginReturn(options: LoginReturnOptions): () => void {
  const now = options.now ?? (() => Date.now());
  const minimumMs = Math.max(0, options.minimumMs ?? LOGIN_RETURN_MIN_MS);
  const hidden = options.hidden ?? (() => typeof document !== 'undefined' && document.hidden);
  let away = hidden();
  let awayAt = now();
  let unlisten: (() => void) | null = null;

  function stop(): void {
    const off = unlisten;
    unlisten = null;
    off?.();
  }

  function onEvent(event: LoginReturnEvent): void {
    if (event === 'hidden' || event === 'blur') {
      away = true;
      awayAt = now();
      return;
    }
    if (!away) return;
    const awayMs = now() - awayAt;
    away = false;
    if (awayMs < minimumMs) return;
    options.onRetry();
  }

  unlisten = (options.subscribe ?? subscribeWindow)(onEvent);

  return stop;
}
