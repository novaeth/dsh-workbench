import { readFileSync } from 'node:fs';

export interface SelfUpdateMarkerRead {
  readonly pkg?: string | undefined;
  readonly state?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly at?: string | undefined;
  readonly pid?: number | undefined;
}

export function readSelfUpdateMarker(file: string): SelfUpdateMarkerRead {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    return {
      ...(typeof raw.pkg === 'string' ? { pkg: raw.pkg } : {}),
      ...(typeof raw.state === 'string' ? { state: raw.state } : {}),
      ...(typeof raw.from === 'string' ? { from: raw.from } : {}),
      ...(typeof raw.to === 'string' ? { to: raw.to } : {}),
      ...(typeof raw.at === 'string' ? { at: raw.at } : {}),
      ...(typeof raw.pid === 'number' && Number.isInteger(raw.pid) ? { pid: raw.pid } : {}),
    };
  } catch {
    return {};
  }
}
