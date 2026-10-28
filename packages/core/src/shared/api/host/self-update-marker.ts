import { readFileSync } from 'node:fs';

export interface SelfUpdateMarkerRead {
  readonly pkg?: string | undefined;
  readonly state?: string | undefined;
}

export function readSelfUpdateMarker(file: string): SelfUpdateMarkerRead {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    return {
      ...(typeof raw.pkg === 'string' ? { pkg: raw.pkg } : {}),
      ...(typeof raw.state === 'string' ? { state: raw.state } : {}),
    };
  } catch {
    return {};
  }
}
