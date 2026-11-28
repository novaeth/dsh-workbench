import type { DshHostContext, DshRequest, DshResponse } from '@dsh-workbench/shared/host';
import { createFixtureHost, CONTROL_ENDPOINT, EVENTS_PATH, SCENES_ENDPOINT, TAKEOVER_ENDPOINT } from './host';
import { pathOf } from './takeover';

export const name = 'dsh-workbench-dev-plugin';

export const inject = ['webServer'];

type Handler = (req: DshRequest, res: DshResponse) => void | Promise<void>;

export async function apply(ctx: DshHostContext): Promise<void> {
  const offs = new Map<string, () => void>();
  const registerAt = (path: string, handler: Handler, kind: 'exact' | 'prefix' = 'exact'): void => {
    const key = `${kind}:${path}`;
    if (offs.has(key)) return;
    offs.set(key, ctx.webServer.register({ kind, path, handler }));
  };
  const registerRoute = (route: string, handler: Handler): void => registerAt(pathOf(route), handler);

  const host = createFixtureHost(undefined, {
    onScene: (id) => {
      if (id === 'real') {
        for (const off of offs.values()) off();
        offs.clear();
        host.close();
        return;
      }
      for (const item of host.routes) {
        if (item.kind === 'write') {
          registerAt(pathOf(item.route), async (req, res) => {
            await host.handleWrite(item.route, req, res);
          });
          continue;
        }
        registerRoute(item.route, async (req, res) => {
          await host.handle(item.route, req, res);
        });
      }
      registerRoute('changes', async (req, res) => {
        await host.handle('changes', req, res);
      });
      try {
        registerAt(EVENTS_PATH, (req, res) => {
          host.events(req, res);
        });
      } catch (error) {
        console.warn('[fixture] 事件路由已被 core 注册，切场景后需要刷新一次', error);
      }
    },
  });

  ctx.effect(
    () => {
      const endpointHandlers: readonly (readonly [string, Handler])[] = [
        [CONTROL_ENDPOINT, async (req, res) => host.control(req, res)],
        [SCENES_ENDPOINT, (req, res) => host.scenes(req, res)],
        [TAKEOVER_ENDPOINT, (req, res) => host.scenes(req, res)],
      ];
      const endpoints = endpointHandlers.map(([path, handler]) =>
        ctx.webServer.register({ kind: 'exact', path, handler }),
      );
      return () => {
        for (const off of offs.values()) off();
        offs.clear();
        host.close();
        for (const off of endpoints) off();
      };
    },
    'dev-fixtures: 精确路由接管',
  );
}
