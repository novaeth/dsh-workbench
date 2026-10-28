import { useEffect, useState } from 'react';
import type { RuntimeCapabilities, RuntimeProfile } from '@dsh-workbench/shared';
import { readRuntimeCapabilities } from './runtime-queries';

let value: RuntimeCapabilities | undefined;
let profile: RuntimeProfile | undefined;
let started = false;

const listeners = new Set<() => void>();

function publish(next: RuntimeCapabilities | undefined, nextProfile?: RuntimeProfile | undefined): void {
  value = next;
  profile = nextProfile;
  for (const listener of listeners) listener();
}

export function pluginMarketOf(capabilities: RuntimeCapabilities | undefined): boolean {
  return capabilities?.pluginMarket !== false;
}

export function runtimeCapabilitiesValue(): RuntimeCapabilities | undefined {
  return value;
}

export function runtimeProfileValue(): RuntimeProfile | undefined {
  return profile;
}

export function resetRuntimeCapabilities(): void {
  value = undefined;
  profile = undefined;
  started = false;
  listeners.clear();
}

async function load(): Promise<void> {
  const answer = await readRuntimeCapabilities();
  if (answer.ok) publish(answer.capabilities, answer.runtimeProfile ?? undefined);
  else publish(undefined);
}

export function useRuntimeCapabilities(): RuntimeCapabilities | undefined {
  const [caps, setCaps] = useState<RuntimeCapabilities | undefined>(value);

  useEffect(() => {
    let alive = true;
    const listener = (): void => {
      if (alive) setCaps(value);
    };
    listeners.add(listener);
    if (value === undefined && !started) {
      started = true;
      void load().catch(() => {
        started = false;
        publish(undefined);
      });
    }
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  return caps;
}
