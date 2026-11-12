import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { sessionIdOf } from '@dsh-workbench/shared/host';
import type { DebugMove, DebugRefusal, DebugState, DebugStore } from '@dsh-workbench/shared/host';
import { asRecord, asText, OUTPUT, plainJson, unitsOf, workspaceOf } from './diy-context';
import { pageAt } from './diy-page';
import {
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_STOP_TOOL,
} from '../unit';

const EMPTY: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: false };

export function debugRefusalText(code: DebugRefusal, held?: DebugState): string {
  switch (code) {
    case 'held-by-other':
      return (
        `另一场调试仍占用该页面（${held === undefined ? '另一个会话' : held.sessionId}）。` +
        '一台机器同时只允许一场，请让它先 workbench_diy_debug_stop，或等待它结束。'
      );
    case 'already-held':
      return (
        `当前会话已持有一场调试（${held === undefined ? '' : `${held.unit}，${held.phase}`}）。` +
        '要更换目标请先 workbench_diy_debug_stop；处于暂停状态时，要继续查看请使用 workbench_diy_debug_resume。'
      );
    case 'not-owner':
      return '该调试态不属于当前会话，请由发起调试的会话结束。';
    case 'none':
      return '当前没有调试态。';
    case 'already-paused':
      return '调试已暂停。要继续查看请使用 workbench_diy_debug_resume，会再次请求用户批准。';
    case 'already-debugging':
      return '正在调试中，无需再次开启。';
  }
}

export function renderDebugStart(state: DebugState): string {
  return [
    `开始调试 ${state.unit}（声明目标：${state.board === '' ? '用户当前页面' : state.board}）。`,
    '页面工具现在才会放行；没有该约定时，它们一律直接拒绝。',
    '不查看页面时请先 workbench_diy_debug_pause；结束时请调用 workbench_diy_debug_stop。',
  ].join('\n');
}

export function renderDebugPause(state: DebugState): string {
  return [
    `调试已暂停（${state.unit}）。页面工具已停用，不再以页面为目标。`,
    '修改源码、执行 build 与运行门禁照常；要查看页面请再调用 workbench_diy_debug_resume，会再次请求用户批准。',
  ].join('\n');
}

export function renderDebugResume(state: DebugState): string {
  return [
    `继续调试 ${state.unit}。请用户回到「${state.title}」页面。`,
    '模块界面不在页面上时我会直接拒绝，不会以其他面板为目标。',
  ].join('\n');
}

export function renderDebugStop(state: DebugState): string {
  return `调试已结束：${state.unit} 的调试状态已清除，页面占用已解除。`;
}

function moveOrThrow(move: DebugMove, held: DebugState | null): DebugState {
  if (move.ok) return move.state;
  throw new Error(debugRefusalText(move.code, held ?? undefined));
}

export function registerDebugTools(
  ctx: DshHostContext,
  tools: DshToolRegistry,
  store: DebugStore,
): readonly (() => void)[] {
  const startTool: DshToolDefinition = {
    name: DIY_DEBUG_START_TOOL,
    description: '开始调试：占用用户当前页面（需批准一次）。没有该约定时，页面工具一律直接拒绝。',
    parameters: {
      type: 'object',
      properties: { unit: { type: 'string', description: '已安装的 unit（不填 = 仅有一个已安装时使用它）。' } },
      required: [],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root, title } = await workspaceOf(ctx, exec);
      const { units } = unitsOf(ctx, root);
      const asked = asText(asRecord(raw)['unit']);
      const unit = asked !== '' ? asked : units.length === 1 ? (units[0]?.unit ?? '') : '';
      if (unit === '') {
        throw new Error(`需要一个 unit（已安装的：${units.map((one) => one.unit).join(', ') || '（空）'}）`);
      }
      const held = store.live(Date.now());
      const page = await pageAt(ctx, exec, raw, { requireBoard: false, requirePact: false });
      const move = store.begin({
        sessionId: sessionIdOf(exec) ?? '',
        workspacePath: root,
        title,
        board: page.boardPath,
        unit,
        name: units.find((one) => one.unit === unit)?.name ?? unit,
        now: Date.now(),
      });
      const state = moveOrThrow(move, held);
      return plainJson({
        workspace: root,
        unit,
        board: state.board,
        phase: state.phase,
        state,
        text: renderDebugStart(state),
      });
    },
  };

  const pauseTool: DshToolDefinition = {
    name: DIY_DEBUG_PAUSE_TOOL,
    description: '暂停调试（无需审批）：页面工具停用，不再以页面为目标。要继续查看请使用 debug_resume。',
    parameters: EMPTY,
    output: OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const held = store.live(Date.now());
      const state = moveOrThrow(store.pause(sessionIdOf(exec) ?? '', Date.now()), held);
      return plainJson({
        workspace: root,
        unit: state.unit,
        phase: state.phase,
        state,
        text: renderDebugPause(state),
      });
    },
  };

  const resumeTool: DshToolDefinition = {
    name: DIY_DEBUG_RESUME_TOOL,
    description: '继续调试（需批准一次）：请用户回到该场调试所在的当前页面。',
    parameters: EMPTY,
    output: OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const held = store.live(Date.now());
      const page = await pageAt(ctx, exec, { unit: held?.unit ?? '' }, {
        requireBoard: false,
        requirePact: false,
        requireUnit: false,
      });
      const state = moveOrThrow(store.resume(sessionIdOf(exec) ?? '', Date.now()), held);
      return plainJson({
        workspace: root,
        unit: state.unit,
        board: page.boardPath,
        phase: state.phase,
        state,
        text: renderDebugResume(state),
      });
    },
  };

  const stopTool: DshToolDefinition = {
    name: DIY_DEBUG_STOP_TOOL,
    description: '结束调试（无需审批）：清除"占用用户当前页面"的状态。结束时调用它。',
    parameters: EMPTY,
    output: OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const held = store.live(Date.now());
      const state = moveOrThrow(store.stop(sessionIdOf(exec) ?? '', Date.now()), held);
      await store.settle?.();
      return plainJson({
        workspace: root,
        unit: state.unit,
        phase: 'idle',
        text: `${renderDebugStop(state)}同时收尾该场调试的观察（网络捕获 / 日志钩子；未启用的无需处理）。`,
      });
    },
  };

  return [
    tools.register(startTool),
    tools.register(pauseTool),
    tools.register(resumeTool),
    tools.register(stopTool),
  ];
}
