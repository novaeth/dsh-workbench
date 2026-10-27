import { parseFactFrame, type FactTransport } from '@dsh-workbench/shared';
import { apiGet } from '@dsh-workbench/shared';
import { EVENTS_PATH, PANEL_POLL_MS } from '@dsh-workbench/shared';

function sseTransport(options: { readonly onGiveUp: () => void }): FactTransport {
  return {
    start({ onFrame, cursor, onMode }) {
      let stopped = false;
      let source: EventSource | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let attempts = 0;

      const open = (): void => {
        source = new EventSource(`${EVENTS_PATH}?since=${cursor()}`);
        source.onopen = () => onMode?.('sse');
        source.onmessage = (event: MessageEvent) => {
          attempts = 0;
          const frame = parseFactFrame(event.data);
          if (frame !== null) onFrame(frame);
        };
        source.onerror = () => {
          source?.close();
          source = null;
          if (stopped) return;
          attempts += 1;
          if (attempts > 1) {
            options.onGiveUp();
            return;
          }
          timer = setTimeout(open, 1000);
        };
      };

      open();
      return () => {
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
        source?.close();
      };
    },
  };
}

function pollTransport(): FactTransport {
  return {
    start({ onFrame, cursor, onMode }) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      onMode?.('polling');

      const tick = async (): Promise<void> => {
        const response = await apiGet<{ epoch?: string; rev?: number; facts?: string[] }>('changes', {
          since: cursor(),
        }).catch(() => null);
        if (stopped) return;
        if (response?.ok === true) {
          const frame = parseFactFrame(
            JSON.stringify({ epoch: response.epoch, rev: response.rev, facts: response.facts }),
          );
          if (frame !== null) onFrame(frame);
        }
        if (stopped) return;
        timer = setTimeout(() => void tick(), PANEL_POLL_MS);
      };

      void tick();
      return () => {
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
      };
    },
  };
}

export function createAdaptiveTransport(): FactTransport {
  return {
    start(handlers) {
      let stopped = false;
      let stopCurrent: (() => void) | null = null;
      const runPoll = (): void => {
        if (stopped) return;
        stopCurrent = pollTransport().start(handlers);
      };
      if (typeof EventSource === 'function') {
        stopCurrent = sseTransport({ onGiveUp: runPoll }).start(handlers);
      } else {
        runPoll();
      }
      return () => {
        stopped = true;
        stopCurrent?.();
      };
    },
  };
}
