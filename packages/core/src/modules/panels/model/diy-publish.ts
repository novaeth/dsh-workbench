import { join } from 'node:path';
import type {
  DshHostContext,
  DshShell,
  DshToolDefinition,
  DshToolRegistry,
  DshToolRunContext,
} from '@dsh-workbench/shared';
import { CHANGELOG_FILE, CHANGELOG_KINDS, quoteShellArg, runShell } from '@dsh-workbench/shared/host';
import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { DiyModule } from '@/shared/api/host/diy-modules';
import { toolchainBinOf } from '@/shared/api/host/diy-components';
import { jsonOf } from './diy-browser';
import { asRecord, asText, OUTPUT, plainJson, workspaceOf } from './diy-context';
import { DIY_PUBLISH_TOOL } from '../unit';

export const PUBLISH_TIMEOUT_MS = 30 * 60 * 1000;

export interface PublishToolDeps {
  readonly resolve: (root: string, raw: unknown) => DiyModule;
  readonly previewOf: (unit: string) => PublishPreview | null;
  readonly inferredAuthorOf: (unit: string) => Promise<string | undefined>;
}

export function registerPublishTool(
  ctx: DshHostContext,
  tools: DshToolRegistry,
  deps: PublishToolDeps,
): () => void {
  const publishTool: DshToolDefinition = {
    name: DIY_PUBLISH_TOOL,
    description:
      '用户说“发布”后才用：把这一格发到 target 指定的出口（不填按环境默认）。' +
      '这一版还没有更新日志时把 changelogNote 一起带上 —— 发布时写进 CHANGELOG.md，随包发。' +
      '这个模块还没有市集标签时把 labels 带上（1–2 个短词）。',
    parameters: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: '模块 id（workbench_diy_status 会给）。' },
        changelogNote: {
          type: 'string',
          description: '这一版改了什么，一行一条；这一版还没有更新日志时必填（文件不在会先建）。',
        },
        changelogType: {
          type: 'string',
          enum: [...CHANGELOG_KINDS],
          description: '分类，不填按 changed。',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description:
            '市集条目的标签，1–2 个短词（说它干什么，比如「发布编排」「构建状态」）。' +
            '模块还没有标签时必填；已有可省，传了会替换掉原来的。',
        },
        target: {
          type: 'string',
          enum: ['team', 'public', 'tarball', 'git', 'market', 'local'],
          description:
            '发到哪：团队源 / 公共 npm / 安装包 / git / 模块市场索引；不填按环境默认（有可写索引走市场，有私源走团队源，否则安装包）。',
        },
        version: {
          type: 'string',
          description: '可选：patch / minor / major / x.y.z；不填首次用当前版本，之后自动 patch。',
        },
        source: {
          type: 'string',
          description: '发布到哪个索引源（workbench_market_sources 会给 id）；不填用唯一可发布的源。',
        },
        verify: {
          type: 'boolean',
          description: '只核已发布的包（交接验证码后用），不再发；不用审批。',
        },
        resume: {
          type: 'boolean',
          description: '中断后接着发（用记录里的出口与版本）。',
        },
        license: {
          type: 'string',
          description: '公开发布用的许可证（MIT / Apache-2.0 / 仓库已有 LICENSE）。',
        },
        author: {
          type: 'string',
          description: '署谁的名（姓名，或 姓名 <邮箱>）；用户点了名才传，不传按模块里写的，没写用推断的署名。',
        },
        refresh: {
          type: 'boolean',
          description: '只刷市集元数据（标题/作者/说明/标签），不升版本、不重发产物。',
        },
      },
      required: ['unit'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const found = deps.resolve(root, raw);
      const shell = ctx.get<DshShell>('shell');
      if (shell === undefined) throw new Error('这台机器上没有 shell 服务，发布跑不起来');
      const bin = toolchainBinOf(root) ?? toolchainBinOf(found.dir);
      if (bin === null) {
        throw new Error(
          `这个工作区里没有 dsh-wb-module（${join(root, 'node_modules')} 下没有）—— 先 pnpm install`,
        );
      }
      const target = asText(asRecord(raw)['target']);
      const source = asText(asRecord(raw)['source']);
      const version = asText(asRecord(raw)['version']);
      const license = asText(asRecord(raw)['license']);
      const changelogNote = asText(asRecord(raw)['changelogNote']);
      const changelogType = asText(asRecord(raw)['changelogType']);
      const labels = labelsOf(asRecord(raw)['labels']);
      let author = asText(asRecord(raw)['author']);
      const verify = asRecord(raw)['verify'] === true;
      const resume = asRecord(raw)['resume'] === true;
      if (!verify && target !== 'local' && author === '' && (deps.previewOf(found.unit)?.author ?? '') === '') {
        author = (await deps.inferredAuthorOf(found.unit)) ?? '';
      }
      const argv = [bin, 'release', '--cwd', found.dir, '--json'];
      if (verify) argv.push('--verify');
      else argv.push('--yes');
      if (resume) argv.push('--resume');
      if (target !== '') argv.push('--target', target);
      if (source !== '') argv.push('--index-source', source);
      if (version !== '') argv.push('--version', version);
      if (license !== '') argv.push('--license', license);
      if (author !== '') argv.push('--author', author);
      if (changelogNote !== '') argv.push('--changelog-note', changelogNote);
      if (changelogType !== '') argv.push('--changelog-type', changelogType);
      for (const label of labels) argv.push('--label', label);
      if (asRecord(raw)['refresh'] === true) argv.push('--refresh');
      const result = await runShell(shell, argv.map((one) => quoteShellArg(one)).join(' '), {
        workdir: root,
        timeoutMs: PUBLISH_TIMEOUT_MS,
      });
      const payload = jsonOf(result.stdout);
      if (result.exitCode === 3 && payload !== undefined) {
        const needs = asRecord(payload['needsUser']);
        const stepText = asText(needs['text']);
        const command = asText(needs['command']);
        return plainJson({
          ...payload,
          text: [
            `还差一步：${stepText}`,
            ...(command === '' ? [] : [`命令：${command}`]),
            '做完跟我说「好了」，我接着发。',
          ].join('\n'),
        });
      }
      if (result.exitCode === 4 && payload !== undefined) {
        const resumeInfo = asRecord(payload['resume']);
        return plainJson({
          ...payload,
          text: [
            `发布中断在第 ${asText(resumeInfo['phase'])} 步：${asText(payload['text'])}`,
            `再调一次 workbench_diy_publish（unit=${found.unit}, resume=true）就能接着发。`,
          ].join('\n'),
        });
      }
      if (result.exitCode !== 0 || payload === undefined) {
        const tail = `${result.stderr}\n${result.stdout}`.trim().split('\n').slice(-6).join(' | ');
        throw new Error(`发布没走通（exit ${String(result.exitCode)}）${tail === '' ? '' : `：${tail}`}`);
      }
      const name = asText(payload['name']);
      const released = asText(payload['version']);
      const registry = asText(payload['registry']);
      const file = asText(payload['file']);
      const install = asText(payload['install']);
      const git = asRecord(payload['git']);
      const targetOfPayload = asText(payload['target']);
      const text =
        verify
          ? [`已核过 ${name}@${released}`, `安装：${install}`, '没有重新发布。'].join('\n')
          : payload['refresh'] === true
            ? [
                payload['refreshed'] === true
                  ? `已刷新 ${name} 的市集元数据（版本 ${released} 不变）`
                  : `${name} 的市集元数据本来就是这样，没动`,
                `市场索引：${asText(asRecord(payload['market'])['url'])}`,
              ].join('\n')
            : targetOfPayload === 'tarball'
          ? [`安装包在 ${file}`, `本机装：${install}`, '文件可以从对话里带走，发给同事。'].join('\n')
          : targetOfPayload === 'git'
            ? [
                `已推到 ${asText(git['url'])}（tag ${asText(git['tag'])}）`,
                `安装：${install}`,
                '已核过 tag 里的产物。',
              ].join('\n')
            : targetOfPayload === 'market'
              ? [
                  `已发到市场索引 ${asText(asRecord(payload['market'])['url'])}`,
                  `安装：${install}`,
                  '已从索引仓库侧核过产物。',
                ].join('\n')
              : targetOfPayload === 'local'
                ? '没发，留在本机。'
                : [
                    `已发布 ${name}@${released} → ${registry}`,
                    `同事安装：${install}`,
                    '包内容已经从源上核过（dist/host.js / client.js / cordis.patch.yml 都在）。',
                  ].join('\n');
      const changelog = asRecord(payload['changelog']);
      const changelogLine =
        asText(changelog['action']) === 'written'
          ? `更新日志：已写进 ${CHANGELOG_FILE} 的 ${asText(changelog['version'])}`
          : asText(changelog['action']) === 'kept'
            ? `更新日志：这一版已有（${asText(changelog['version'])}），没动`
            : '';
      const labelsLine =
        labels.length === 0 || (targetOfPayload !== 'market' && payload['refresh'] !== true)
          ? ''
          : `标签：${labels.join(' · ')}`;
      const tail = [changelogLine, labelsLine].filter((one) => one !== '').join('\n');
      return plainJson({ ...payload, text: tail === '' ? text : `${text}\n${tail}` });
    },
  };

  return tools.register(publishTool);
}

function labelsOf(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const labels = value.flatMap((one) => (typeof one === 'string' ? [one.trim()] : []));
  if (labels.length !== value.length || labels.some((one) => one === '' || /[\r\n]/u.test(one))) {
    throw new Error('标签是 1–2 个短词：每个都得是一行非空文字');
  }
  const unique = [...new Set(labels)];
  if (unique.length > 2) {
    throw new Error(`标签最多两个（收到 ${String(unique.length)} 个）—— 挑最能说明这个模块干什么的`);
  }
  return unique;
}
