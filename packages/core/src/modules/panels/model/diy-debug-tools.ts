import type {
  DshHostContext,
  DshToolDefinition,
  DshToolRegistry,
  DshToolRunContext,
} from '@dsh-workbench/shared';
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
        `另一场调试还占着那块屏（${held === undefined ? '另一个会话' : held.sessionId}）—— ` +
        '一台机器同时只允许一场：让它先 workbench_diy_debug_stop，或等它收工。'
      );
    case 'already-held':
      return (
        `你这个会话已经持有一场调试（${held === undefined ? '' : `${held.unit}，${held.phase}`}）—— ` +
        '要换目标先 workbench_diy_debug_stop；暂停着要接着看用 workbench_diy_debug_resume。'
      );
    case 'not-owner':
      return '这个调试态不是你这个会话的 —— 谁开始的谁收工。';
    case 'none':
      return '现在没有调试态。';
    case 'already-paused':
      return '已经暂停了 —— 要接着看用 workbench_diy_debug_resume（会再要用户点头）。';
    case 'already-debugging':
      return '正在调试中，不用再开一次。';
  }
}

export function renderDebugStart(state: DebugState): string {
  return [
    `开始调试 ${state.unit}（声明的目标：${state.board === '' ? '用户那一屏' : state.board}）。`,
    '屏上的工具现在才放行（没有这场约定，它们一律当场拒）。',
    '不看屏时先 workbench_diy_debug_pause；收工记得 workbench_diy_debug_stop。',
  ].join('\n');
}

export function renderDebugPause(state: DebugState): string {
  return [
    `调试暂停了（${state.unit}）—— 屏工具停用，不再拿屏当目标。`,
    '改源码 / build / 跑门禁照常；要看屏再 workbench_diy_debug_resume（会再要用户点头一次）。',
  ].join('\n');
}

export function renderDebugResume(state: DebugState): string {
  return [
    `继续调试 ${state.unit} —— 请用户回到「${state.title}」那一屏。`,
    '卡不在屏上时我会当场拒（不拿别的板当目标）。',
  ].join('\n');
}

export function renderDebugStop(state: DebugState): string {
  return `收工了：${state.unit} 的调试态清掉了（占用解除）。`;
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
    description: '开始调试：占用用户那一屏（要点头一次）。没有它，屏上的工具一律当场拒。',
    parameters: {
      type: 'object',
      properties: { unit: { type: 'string', description: '装过的 unit（不填 = 只有一个装过就用它）。' } },
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
        throw new Error(`要一个 unit（装过的：${units.map((one) => one.unit).join(', ') || '（空）'}）`);
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
    description: '暂停调试（不审批）：屏工具停用，不再拿屏当目标。要接着看用 debug_resume。',
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
    description: '继续调试（要点头一次）：请用户回到这一场调试所在的那一屏。',
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
    description: '结束调试（不审批）：清掉"占用用户那一屏"这件事。收工用它。',
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
        text: `${renderDebugStop(state)}顺手把这一场的观察收一收（网络捕获 / 日志钩子 —— 没开着的不用管）。`,
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
