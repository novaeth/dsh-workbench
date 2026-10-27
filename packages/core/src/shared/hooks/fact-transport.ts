import { createFactChannel, type FactTransportMode } from '@dsh-workbench/shared';

import { createAdaptiveTransport } from './fact-transports';

const channel = createFactChannel({ transport: createAdaptiveTransport() });

export const factChannel = channel;

export function factTransportMode(): FactTransportMode | null {
  return channel.mode();
}

export function subscribeFactTransportMode(listener: (mode: FactTransportMode | null) => void): () => void {
  return channel.subscribeMode(() => listener(channel.mode()));
}
