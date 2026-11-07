export interface LogViewport {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

const BOTTOM_SLACK_PX = 2;

export function logAtBottom(viewport: LogViewport): boolean {
  const rest = viewport.scrollHeight - viewport.clientHeight;
  if (rest <= BOTTOM_SLACK_PX) return true;
  return rest - viewport.scrollTop <= BOTTOM_SLACK_PX;
}
