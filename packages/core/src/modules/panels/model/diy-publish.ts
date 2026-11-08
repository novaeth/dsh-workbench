import { join } from 'node:path';
import type {
  DshHostContext,
  DshToolDefinition,
  DshToolRegistry,
  DshToolRunContext,
} from '@dsh-workbench/shared';
import {
  CHANGELOG_FILE,
  CHANGELOG_KINDS,
  productWrite,
  quoteShellArg,
  seamOf,
  workspaceWrite,
  type ShellResult,
  type WriteIntent,
} from '@dsh-workbench/shared/host';
import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { DiyModule } from '@/shared/api/host/diy-modules';
import { toolchainBinOf } from '@/shared/api/host/diy-components';
import { jsonOf } from './diy-browser';
import {
  adoptTarballFile,
  cleanupStaging,
  mirrorJournal,
  prepareStaging,
} from '@/shared/api/host/diy-release-staging';
import { asRecord, asText, OUTPUT, plainJson, workspaceOf } from './diy-context';
import { RELEASE_TARGETS } from '@dsh-workbench/shared/contract/protocol/release';
import { DIY_PUBLISH_TOOL } from '../unit';

export const PUBLISH_TIMEOUT_MS = 30 * 60 * 1000;

export interface PublishToolDeps {
  readonly resolve: (root: string, raw: unknown) => DiyModule;
  readonly previewOf: (unit: string) => PublishPreview | null;
  readonly inferredAuthorOf: (unit: string) => Promise<string | undefined>;
}

interface ReleaseRun {
  readonly intent: WriteIntent;
  readonly session?: unknown;
  readonly env?: Readonly<Record<string, string>> | undefined;
}

function adoptTarball(payload: Record<string, unknown>, unit: string): Record<string, unknown> {
  const file = asText(payload['file']);
  const dest = adoptTarballFile(file, unit);
  if (dest === undefined) return payload;
  const install = asText(payload['install']);
  return {
    ...payload,
    file: dest,
    ...(install === '' ? {} : { install: install.split(file).join(dest) }),
  };
}

