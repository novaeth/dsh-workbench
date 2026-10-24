import type { DshHostContext, DshRequest, DshResponse } from '@dsh-workbench/shared';
import { EVENTS_PATH } from '@dsh-workbench/shared/host';
import type { FactChange, FactLog } from '@dsh-workbench/shared/host';

const HEARTBEAT_MS = 25_000;

function frame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export interface FactStream {
  handler(req: DshRequest, res: DshResponse): void;
  closeAll(): void;
  size(): number;
}

export function createFactStream(log: FactLog): FactStream {
  const connections = new Set<DshResponse>();
  const cleanups = new Map<DshResponse, () => void>();

  const drop = (res: DshResponse): void => {
    cleanups.get(res)?.();
    cleanups.delete(res);
    connections.delete(res);
  };

  return {
    size: () => connections.size,
    closeAll() {
      for (const res of [...connections]) {
        drop(res);
        res.end?.();
      }
    },
    handler(req, res) {
      if (req.method !== undefined && req.method !== 'GET') {
        res.statusCode = 405;
        res.end();
        return;
      }
      const url = req.url ?? '/';
      const cut = url.indexOf('?');
      const since = Number(new URLSearchParams(cut === -1 ? '' : url.slice(cut + 1)).get('since') ?? 0) || 0;
      const opening = log.since(since);

      if (typeof res.write !== 'function') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, ...opening }));
        return;
      }

      const headers = {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        connection: 'keep-alive',
      };
      if (typeof res.writeHead === 'function') res.writeHead(200, headers);
      else {
        res.statusCode = 200;
        for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      }
      res.write(': connected\n\n');
      res.write(frame({ type: 'sync', ...opening }));
      connections.add(res);
      const timer = setInterval(() => res.write?.(': ping\n\n'), HEARTBEAT_MS);
      const unsubscribe = log.subscribe((change: FactChange) => res.write?.(frame({ type: 'bump', ...change })));
      cleanups.set(res, () => {
        clearInterval(timer);
        unsubscribe();
      });
      res.on?.('close', () => drop(res));
    },
  };
}

export function registerFactStream(ctx: DshHostContext, log: FactLog): () => void {
  const stream = createFactStream(log);
  const unregister = ctx.webServer.register({ kind: 'exact', path: EVENTS_PATH, handler: stream.handler });
  return () => {
    stream.closeAll();
    unregister();
  };
}
