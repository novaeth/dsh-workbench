import { useEffect, useState } from 'react';
import type { HostSurface, RuntimeCapabilities, RuntimeProfile } from '@dsh-workbench/shared';
import { readRuntimeCapabilities } from './runtime-queries';

let value: RuntimeCapabilities | undefined;
let profile: RuntimeProfile | undefined;
let surface: HostSurface | undefined;
let started = false;

const listeners = new Set<() => void>();

function publish(
  next: RuntimeCapabilities | undefined,
  nextProfile?: RuntimeProfile | undefined,
  nextSurface?: HostSurface | undefined,
): void {
  value = next;
  profile = nextProfile;
  surface = nextSurface;
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

export function hostSurfaceValue(): HostSurface | undefined {
  return surface;
}

export function resetRuntimeCapabilities(): void {
  value = undefined;
  profile = undefined;
  surface = undefined;
  started = false;
  listeners.clear();
}

async function load(): Promise<void> {
  const answer = await readRuntimeCapabilities();
  if (answer.ok) publish(answer.capabilities, answer.runtimeProfile ?? undefined, answer.surface ?? undefined);
  else publish(undefined);
}

function useRuntimeValue<T>(read: () => T): T {
  const [current, setCurrent] = useState<T>(read);

  useEffect(() => {
    let alive = true;
    const listener = (): void => {
      if (alive) setCurrent(read());
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
  }, [read]);

  return current;
}

export function useRuntimeCapabilities(): RuntimeCapabilities | undefined {
  return useRuntimeValue(runtimeCapabilitiesValue);
}

export function useHostSurface(): HostSurface | undefined {
  return useRuntimeValue(hostSurfaceValue);
}
