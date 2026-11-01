import { tailLines } from '@dsh-workbench/shared/host';

export type PreflightBridgeIssue = 'daemon' | 'extension' | 'profile' | 'stale' | 'unknown';

export const BRIDGE_ISSUE_ORDER: readonly PreflightBridgeIssue[] = ['profile', 'stale', 'daemon', 'extension', 'unknown'];

export function readBridgeReport(stdout: string): {
  readonly ok: boolean;
  readonly issues: readonly PreflightBridgeIssue[];
  readonly detail: string;
} {
  const text = String(stdout ?? '');
  const ok = /^\[OK\] Daemon:/m.test(text) && /^\[OK\] Extension:/m.test(text) && /^\[OK\] Connectivity:/m.test(text);
  if (ok) {
    const good = text.split('\n').find((line) => line.trim() === 'Everything looks good!');
    return { ok: true, issues: [], detail: good?.trim() ?? tailLines(text, 1) };
  }

  const found = new Set<PreflightBridgeIssue>();
  if (!/^\[OK\] Daemon:/m.test(text)) found.add('daemon');
  if (!/^\[OK\] Extension:/m.test(text)) found.add('extension');
  if (/Multiple Chrome profiles are connected/i.test(text)) found.add('profile');
  if (/Default browser profile is stale|Selected browser profile is not connected/i.test(text)) {
    found.add('stale');
  }
  if (found.has('profile') || found.has('stale')) found.delete('extension');
  if (found.size === 0) found.add('unknown');

  return { ok: false, issues: BRIDGE_ISSUE_ORDER.filter((issue) => found.has(issue)), detail: issuesSection(text) };
}

function issuesSection(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^Issues:/.test(line.trim()));
  if (start < 0) return tailLines(text, 6);
  return lines.slice(start).join('\n').trim();
}
