import type { InstalledModule, SupplyPort } from '@dsh-workbench/shared/host';
import { readSelfUpdateMarker } from '@/shared/api/host/self-update-marker';

export interface ExternalSwapDeps {
  readonly supply: Pick<SupplyPort, 'startSelfUpdate'>;
  readonly installed: ((pkg: string) => InstalledModule) | undefined;
  readonly dshHome: string;
  readonly profile: string;
  readonly pollMs?: number | undefined;
  readonly waitMs?: number | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

export interface ExternalSwapInput {
  readonly pkg: string;
  readonly from: string;
  readonly to: string;
  readonly pinned: boolean;
}

const DEFAULT_POLL_MS = 400;
const DEFAULT_WAIT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function landedIn(after: InstalledModule, input: ExternalSwapInput): boolean {
  if (after.kind !== 'module') return false;
  return input.to === '' ? after.version !== input.from : after.version === input.to;
}

export async function swapExternally(
  deps: ExternalSwapDeps,
  input: ExternalSwapInput,
): Promise<InstalledModule | undefined> {
  let marker: string;
  try {
    marker = deps.supply.startSelfUpdate(
      {
        dshHome: deps.dshHome,
        profile: deps.profile,
        pkg: input.pkg,
        from: input.from,
        to: input.to,
        pinned: input.pinned,
      },
      (message) => deps.logger?.warn?.(`[dsh-workbench] ${message}`),
    ).paths.marker;
  } catch (error) {
    deps.logger?.warn?.(
      `[dsh-workbench] 外部换版起不来（${input.pkg}）：${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + (deps.waitMs ?? DEFAULT_WAIT_MS);
  let state = 'timeout';
  while (Date.now() < deadline) {
    const read = readSelfUpdateMarker(marker);
    if (read.pkg === input.pkg && read.state !== undefined && read.state !== 'running') {
      state = read.state;
      break;
    }
    await sleep(pollMs);
  }
  const after = deps.installed?.(input.pkg) ?? { kind: 'unknown', pkg: input.pkg };
  const version = after.kind === 'module' ? after.version : '读不到';
  deps.logger?.info?.(`[dsh-workbench] 外部换版 ${input.pkg}：${state}，盘上 ${version}`);
  return landedIn(after, input) ? after : undefined;
}
