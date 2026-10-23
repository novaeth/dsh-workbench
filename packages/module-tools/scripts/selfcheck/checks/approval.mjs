import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR, declaration } from '../lib.mjs';

export const checks = [
  {
    title:
      '写工具的审批口径：writes:true 没给 needsApproval 就红（点名叫 needsApproval）；' +
      '回了 ask 却没给 approvalDetail 也红（点名叫 approvalDetail）；' +
      '按声明必填项造的合成调用、依赖参数的合法口径、拿不到 shell 的降级写法都不红；' +
      '没注册 parameters 时判红并点名叫 parameters',
    run(_ctx, report) {
      const title =
        '写工具的审批口径：writes:true 没给 needsApproval 就红（点名叫 needsApproval）；' +
        '回了 ask 却没给 approvalDetail 也红（点名叫 approvalDetail）；' +
        '按声明必填项造的合成调用、依赖参数的合法口径、拿不到 shell 的降级写法都不红；' +
        '没注册 parameters 时判红并点名叫 parameters';
      const probe = mkdtempSync(join(PACKAGES_DIR, '.approval-'));
      const SHAPE = `, parameters: {
          type: 'object',
          properties: { env: { type: 'string', enum: ['dev'] }, confirm: { type: 'boolean' } },
          required: ['env'],
          additionalProperties: false,
        }`;

      const SHAPE_NO_CONFIRM = `, parameters: {
          type: 'object',
          properties: { env: { type: 'string', enum: ['dev'] } },
          required: ['env'],
          additionalProperties: false,
        }`;
      const ASK = `{
      kind: 'ask',
      reason: '会覆盖产物',
      question: { zh: '要重建这 3 个模块吗？', en: 'Rebuild these 3 modules?' },
      fallback: { zh: '会覆盖它们的 dist 与 client.js', en: 'Overwrites their dist and client.js' },
    }`;
      const DETAIL = `{ zh: '会覆盖 3 个模块的产物，不碰源码', en: 'Overwrites 3 modules, sources untouched' }`;
      const faceSource = (parameters, hooks) => `const face = {
  unit: 'demo-approval',
  mount: ({ ctx }) => ({
    routes: {},
    registerTools: () => [ctx.get('tools').register({ name: 'demo_write'${parameters} })],
    ${hooks}
  }),
};
export const name = '@dsh-workbench/module-demo-approval';
export const inject = ['workbenchUnits'];
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-approval');
}
`;

      const shellDependentSource = (parameters, hooks) => `const face = {
  unit: 'demo-approval',
  mount: ({ ctx }) => {
    const register = () => [ctx.get('tools').register({ name: 'demo_write'${parameters} })];
    if (ctx.get('shell') === undefined) return { routes: {}, registerTools: register };
    return { routes: {}, registerTools: register, ${hooks} };
  },
};
export const name = '@dsh-workbench/module-demo-approval';
export const inject = ['workbenchUnits'];
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-approval');
}
`;
      const runContracts = () => {
        try {
          const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'contracts'], {
            cwd: probe,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const expectRed = (why, needle) => {
        const result = runContracts();
        if (!result.failed) throw new Error(`${why}，居然没被判红`);
        if (!result.out.includes(needle)) {
          throw new Error(`${why}：判红了，但没说清是 ${needle} 那条：\n${result.out}`);
        }
        return result.out;
      };
      const expectGreen = (why) => {
        const result = runContracts();
        if (result.failed) throw new Error(`${why}，却判红了（一刀切了）：\n${result.out}`);
        return result.out;
      };
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        mkdirSync(join(probe, 'dist'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-approval',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },

                workbench: declaration('demo-approval', {
                  tools: [{ name: 'demo_write', writes: true }],
                }),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(join(probe, 'src/client.tsx'), 'export const card = null;\n');

        writeFileSync(join(probe, 'dist/host.js'), faceSource('', ''));
        expectRed('会写却没认领审批', 'needsApproval');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource('', `needsApproval: () => (${ASK}),\n    approvalDetail: () => (${DETAIL}),`),
        );
        expectGreen('补上审批口径之后');

        writeFileSync(join(probe, 'dist/host.js'), faceSource('', `needsApproval: () => (${ASK}),`));
        expectRed('回了 ask 却没给 approvalDetail', 'approvalDetail');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            SHAPE_NO_CONFIRM,
            `needsApproval: (call) => (call.arguments?.confirm === true ? ${ASK} : { kind: 'read' }),\n` +
              `    approvalDetail: (call) => (call.arguments?.confirm === true ? ${DETAIL} : undefined),`,
          ),
        );
        const conditional = expectGreen('参数表里没有 confirm，探针够不着 ask 那条路');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            SHAPE,
            `needsApproval: (call) => (call.arguments?.confirm === true ? ${ASK} : { kind: 'read' }),\n` +
              `    approvalDetail: (call) => (call.arguments?.confirm === true ? { zh: '改对象文件：对象「diep-dify」的「tencent-test-values.yaml」 仓库：helm 提交信息：chore(dify): upgrade tencent-test api/web images to hotfix-1.17.1-fix.4 修复自部署控制台「插件详情」弹窗内嵌 marketplace 被 CSP frame-ancestors 拦截的问题（上游 PR #42576：自部署改为新标签页打开详情）。', en: 'edit' } : undefined),`,
          ),
        );
        expectRed('明细里塞了一整条 commit message', '太长');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            SHAPE,
            `needsApproval: (call) => (call.arguments?.confirm === true ? ${ASK} : { kind: 'read' }),\n` +
              `    approvalDetail: (call) => (call.arguments?.confirm === true ? { zh: '要重建这 3 个模块\\n不碰源码', en: 'rebuild' } : undefined),`,
          ),
        );
        expectRed('明细里有换行', '换行');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            SHAPE,
            `needsApproval: (call) => (call.arguments?.confirm === true ? ${ASK} : { kind: 'read' }),\n` +
              `    approvalDetail: (call) => (call.arguments?.confirm === true ? ${DETAIL} : undefined),`,
          ),
        );
        if (expectGreen('参数表里声明了 confirm 时，探针验到真正那一次').includes('判据只能验到这一步')) {
          throw new Error('探针已经把 confirm 给上了，却还在说"只能验到这一步"—— 那句话该只留给够不着的那一档');
        }

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            SHAPE_NO_CONFIRM,
            `needsApproval: (call) => (call.arguments?.confirm === true ? ${ASK} : { kind: 'deny', reason: '这一通跑不成：先把它收工' }),\n` +
              `    approvalDetail: (call) => (call.arguments?.confirm === true ? ${DETAIL} : undefined),`,
          ),
        );
        const denied = expectGreen('说"这一通跑不成"（deny）也是合法口径');
        if (!denied.includes('判据只能验到这一步')) {
          throw new Error('deny 过关了却没把"判据验不了什么"写进 notes —— 作者会以为它已经被验过');
        }

        writeFileSync(join(probe, 'dist/host.js'), faceSource(SHAPE, `needsApproval: () => ({ kind: 'deny', reason: '  ' }),`));
        expectRed('deny 没给理由', '没给出合法口径');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            SHAPE,
            `needsApproval: (call) => (typeof call.arguments?.env === 'string' && call.arguments.env !== '' ? { kind: 'read' } : undefined),`,
          ),
        );
        expectGreen('按声明的必填项造出合成调用之后');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            '',
            `needsApproval: (call) => (typeof call.arguments?.env === 'string' && call.arguments.env !== '' ? { kind: 'read' } : undefined),`,
          ),
        );
        expectRed('没交 parameters 时只能拿空参数探', 'parameters');

        writeFileSync(
          join(probe, 'dist/host.js'),
          shellDependentSource(SHAPE, `needsApproval: () => (${ASK}), approvalDetail: () => (${DETAIL}),`),
        );
        expectGreen('模块在拿不到 shell 时会降级（判据的假 deps 要给 shell）');

        if (!conditional.includes('判据只能验到这一步')) {

          throw new Error('依赖参数的合法口径过了，但没有把"判据验不了什么"写进 notes');
        }
        report(title, true);
      } catch (error) {
        report(title, false, `写工具的审批判据坏了：${error.message}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
];