function needsUserPayload(payload: Record<string, unknown>): Record<string, unknown> {
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

function resumablePayload(payload: Record<string, unknown>, unit: string): Record<string, unknown> {
  const resumeInfo = asRecord(payload['resume']);
  return plainJson({
    ...payload,
    text: [
      `发布中断在第 ${asText(resumeInfo['phase'])} 步：${asText(payload['text'])}`,
      `再调一次 workbench_diy_publish（unit=${unit}, resume=true）就能接着发。`,
    ].join('\n'),
  });
}

type PublishOutcome =
  | { readonly kind: 'done'; readonly payload: Record<string, unknown> }
  | { readonly kind: 'needs-user'; readonly payload: Record<string, unknown> }
  | { readonly kind: 'resumable'; readonly payload: Record<string, unknown> }
  | { readonly kind: 'failed'; readonly error: Error };

function outcomeOf(result: ShellResult, unit: string): PublishOutcome {
  const payload = jsonOf(result.stdout);
  if (result.exitCode === 3 && payload !== undefined) return { kind: 'needs-user', payload: needsUserPayload(payload) };
  if (result.exitCode === 4 && payload !== undefined) return { kind: 'resumable', payload: resumablePayload(payload, unit) };
  if (result.exitCode !== 0 || payload === undefined) {
    const tail = `${result.stderr}\n${result.stdout}`.trim().split('\n').slice(-6).join(' | ');
    return { kind: 'failed', error: new Error(`发布没走通（exit ${String(result.exitCode)}）${tail === '' ? '' : `：${tail}`}`) };
  }
  return { kind: 'done', payload };
}

function publishProblemOf(payload: Record<string, unknown>): string | undefined {
  if (payload['ok'] === false) {
    const reason = asText(payload['text']);
    return `市场索引这一步回的是失败，这次没发出去${reason === '' ? '' : `：${reason}`}`;
  }
  if (asText(payload['target']) !== 'market') return undefined;
  if (asText(asRecord(payload['market'])['url']) !== '' && asText(payload['install']) !== '') return undefined;
  return '市场索引这一步没给出市场地址或安装命令 —— 这次没发出去。重发一次；再这样先把本地索引镜像同步到 origin 再发。';
}

function successPayloadOf(
  payload: Record<string, unknown>,
  found: DiyModule,
  options: { readonly verify: boolean },
): Record<string, unknown> {
  const name = asText(payload['name']);
  const released = asText(payload['version']);
  const registry = asText(payload['registry']);
  const file = asText(payload['file']);
  const install = asText(payload['install']);
  const git = asRecord(payload['git']);
  const targetOfPayload = asText(payload['target']);
  const text =
    options.verify
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
  const labelList = Array.isArray(payload['labels'])
    ? (payload['labels'] as readonly unknown[]).map((one) => asText(one)).filter((one) => one !== '')
    : [];
  const labelsLine =
    labelList.length === 0 || (targetOfPayload !== 'market' && payload['refresh'] !== true)
      ? ''
      : `标签：${labelList.join(' · ')}`;
  const categoryLine =
    asText(payload['category']) === '' || (targetOfPayload !== 'market' && payload['refresh'] !== true)
      ? ''
      : `分类：${asText(payload['category'])}`;
  const tail = [changelogLine, labelsLine, categoryLine].filter((one) => one !== '').join('\n');
  return plainJson({ ...payload, unit: found.unit, text: tail === '' ? text : `${text}\n${tail}` });
}

function withPhasePayloads(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...first, ...second };
  delete merged['stop'];
  if (merged['changelog'] === undefined && first['changelog'] !== undefined) {
    merged['changelog'] = first['changelog'];
  }
  if (merged['changes'] === undefined && first['changes'] !== undefined) {
    merged['changes'] = first['changes'];
  }
  if (merged['labels'] === undefined && first['labels'] !== undefined) {
    merged['labels'] = first['labels'];
  }
  if (merged['category'] === undefined && first['category'] !== undefined) {
    merged['category'] = first['category'];
  }
  return merged;
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
      '这个模块还没有市集分类时把 category 带上（一个短词）；标签 labels 可选（最多两个短词）。',
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
            '市集条目的标签，可选，最多两个短词（说它干什么，比如「发布编排」「构建状态」）；传了会替换掉原来的。',
        },
        category: {
          type: 'string',
          description:
            '市集条目的分类，一个短词（比如「任务与协作」）。发布到市场时必填：条目还没有分类必须给一个，' +
            '已有分类可省；传了会替换掉原来的。',
        },
        target: {
          type: 'string',
          enum: [...RELEASE_TARGETS],
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
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('这台机器上没有 shell 服务，发布跑不起来');
      const bin = toolchainBinOf(root) ?? toolchainBinOf(found.dir);
      if (bin === null) {
        throw new Error(
          `这个工作区里没有 dsh-wb-module（${join(root, 'node_modules')} 下没有）—— 先 pnpm install`,
        );
      }
      const args = asRecord(raw);
      const target = asText(args['target']);
      const source = asText(args['source']);
      const version = asText(args['version']);
      const license = asText(args['license']);
      const changelogNote = asText(args['changelogNote']);
      const changelogType = asText(args['changelogType']);
      const labels = labelsOf(args['labels']);
      const category = asText(args['category']);
      let author = asText(args['author']);
      const verify = args['verify'] === true;
      const resume = args['resume'] === true;
      const refresh = args['refresh'] === true;
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
      if (category !== '') argv.push('--category', category);
      if (refresh) argv.push('--refresh');
      const run = async (extra: readonly string[], request: ReleaseRun): Promise<ShellResult> =>
        seam.run({
          command: [...argv, ...extra].map((one) => quoteShellArg(one)).join(' '),
          intent: request.intent,
          ...(request.session === undefined ? {} : { session: request.session }),
          ...(request.env === undefined ? {} : { env: request.env }),
          workdir: root,
          timeoutMs: PUBLISH_TIMEOUT_MS,
        });
      if (verify || refresh) {
        const outcome = outcomeOf(await run([], { intent: productWrite() }), found.unit);
        if (outcome.kind === 'failed') throw outcome.error;
        if (outcome.kind !== 'done') return plainJson(outcome.payload);
        return plainJson(successPayloadOf(outcome.payload, found, { verify }));
      }
      const staging = prepareStaging(found.unit, resume);
      const env = { DSH_WB_RELEASE_HOME: staging };
      const session = exec.agent?.session;
      const workspace = await run(['--workspace-only'], {
        intent: workspaceWrite(),
        ...(session === undefined ? {} : { session }),
        env,
      });
      const firstOutcome = outcomeOf(workspace, found.unit);
      mirrorJournal(staging, found.unit);
      if (firstOutcome.kind === 'failed') throw firstOutcome.error;
      if (firstOutcome.kind !== 'done') return plainJson(firstOutcome.payload);
      const first = firstOutcome.payload;
      if (first['stop'] !== 'workspace-only' || asText(first['target']) === 'local') {
        cleanupStaging(found.unit);
        return plainJson(first);
      }
      const indexOutcome = outcomeOf(await run(['--index-only'], { intent: productWrite(), env }), found.unit);
      mirrorJournal(staging, found.unit);
      if (indexOutcome.kind === 'failed') throw indexOutcome.error;
      if (indexOutcome.kind !== 'done') return plainJson(indexOutcome.payload);
      const merged = adoptTarball(withPhasePayloads(first, indexOutcome.payload), found.unit);
      const problem = publishProblemOf(merged);
      if (problem !== undefined) throw new Error(problem);
      cleanupStaging(found.unit);
      return plainJson(successPayloadOf(merged, found, { verify: false }));
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
