import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import { CHANGELOG_FILE, CHANGELOG_KINDS, isValidVersion } from '@dsh-workbench/shared/host';
import type { ChangelogKind } from '@dsh-workbench/shared/host';
import { moduleVersionOf, writeChangelogEntry } from '@/shared/api/host/diy-changelog';
import { insideRoot } from '@/shared/api/host/diy-modules';
import { asRecord, asText, OUTPUT, plainJson, unitsOf, workspaceOf } from './diy-context';
import { DIY_CHANGELOG_TOOL } from '../unit';

function toolOf(ctx: DshHostContext): DshToolDefinition {
  return {
    name: DIY_CHANGELOG_TOOL,
    description:
      `发布前把这一版写进 ${CHANGELOG_FILE}（\`## v0.1.0\` + \`### ✨ 新增\` 这种小节）：` +
      '传 note 就记一条，文件不在就先建。没写这一版时发布会被拦下。',
    parameters: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: '模块 id（workbench_diy_status 会给）。' },
        version: { type: 'string', description: '要写的版本；不填用 package.json 里的 version。' },
        type: {
          type: 'string',
          enum: [...CHANGELOG_KINDS],
          description: '分类：added 新增 / changed 改进 / fixed 修复 / removed 移除 / security 安全 / deprecated 弃用。',
        },
        note: { type: 'string', description: '这一版改了什么；多行时一行一条（必填）。' },
      },
      required: ['unit', 'note'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const args = asRecord(raw);
      const unit = asText(args['unit']);
      const { units } = unitsOf(ctx, root);
      if (unit === '') {
        throw new Error(`要一个 unit（这个工作区里：${units.map((one) => one.unit).join(', ') || '（空）'}）`);
      }
      const found = units.find((one) => one.unit === unit && one.dir !== '');
      if (found === undefined) {
        throw new Error(
          `这个工作区里没有单元 id 为「${unit}」的模块` +
            `（可用的：${units.map((one) => one.unit).join(', ') || '（空）'}）`,
        );
      }
      if (!insideRoot(root, found.dir)) throw new Error(`这个模块不在这个工作区里（${found.dir}）`);
      const note = asText(args['note']).trim();
      if (note === '') throw new Error('要一句 note：这一版改了什么');
      const version = (asText(args['version']) || moduleVersionOf(found.dir)).replace(/^v/, '');
      if (!isValidVersion(version)) {
        throw new Error(`版本要写成 x.y.z（收到「${version}」）—— 也可以不填，用 package.json 里的`);
      }
      const kind = asText(args['type']) || 'changed';
      if (!CHANGELOG_KINDS.includes(kind as ChangelogKind)) {
        throw new Error(`type 只认 ${CHANGELOG_KINDS.join(' / ')}（收到「${kind}」）`);
      }
      const written = writeChangelogEntry(found.dir, { version, kind: kind as ChangelogKind, note });
      return plainJson({
        ok: true,
        unit,
        version,
        type: kind,
        path: written.file,
        section: written.section,
        text: `${CHANGELOG_FILE} 已记下 ${version}（${kind}）。发布时会带进包和市场索引，审批屏会展示它。`,
      });
    },
  };
}

export function registerChangelogTool(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  return [tools.register(toolOf(ctx))];
}
