import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { selfUpdatePaths } from './self-update-plan.js';
import {
  SELF_UPDATE_REASONS,
  SELF_UPDATE_STATES,
  type SelfUpdateReason,
  type SelfUpdateState,
  type WorkbenchSelfUpdate,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readTail(file: string): string | undefined {
  try {
    const info = statSync(file);
    if (!info.isFile() || info.size === 0) return undefined;
    const start = Math.max(0, info.size - 4096);
    const length = info.size - start;
    const buffer = Buffer.alloc(length);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, buffer, 0, length, start);
    } finally {
      closeSync(fd);
    }
    const lines = buffer
      .toString('utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (lines.length === 0) return undefined;
    return lines.slice(-4).join(' / ').slice(0, 800);
  } catch {
    return undefined;
  }
}

export function readSelfUpdateView(profile?: string): WorkbenchSelfUpdate | undefined {
  const paths = selfUpdatePaths();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.marker, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Readonly<Record<string, unknown>>;
  const state = asText(record.state);
  if (state === undefined || !(SELF_UPDATE_STATES as readonly string[]).includes(state)) return undefined;
  const owner = asText(record.profile);
  if (profile !== undefined && owner !== undefined && owner !== profile) return undefined;
  const from = asText(record.from);
  const to = asText(record.to);
  const version = asText(record.version);
  const at = asText(record.at);
  const reason = asText(record.reason);
  const tail = readTail(paths.log);
  return {
    state: state as SelfUpdateState,
    ...(record.migration === true ? { migration: true } : {}),
    ...(owner === undefined ? {} : { profile: owner }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(version === undefined ? {} : { version }),
    ...(at === undefined ? {} : { at }),
    ...(reason === undefined || !(SELF_UPDATE_REASONS as readonly string[]).includes(reason)
      ? {}
      : { reason: reason as SelfUpdateReason }),
    ...(tail === undefined ? {} : { tail }),
  };
}
