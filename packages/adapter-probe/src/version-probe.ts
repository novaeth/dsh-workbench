import { setTimeout as delay } from 'node:timers/promises';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';

export type OpencliVersionRun =
  | { kind: 'ok'; stdout: string }
  | { kind: 'nonzero'; detail: string }
  | { kind: 'error'; detail: string }
  | { kind: 'stalled'; detail: string };

export interface VersionProbeInput {
  readonly run: () => Promise<OpencliVersionRun>;
  readonly attempts: number;
  readonly installed?: (() => boolean) | undefined;
  readonly log: (line: string) => void;
}

export interface OpencliVersionVerdict {
  readonly ok: boolean;
  readonly missing: boolean;
  readonly detail: string;
  readonly stalled: boolean;
}

const RETRY_DELAY_MS = 1_000;

function versionOf(text: string): string | undefined {
  const match = /\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(text);
  return match?.[1];
}

export async function probeOpencliVersion(input: VersionProbeInput): Promise<OpencliVersionVerdict> {
  const attempts = Math.max(1, input.attempts);
  let result = await input.run();
  for (let attempt = 1; attempt < attempts && result.kind === 'nonzero'; attempt += 1) {
    input.log(`> 再探一次（第 ${String(attempt + 1)} 次）`);
    await delay(RETRY_DELAY_MS);
    result = await input.run();
  }
  if (result.kind === 'ok') {
    const detail = result.stdout.trim().split('\n')[0] ?? '';
    const version = versionOf(detail);
    if (version !== undefined && version !== OPENCLI_PIN) {
      return { ok: false, missing: true, detail: `盘上跑的是 ${version}，要 ${OPENCLI_PIN}`, stalled: false };
    }
    return { ok: true, missing: false, detail, stalled: false };
  }
  const onDisk = input.installed?.() === true;
  return {
    ok: false,
    missing: result.kind === 'nonzero' && !onDisk,
    detail: result.detail,
    stalled: result.kind === 'stalled',
  };
}
