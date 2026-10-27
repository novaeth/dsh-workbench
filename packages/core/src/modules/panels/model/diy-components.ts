import { join } from 'node:path';
import type { DshHostContext, DshShell, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import { dshHome, readTokens, supplyPortOf } from '@dsh-workbench/shared/host';
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
import { renderTokensText } from '@/shared/api/host/diy-tokens';
import { workshopPathOf } from '@/shared/api/host/diy';
import { asRecord, asText, moduleDirsOf, OUTPUT, plainJson, workspaceOf } from './diy-context';
import { DIY_COMPONENTS_TOOL } from '../unit';

export function componentsTool(ctx: DshHostContext): DshToolDefinition {
  return {
    name: DIY_COMPONENTS_TOOL,
    description:
      '这份外壳里能用什么：dsh 原语、kit 的清单与类型文件（name 连 JSDoc 回）；CSS 令牌现读现给。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '要看的那件（例 Card；--dsw-… / --wb-… 连浅/深值回）。' },
        scope: { type: 'string', enum: ['kit', 'primitives', 'tokens'], description: '只看一面；tokens = 令牌；不填 = kit + primitives。' },
        bucket: { type: 'string', description: '只看某一桶并列全（例 components / alias / wb；桶名以清单为准）。' },
        all: { type: 'boolean', description: '列全表（默认每组前 12 个）—— 只在指名 scope 时生效。' },
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
      if (scope === 'tokens' || name.startsWith('--')) {
        const profile = supplyPortOf(ctx).profileDirOf(ctx);
        const dirs = [
          profile ?? '',
          join(dshHome(), 'profiles'),
          workshopPathOf(ctx) ?? '',
          root,
          ...moduleDirsOf(root),
        ];
        const tokens = readTokens(dirs);
        const text = renderTokensText(tokens, { name, bucket, all, searched: dirs });
        return plainJson({
          workspace: root,
          scope: 'tokens',
          name,
          bucket,
          all,
          tokens: {
            dsw: tokens.dsw === null ? null : { version: tokens.dsw.version, file: tokens.dsw.file, count: tokens.dsw.entries.length },
            wb: tokens.wb === null ? null : { version: tokens.wb.version, file: tokens.wb.file, count: tokens.wb.entries.length },
          },
          text,
        });
      }
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
