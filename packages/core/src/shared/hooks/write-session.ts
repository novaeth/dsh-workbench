import type { WriteChannel } from '@dsh-workbench/shared';

let sessionSource: (() => string | undefined) | undefined;

export function setWriteSessionSource(source: () => string | undefined): void {
  sessionSource = source;
}

export function writeBodyWithSession(
  channel: WriteChannel,
  body: Record<string, unknown>,
  session: string | undefined,
): Record<string, unknown> {
  return channel !== 'actions' || session === undefined ? body : { ...body, session };
}

export function sessionForWrite(channel: WriteChannel): string | undefined {
  return channel === 'actions' ? sessionSource?.() : undefined;
}
