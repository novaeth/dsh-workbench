import { readFileSync } from 'node:fs';
import { nowIso, workbenchSelfUpdateMarker, writeJsonFile } from '@dsh-workbench/shared/host';

export function settlePendingSelfUpdate(running: string | undefined): boolean {
  if (running === undefined || running === '') return false;
  const file = workbenchSelfUpdateMarker();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  if (typeof raw !== 'object' || raw === null) return false;
  const marker = raw as { readonly state?: unknown; readonly version?: unknown };
  if (marker.state !== 'pending-restart' || marker.version !== running) return false;
  writeJsonFile(file, { ...(raw as Record<string, unknown>), state: 'ok', version: running, at: nowIso() });
  return true;
}
