import { BROWSER_READ_SESSION, type Seam } from '@dsh-workbench/shared/host';
import type { QueueWaitEvent } from './queue.js';

export interface SaveBytesInput {
  readonly data: Uint8Array;
  readonly contentType: string;
  readonly name: string;
}

export type SaveBytes = (input: SaveBytesInput) => Promise<unknown>;

export interface DataReaderOptions {
  readonly seam?: Seam | undefined;
  readonly command?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly channel?: boolean | undefined;
  readonly channelInstalled?: (() => boolean) | undefined;
  readonly queueWaitMs?: number | undefined;
  readonly onQueue?: ((event: QueueWaitEvent) => void) | undefined;
  readonly saveBytes?: SaveBytes | undefined;
}

export function sessionOf(value: string | undefined): string {
  return value === undefined || value === '' ? BROWSER_READ_SESSION : value;
}
