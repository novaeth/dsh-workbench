import type {
  DshHostContext,
  DshShell,
  DshToolDefinition,
  DshToolRegistry,
  DshToolRunContext,
} from '@dsh-workbench/shared';
import { backgroundLine, runShell } from '@dsh-workbench/shared/host';
import { opencliCommandOf } from '@/shared/api/host/opencli-command';
import { asNumber, asRecord, asText, OUTPUT, plainJson } from './diy-context';
import { jsonOf } from './diy-browser';
import { DIY_SPEC_TOOL } from '../unit';

export const SPEC_TIMEOUT_MS = 20000;

export function specArgvOf(command: string): readonly string[] {
  const parts = command
    .trim()
    .replace(/\//g, ' ')
    .split(/\s+/)
    .filter((one) => one !== '');
  if (parts.length !== 2) return [];
  return [parts[0] ?? '', parts[1] ?? '', '--help', '-f', 'json'];
}

export function specTool(ctx: DshHostContext): DshToolDefinition {
  return {
    name: DIY_SPEC_TOOL,
    description:
      '问一条 opencli 命令的形状（入参 / 出参列 / access / 预览档）：`--help -f json` 原样回，插件与内置都能问。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'site 与名字两个词，例 `inventory publish`（`inventory/publish` 也认）。' },
        timeoutMs: { type: 'number', description: '超时毫秒（默认 20000）。' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, _exec: DshToolRunContext) {
      const args = asRecord(raw);
      const argv = specArgvOf(asText(args['command']));
      if (argv.length === 0) {
        throw new Error('给一条命令，site 与名字两个词 —— 例 `inventory publish`（`inventory/publish` 也认）。');
      }
      const shell = ctx.get<DshShell>('shell');
      if (shell === undefined) throw new Error('这台机器上没有 shell 服务，问不了 opencli');
      const asked = asNumber(args['timeoutMs']);
      const timeoutMs = asked !== undefined && asked > 0 ? asked : SPEC_TIMEOUT_MS;
      const result = await runShell(shell, backgroundLine(opencliCommandOf(ctx).command, argv), { timeoutMs });
      const spec = jsonOf(result.stdout);
      return plainJson({
        ok: result.exitCode === 0 && !result.timedOut,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        ...(spec === undefined ? {} : { spec }),
      });
    },
  };
}

export function registerSpecTool(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  return [tools.register(specTool(ctx))];
}
