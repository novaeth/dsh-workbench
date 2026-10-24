import type { RecordExpect } from '@dsh-workbench/shared/host';
import { createRecordStore } from '@dsh-workbench/shared/host';
import type { RecordCall } from '../model/diy-record-text';

export const URL = 'https://inventory.example.com/env';

export const call = (
  method: string,
  url: string,
  body = '',
  source: 'hook' | 'capture' = 'hook',
  key = '',
): RecordCall => ({
  key,
  method,
  url,
  body,
  status: 200,
  ct: 'application/json',
  response: '{"ok":true}',
  at: 1,
  source,
});

export const POST = () => call('POST', `${URL}/api/publish`, '{"env":"test"}');
export const GET = () => call('GET', `${URL}/api/list`);

export const line = (method: string, url: string, at: number, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    key: `${method} ${url}`,
    timestamp: new Date(at).toISOString(),
    method,
    status: 200,
    url,
    ct: 'application/json',
    size: 10,
    ...extra,
  });

export const entry = (
  method: string,
  url: string,
  at: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  key: `${method} ${url}`,
  timestamp: new Date(at).toISOString(),
  method,
  status: 200,
  url,
  ct: 'application/json',
  size: 10,
  ...extra,
});

export const envelope = (entries: readonly Record<string, unknown>[]): string =>
  JSON.stringify({ session: 'workbench-rec', captured_at: new Date(1).toISOString(), count: entries.length, entries });

export const ARM_OK = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    ok: true,
    fresh: true,
    phase: 'armed',
    t0: null,
    t1: null,
    href: URL,
    size: 0,
    dropped: 0,
    ...extra,
  });

export const heldStore = (expect: RecordExpect | null, captureFile = '/w/shots/rec-demo.jsonl') => {
  const store = createRecordStore();
  const move = store.begin({
    sessionId: 's1',
    workspace: '/w/diy',
    unit: 'demo',
    name: 'demo',
    url: URL,
    title: '',
    action: '发布',
    expect,
    captureFile,
    now: Date.now(),
  });
  if (!move.ok) throw new Error('begin failed');
  return store;
};
