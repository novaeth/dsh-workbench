export const WAKE_BROWSER_ROUTE = 'wake-browser';

export type DesktopBrowserId = 'chrome' | 'edge' | 'brave' | 'chromium' | 'vivaldi';

export type BrowserWakeStatus =
  | 'connected'
  | 'browser-open'
  | 'no-browser'
  | 'launch-failed'
  | 'not-connected'
  | 'unsupported'
  | 'unknown';

export interface WakeBrowserReply {
  readonly status: BrowserWakeStatus;
  readonly browser?: DesktopBrowserId;
}
