import { PKG_URL, fakePost, fakeRes, fakeStreamRes } from '../lib.mjs';

export const checks = [
  {
    title: 'dist/host/index.js 导出 apply() 且声明 inject: [webServer]',
    async run(ctx, report) {

      const host = await import(new URL('dist/host/index.js', PKG_URL).href);
      ctx.host = host;

      ctx.WORKBENCH_ROOT = PKG_URL;
      report(
        'dist/host/index.js 导出 apply() 且声明 inject: [webServer]',
        typeof host.apply === 'function' && Array.isArray(host.inject) && host.inject.includes('webServer'),
      );
    },
  },
  {
    title: '宿主 apply 交出了 workbenchUnits 服务',
    run(ctx, report) {
      const { host } = ctx;
      const routes = [];
      const listeners = [];
      const hostProvided = new Map();
      const hostCtx = {
        effect: (fn) => {
          fn();
          return () => {};
        },
        on: (event, listener) => {
          listeners.push({ event, listener });
          return () => {};
        },

        get: (name) => hostProvided.get(name),
        provide: (name, value) => {
          hostProvided.set(name, value);
          return () => {};
        },
        inject: () => () => {},
        logger: { info: () => {}, warn: () => {} },
        webServer: {
          register: (route) => {
            routes.push(route);
            return () => {
              const index = routes.indexOf(route);
              if (index >= 0) routes.splice(index, 1);
            };
          },
        },
      };
      host.apply(hostCtx);
      ctx.routes = routes;
      ctx.listeners = listeners;
      ctx.hostProvided = hostProvided;
      const hostUnitsApi = hostProvided.get('workbenchUnits');
      ctx.hostUnitsApi = hostUnitsApi;
      report('宿主 apply 交出了 workbenchUnits 服务', hostUnitsApi !== undefined);
    },
  },
  {
    title: '后注册的套件当场被挂载；注销后名单里没有它、再挂也不会带上它',
    run(ctx, report) {
      const { hostUnitsApi } = ctx;

      const lateMounts = [];
      const disposeLate = hostUnitsApi.registerOwned({
        unit: 'late-unit',
        manifest: { id: 'late-unit', card: null, tools: [], host: { inject: [] } },
        mount: () => {
          lateMounts.push('late-unit');
          return { routes: { 'late-unit/ping': async () => ({ ok: true }) }, registerTools: () => [] };
        },
      });
      const lateMountedOnce = lateMounts.length === 1;
      disposeLate();
      report(
        '后注册的套件当场被挂载；注销后名单里没有它、再挂也不会带上它',
        lateMountedOnce && lateMounts.length === 1 && hostUnitsApi.manifests().every((m) => m.id !== 'late-unit'),
        `挂了 ${lateMounts.length} 次`,
      );
    },
  },
  {
    title: '★ 一个套件的面挂载时抛错 → 只废它自己：后面注册的套件照挂，外壳没被带走',
    run(ctx, report) {
      const { hostUnitsApi } = ctx;

      const brokenMounts = [];
      const afterBroken = [];
      const disposeBroken = hostUnitsApi.registerOwned({
        unit: 'broken-unit',
        manifest: { id: 'broken-unit', card: null, tools: [], host: { inject: [] } },
        mount: () => {
          brokenMounts.push('broken-unit');
          throw new Error('模块自己的 bug');
        },
      });
      const disposeAfterBroken = hostUnitsApi.registerOwned({
        unit: 'after-broken',
        manifest: { id: 'after-broken', card: null, tools: [], host: { inject: [] } },
        mount: () => {
          afterBroken.push('after-broken');
          return { routes: { 'after-broken/ping': async () => ({ ok: true }) }, registerTools: () => [] };
        },
      });
      report(
        '★ 一个套件的面挂载时抛错 → 只废它自己：后面注册的套件照挂，外壳没被带走',
        brokenMounts.length === 1 && afterBroken.length === 1,
        `坏面挂了 ${brokenMounts.length} 次 · 好面挂了 ${afterBroken.length} 次`,
      );
      disposeBroken();
      disposeAfterBroken();
    },
  },
  {
    title: 'apply() 注册了外壳自己的七条前缀路由（模块带的路由由模块自己挂）',
    run(ctx, report) {

      const prefixRoutes = ctx.routes.filter((r) => r.kind === 'prefix');

      const SHELL_PREFIXES = [
        '/workbench/api',
        '/workbench/api/prefs',
        '/workbench/api/actions',
        '/workbench/api/provision',
        '/workbench/api/panel-state',
        '/workbench/api/diy-debug',
        '/workbench/api/diy-record',
      ];
      report(
        'apply() 注册了外壳自己的七条前缀路由（模块带的路由由模块自己挂）',
        prefixRoutes.map((r) => r.path).sort().join(' ') === [...SHELL_PREFIXES].sort().join(' ') &&
          prefixRoutes.every((r) => r.kind === 'prefix'),
        prefixRoutes.map((r) => r.path).join(' + '),
      );
    },
  },
  {
    title: '★ apply() 注册了**恰好一条** exact 路由 —— 变更流（多了就是有人又开了一条通道）',
    run(ctx, report) {
      const streamRoutes = ctx.routes.filter((r) => r.kind === 'exact');
      report(
        '★ apply() 注册了**恰好一条** exact 路由 —— 变更流（多了就是有人又开了一条通道）',
        streamRoutes.length === 1 && streamRoutes[0]?.path === '/workbench/events',
        streamRoutes.map((r) => `${r.kind}:${r.path}`).join(' + ') || '（没有）',
      );
    },
  },
  {
    title: '★ apply() 在装配期也收窄工具面（system-prompt/assemble 恰好一条）',
    async run(ctx, report) {
      const { routes, listeners } = ctx;
      const route = routes.find((r) => r.path === '/workbench/api');
      const prefsRoute = routes.find((r) => r.path === '/workbench/api/prefs');
      ctx.route = route;
      ctx.prefsRoute = prefsRoute;

      const assembleListeners = listeners
        .filter((one) => one.event === 'system-prompt/assemble')
        .map((one) => one.listener);
      ctx.assembleListeners = assembleListeners;
      const widened = { tools: [{ name: 'workbench_panels' }, { name: 'bash' }] };
      const narrowed = await assembleListeners[0](
        widened,
        { scope: { session: { header: {} } } },
        () => Promise.resolve(widened),
      );
      ctx.narrowed = narrowed;
      report(
        '★ apply() 在装配期也收窄工具面（system-prompt/assemble 恰好一条）',
        assembleListeners.length === 1 && narrowed.tools.map((tool) => tool.name).join(',') === 'workbench_panels,bash',
        `零套件时不做删减 · ${listeners.map((one) => one.event).join(' + ') || '（没有监听）'}`,
      );
    },
  },
  {
    title: 'GET /health 返回 200 + JSON{ok:true, pid:本进程} + 无 profileContext 时 profile 为 null（不读环境变量）',
    async run(ctx, report) {
      const healthRes = fakeRes();
      await ctx.route.handler({ method: 'GET', url: '/workbench/api/health' }, healthRes);
      let health;
      try {
        health = JSON.parse(healthRes.body);
      } catch {
        health = null;
      }
      ctx.health = health;
      report(
        'GET /health 返回 200 + JSON{ok:true, pid:本进程} + 无 profileContext 时 profile 为 null（不读环境变量）',
        healthRes.statusCode === 200 &&
          health?.ok === true &&
          health?.pid === process.pid &&
          health?.profile === null,
        `${healthRes.statusCode} · ${JSON.stringify(health)}`.slice(0, 90),
      );
    },
  },
  {
    title: 'profile 取自 profileContext.dir 的 basename，且环境变量被污染也不受影响',
    async run(ctx, report) {
      const { host } = ctx;

      process.env.DSH_PROFILE = 'wrong-profile-from-env';
      const withProfile = [];
      const provided = new Map();
      host.apply({
        effect: (fn) => {
          fn();
        },
        get: (name) => (name === 'profileContext' ? { dir: '/tmp/dsh-profiles/workbench' } : provided.get(name)),
        provide: (name, value) => {
          provided.set(name, value);
          return () => {};
        },
        inject: () => () => {},
        logger: { info: () => {}, warn: () => {} },
        webServer: {
          register: (r) => {
            withProfile.push(r);
            return () => {
              const index = withProfile.indexOf(r);
              if (index >= 0) withProfile.splice(index, 1);
            };
          },
        },
      });

      const profileRoute = withProfile.find((r) => r.path === '/workbench/api');
      ctx.profileRoute = profileRoute;
      const profileRes = fakeRes();
      await profileRoute.handler({ method: 'GET', url: '/workbench/api/health' }, profileRes);
      const profileHealth = JSON.parse(profileRes.body);
      ctx.profileHealth = profileHealth;
      report(
        'profile 取自 profileContext.dir 的 basename，且环境变量被污染也不受影响',
        profileHealth.profile === 'workbench' && profileHealth.profile !== process.env.DSH_PROFILE,
        `profile=${String(profileHealth.profile)} env=${process.env.DSH_PROFILE}`,
      );
    },
  },
  {
    title: '没有 shell 时 panels 单元仍然可用，且清单为空（外壳自带零业务模块，全是装进来的；ADR-0009）',
    async run(ctx, report) {

      const panelsRes = fakeRes();
      await ctx.profileRoute.handler({ method: 'GET', url: '/workbench/api/panels' }, panelsRes);
      const panelsBody = JSON.parse(panelsRes.body);
      ctx.panelsBody = panelsBody;
      report(
        '没有 shell 时 panels 单元仍然可用，且清单为空（外壳自带零业务模块，全是装进来的；ADR-0009）',
        panelsBody.ok === true &&
          Array.isArray(panelsBody.units) &&
          panelsBody.units.length === 0 &&
          panelsBody.units.every((unit) => unit.id !== 'panels'),
        `${panelsBody.units?.length ?? 0} 个套件`,
      );
    },
  },
  {
    title: '业务投影：未知子路径 404、非 GET 405',
    async run(ctx, report) {
      const missingRes = fakeRes();
      await ctx.route.handler({ method: 'GET', url: '/workbench/api/nope' }, missingRes);
      const postRes = fakeRes();
      await ctx.route.handler({ method: 'POST', url: '/workbench/api/health' }, postRes);
      report(
        '业务投影：未知子路径 404、非 GET 405',
        missingRes.statusCode === 404 && postRes.statusCode === 405,
        `${missingRes.statusCode} / ${postRes.statusCode}`,
      );
    },
  },
  {
    title: '偏好写：只认 POST（GET 405）、只服务 panels 一个资源、拒业务类动作、坏 JSON 400',
    async run(ctx, report) {

      const prefsGetRes = fakeRes();
      await ctx.prefsRoute.handler({ method: 'GET', url: '/workbench/api/prefs/panels' }, prefsGetRes);
      const prefsBadResource = fakeRes();
      await ctx.prefsRoute.handler(fakePost('/workbench/api/prefs/nope', '{}'), prefsBadResource);
      const prefsBadAction = fakeRes();
      await ctx.prefsRoute.handler(
        fakePost('/workbench/api/prefs/panels', JSON.stringify({ action: 'comment' })),
        prefsBadAction,
      );
      const prefsBadJson = fakeRes();
      await ctx.prefsRoute.handler(fakePost('/workbench/api/prefs/panels', '不是 json'), prefsBadJson);
      report(
        '偏好写：只认 POST（GET 405）、只服务 panels 一个资源、拒业务类动作、坏 JSON 400',
        prefsGetRes.statusCode === 405 &&
          JSON.parse(prefsBadResource.body).ok === false &&
          JSON.parse(prefsBadAction.body).ok === false &&
          prefsBadJson.statusCode === 400,
        `GET ${prefsGetRes.statusCode} · 资源 ${JSON.parse(prefsBadResource.body).ok} · 动作 ${JSON.parse(prefsBadAction.body).ok} · 坏 JSON ${prefsBadJson.statusCode}`,
      );
    },
  },
  {
    title: '★ 降级档（GET /changes）答的是同一份账本：修订 + 纪元 + 事实名',
    async run(ctx, report) {

      const ledger = async () => {
        const res = fakeRes();
        await ctx.route.handler({ method: 'GET', url: '/workbench/api/changes?since=0' }, res);
        return JSON.parse(res.body);
      };
      ctx.ledger = ledger;
      const snapshot = await ledger();
      report(
        '★ 降级档（GET /changes）答的是同一份账本：修订 + 纪元 + 事实名',
        snapshot.ok === true && typeof snapshot.rev === 'number' && typeof snapshot.epoch === 'string',
        JSON.stringify(snapshot).slice(0, 90),
      );
    },
  },
  {
    title: '★ 变更流首帧是对游标的同步（纪元 + 修订 + 差量）',
    async run(ctx, report) {
      const streamRes = fakeStreamRes();
      ctx.streamRes = streamRes;
      await ctx.routes.find((r) => r.kind === 'exact').handler({ method: 'GET', url: '/workbench/events?since=0' }, streamRes);
      report(
        '★ 变更流首帧是对游标的同步（纪元 + 修订 + 差量）',
        streamRes.chunks.join('').includes('"type":"sync"'),
        streamRes.chunks.join('').slice(0, 90),
      );
    },
  },
  {
    title: '★ 变更流声明成 SSE 且带 no-transform（压缩中间件攒够阈值才吐 = 推送变延迟推送）',
    run(ctx, report) {
      const { streamRes } = ctx;
      report(
        '★ 变更流声明成 SSE 且带 no-transform（压缩中间件攒够阈值才吐 = 推送变延迟推送）',
        String(streamRes.headers['content-type']).includes('text/event-stream') &&
          String(streamRes.headers['cache-control']).includes('no-transform'),
        `${streamRes.headers['content-type']} · ${streamRes.headers['cache-control']}`,
      );
    },
  },
];
