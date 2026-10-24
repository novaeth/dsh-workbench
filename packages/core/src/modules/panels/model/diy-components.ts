import { join } from 'node:path';
import type { DshHostContext, DshShell, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import {
  findFileOf,
  refusesEvery,
  renderNameText,
  renderSurfaceText,
  runSurfaceQuery,
  scopeOf,
  toolchainBinOf,
  TWO_FACE_ALL,
  wantsKit,
  wantsPrimitives,
  type SurfaceQuery,
} from '@/shared/api/host/diy-components';
import { workshopPathOf } from '@/shared/api/host/diy';
import { asRecord, asText, moduleDirsOf, OUTPUT, plainJson, workspaceOf } from './diy-context';
import { DIY_COMPONENTS_TOOL } from '../unit';

export function componentsTool(ctx: DshHostContext): DshToolDefinition {
  return {
    name: DIY_COMPONENTS_TOOL,
    description:
      '这份外壳里能用什么：dsh 原语与 kit 的清单、每件的类型文件在哪（给 name 连 JSDoc 与 prop 一起回；' +
      '给 bucket 把那一桶列全 —— 桶名见清单）。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '要看的那件（例 Card；不填就给清单）。' },
        scope: { type: 'string', enum: ['kit', 'primitives'], description: '只看某一面；不填就两个面都给目录。' },
        bucket: { type: 'string', description: '只看某一桶并列全（例 components / icons / shared/hooks；桶名以清单里那份为准）。' },
        all: { type: 'boolean', description: '列全表（默认每组前 12 个）—— 只在指名 scope 时生效；不指名 scope 时只回一句提示，不带目录。' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const args = asRecord(raw);
      const scope = scopeOf(asText(args['scope']));
      const name = asText(args['name']);
      const bucket = asText(args['bucket']);
      const all = args['all'] === true;
      if (name === '' && refusesEvery(scope, all, bucket !== '')) {
        return plainJson({
          workspace: root,
          scope,
          name,
          bucket,
          all,
          file: null,
          from: null,
          primitives: null,
          kit: null,
          text: TWO_FACE_ALL,
        });
      }
      const shellRoot = workshopPathOf(ctx);
      const shellBin = shellRoot === null ? null : toolchainBinOf(shellRoot);
      const local =
        [root, ...moduleDirsOf(root)]
          .map((dir) => ({ dir, bin: toolchainBinOf(dir) }))
          .find((one) => one.bin !== null) ?? null;
      const bin = local?.bin ?? shellBin;
      if (bin === null) {
        throw new Error(
          `这个工作区（和它各模块）里还没有 dsh-wb-module（${join(root, 'node_modules')} 下没有）—— ` +
            '在它根目录跑一次 pnpm install 就有了；workbench_diy_status 会告诉你卡在哪一步',
        );
      }
      const shell = ctx.get<DshShell>('shell');
      if (shell === undefined) throw new Error('这台机器没给 shell 服务，读不了组件清单');

      const workdir = local?.dir ?? shellRoot ?? root;
      const fallbackBin = local !== null && shellBin !== null && shellBin !== bin ? shellBin : undefined;
      const [primitives, kit] = await Promise.all([
        wantsPrimitives(scope)
          ? runSurfaceQuery(shell, bin, 'primitives', workdir, fallbackBin)
          : Promise.resolve(undefined),
        wantsKit(scope) ? runSurfaceQuery(shell, bin, 'kit', workdir, fallbackBin) : Promise.resolve(undefined),
      ]);
      const query: SurfaceQuery = {
        ...(primitives === undefined ? {} : { primitives }),
        ...(kit === undefined ? {} : { kit }),
      };
      const found = name === '' ? null : findFileOf(name, query);
      const text = name === '' ? renderSurfaceText(query, { scope, all, bucket }) : renderNameText(name, found, query);
      return plainJson({
        workspace: root,
        scope,
        name,
        bucket,
        all,
        file: found?.file ?? null,
        from: found?.from ?? null,
        primitives: primitives ?? null,
        kit: kit ?? null,
        text,
      });
    },
  };
}

export function registerComponentsTool(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  return [tools.register(componentsTool(ctx))];
}
