/**
 * 一条长任务的五种态；needs-login 与 running 一样算还没结束，stopped 是用户自己按停的。
 */
export type LongTaskStatus = 'running' | 'needs-login' | 'stopped' | 'ok' | 'failed';

/**
 * 长任务步骤流里的一行：kind 定样式，登录那一步带 loginUrl 给用户去点。
 */
export interface LongTaskStep {
  readonly kind: 'start' | 'succeed' | 'fail' | 'info' | 'warn';
  readonly text: string;
  readonly loginUrl?: string | undefined;
}

/**
 * 单元的长任务读口路由。
 * @param unit 单元 id。
 * @returns <unit>/runs。
 */
export function runsRouteOf(unit: string): string {
  return `${unit}/runs`;
}

/**
 * 停止那条写路由（走 actions 通道的资源名）：`<单元>/runs/stop`。
 * @param unit 单元 id。
 * @returns <unit>/runs/stop。
 */
export function stopRouteOf(unit: string): string {
  return `${unit}/runs/stop`;
}

/**
 * 长任务读口回的载荷：一串 run，形状由模块自己定，外壳只透传。
 */
export interface LongTasksPayload {
  readonly runs: readonly Readonly<Record<string, unknown>>[];
}

/**
 * 有长任务在跑时的轮询间隔（毫秒）。
 */
export const LONG_TASK_POLL_MS = 1500;

/**
 * 没有长任务时的轮询间隔（毫秒），比在跑那一档大一个量级。
 */
export const LONG_TASK_IDLE_MS = 10_000;

/**
 * 算这次该隔多久再问一次长任务。
 * @param live 是否有在跑的长任务。
 * @param override 调用点指定的间隔；给了就用它，不再看 live。
 * @returns 毫秒：有活 1500，没活 10000。
 */
export function longTaskPollMs(live: boolean, override?: number | undefined): number {
  if (override !== undefined) return override;
  return live ? LONG_TASK_POLL_MS : LONG_TASK_IDLE_MS;
}

/**
 * 从读口状态里取 run 列表。
 * @param state 读口状态；value 还没到就按空算。
 * @returns 一串 run（形状由调用点自己判），没有就给空数组。
 */
export function longTaskRunsOf<T>(state: {
  readonly phase?: string | undefined;
  readonly value?: LongTasksPayload | undefined;
}): readonly T[] {
  return (state.value?.runs ?? []) as readonly T[];
}

/**
 * 把长任务态折成状态点的那一档。
 * @param status 长任务的五种态。
 * @returns ongoing / done / error / idle；needs-login 也算进行中；`stopped` 落进 idle —— 灰点：不是成功、不是出错，是用户自己按停的。
 */
export function longTaskDot(status: LongTaskStatus): 'ongoing' | 'done' | 'error' | 'idle' {
  if (status === 'ok') return 'done';
  if (status === 'failed') return 'error';
  if (status === 'running' || status === 'needs-login') return 'ongoing';
  return 'idle';
}

/**
 * 这一趟还在不在跑（`running` 与 `needs-login` 都算）。
 * 卡片要判"这一行要不要摆停止钮""这套环境里有没有活着的跑"时用这个 —— **不是** `longTaskDot`：
 * 那一件是状态点的**长相**（四档），归 `LongTaskRow` 自己用，不该被调用点拿去当判据。
 * @param status 长任务的五种态。
 * @returns 在跑 `true`；成功 / 失败 / 用户按停都是 `false`。
 */
export function longTaskIsLive(status: LongTaskStatus): boolean {
  return status === 'running' || status === 'needs-login';
}

/**
 * 停止钮的三档：没上膛 / 上了膛 / 请求在飞。
 */
export type LongTaskStopStage = 'idle' | 'armed' | 'busy';

/**
 * 算停止钮现在在哪一档。
 * @param state armed = 已经按过第一下、在等第二下；busy = 停止请求已经在飞。
 * @returns busy 优先（在飞时按不动），其次 armed，否则 idle。
 */
export function longTaskStopStage(state: {
  readonly armed: boolean;
  readonly busy: boolean;
}): LongTaskStopStage {
  if (state.busy) return 'busy';
  return state.armed ? 'armed' : 'idle';
}

/**
 * 按一下该干什么：第一次只上膛（'arm'），上了膛再按才真发（'fire'），在飞时按不动（'ignore'）。
 * @param stage 现在这一档（先过 `longTaskStopStage`）。
 * @returns 'arm' / 'fire' / 'ignore'，调用点照它上膛、落膛加发请求、或什么都不做。
 */
export function longTaskStopPress(stage: LongTaskStopStage): 'arm' | 'fire' | 'ignore' {
  if (stage === 'busy') return 'ignore';
  return stage === 'armed' ? 'fire' : 'arm';
}

/**
 * 上膛后多久自己落膛（毫秒）。3 秒 = dsh 那行现在的取值。
 */
export const LONG_TASK_STOP_ARM_MS = 3000;
