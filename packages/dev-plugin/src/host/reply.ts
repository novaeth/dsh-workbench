import type { DshRequest, DshResponse } from '@dsh-workbench/shared/host';
import type { FaultMode, World } from '@dsh-workbench/testkit';
import { faultOf, projectRoute } from '@dsh-workbench/testkit';

export function sendJson(res: DshResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function failureOf(route: string, fault: FaultMode): { readonly status: number; readonly payload: unknown } {
  if (fault.kind === 'http') {
    return {
      status: fault.status,
      payload: fault.body ?? {
        ok: false,
        error: { code: 'fixture-http', message: `夹具把 ${route} 回成 HTTP ${fault.status}` },
      },
    };
  }
  return {
    status: 500,
    payload: { ok: false, error: { code: 'read-failed', message: fault.kind === 'adapter-error' ? fault.error : '夹具故障' } },
  };
}

export interface ReplyResult {
  readonly held: boolean;
}

export async function reply(
  world: World,
  route: string,
  req: DshRequest,
  res: DshResponse,
): Promise<ReplyResult> {
  const fault = faultOf(world, route);
  if (fault?.kind === 'envelope') {
    sendJson(res, 200, fault.body);
    return { held: false };
  }
  if (fault?.kind === 'http' || fault?.kind === 'adapter-error') {
    const failure = failureOf(route, fault);
    sendJson(res, failure.status, failure.payload);
    return { held: false };
  }
  if (fault?.kind === 'latency') {
    await new Promise((resolve) => setTimeout(resolve, fault.ms));
  }
  if (fault?.kind === 'hang') {
    return { held: true };
  }
  const raw = req.url ?? '/';
  const cut = raw.indexOf('?');
  const query = new URLSearchParams(cut === -1 ? '' : raw.slice(cut + 1));
  const payload = projectRoute(world, route, query);
  if (payload === undefined) {
    sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `夹具没有这条投影：${route}` } });
    return { held: false };
  }
  sendJson(res, 200, payload);
  return { held: false };
}
