import { describe, expect, it } from 'vitest';
import {
  longTaskDot,
  longTaskIsLive,
  longTaskPollMs,
  longTaskRunsOf,
  longTaskStopPress,
  longTaskStopStage,
  LONG_TASK_STOP_ARM_MS,
  runsRouteOf,
  stopRouteOf,
} from '../long-task.js';

describe('runsRouteOf', () => {
  it('★ 事实名 = 路由名（三处同一个来源，改一处不可能漏另一处）', () => {
    expect(runsRouteOf('inventory')).toBe('inventory/runs');
    expect(runsRouteOf('issues')).toBe('issues/runs');
  });
});

describe('stopRouteOf（停止那条写路由）', () => {
  it('★ 就是读路由 + `/stop`（读口与写口同一个单元名，不另造一套命名）', () => {
    expect(stopRouteOf('inventory')).toBe('inventory/runs/stop');
    expect(stopRouteOf('issues')).toBe('issues/runs/stop');
    expect(stopRouteOf('inventory')).toBe(`${runsRouteOf('inventory')}/stop`);
  });
});

describe('longTaskDot', () => {
  it('★ 两个"还在等"的状态都转圈：等编排与等你登录是同一个信号', () => {
    expect(longTaskDot('running')).toBe('ongoing');
    expect(longTaskDot('needs-login')).toBe('ongoing');
    expect(longTaskDot('ok')).toBe('done');
    expect(longTaskDot('failed')).toBe('error');
  });

  it('★ 用户按停的那一趟是灰点：不是成功、不是出错，落进 idle', () => {
    expect(longTaskDot('stopped')).toBe('idle');
  });
});

describe('longTaskIsLive（调用点判「还在跑」用的那个谓词）', () => {
  it('★ 只认 running 与 needs-login —— 与 longTaskDot 的 ongoing 同一口径', () => {
    for (const status of ['running', 'needs-login', 'ok', 'failed', 'stopped'] as const) {
      expect(longTaskIsLive(status)).toBe(longTaskDot(status) === 'ongoing');
    }
  });

  it('★ 结束的三态（成功 / 失败 / 用户按停）都不是"在跑"', () => {
    expect(longTaskIsLive('ok')).toBe(false);
    expect(longTaskIsLive('failed')).toBe(false);
    expect(longTaskIsLive('stopped')).toBe(false);
  });
});

describe('longTaskStopStage / longTaskStopPress（两按：第一次上膛，第二次才真发）', () => {
  it('★ 三档：没上膛 / 上了膛 / 请求在飞；在飞压过一切', () => {
    expect(longTaskStopStage({ armed: false, busy: false })).toBe('idle');
    expect(longTaskStopStage({ armed: true, busy: false })).toBe('armed');
    expect(longTaskStopStage({ armed: false, busy: true })).toBe('busy');
    expect(longTaskStopStage({ armed: true, busy: true })).toBe('busy');
  });

  it('★ 按一下该干什么：idle → arm、armed → fire、busy → ignore（在飞时按不动）', () => {
    expect(longTaskStopPress('idle')).toBe('arm');
    expect(longTaskStopPress('armed')).toBe('fire');
    expect(longTaskStopPress('busy')).toBe('ignore');
  });

  it('★ 上膛时限照 dsh：3 秒自己落膛', () => {
    expect(LONG_TASK_STOP_ARM_MS).toBe(3000);
  });
});

describe('longTaskRunsOf（这一读交回的"当前那些趟"）', () => {
  const runs = [{ id: 'run-1', target: 'test', status: 'running' }];

  it('读到了 → 原样交出（套件自己投影的形状，外壳不裁剪）', () => {
    expect(longTaskRunsOf({ phase: 'ready', value: { runs } })).toEqual(runs);
  });

  it('★ 重取期间（`phase` 转 loading、但 `value` 还留着）→ **仍然交出那一份**', () => {
    expect(longTaskRunsOf({ phase: 'loading', value: { runs } })).toEqual(runs);
    expect(longTaskRunsOf({ phase: 'error', value: { runs } })).toEqual(runs);
  });

  it('还没读到过 / 读回来是空的 → 空数组（界面据此不画那一行）', () => {
    expect(longTaskRunsOf({})).toEqual([]);
    expect(longTaskRunsOf({ value: { runs: [] } })).toEqual([]);
  });
});

describe('longTaskPollMs（轮询两档：还在跑要快，都收尾了也要问）', () => {
  it('还在跑 → 快档（进度要跟手）', () => {
    expect(longTaskPollMs(true)).toBe(1500);
  });

  it('★ 都收尾了 → **慢档但不停**（停了之后"别人起了一趟"就只剩推送那一条路）', () => {
    expect(longTaskPollMs(false)).toBe(10_000);
    expect(longTaskPollMs(false)).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it('调用方钉了值就用它（测试 / 特殊界面）', () => {
    expect(longTaskPollMs(true, 50)).toBe(50);
    expect(longTaskPollMs(false, 50)).toBe(50);
  });
});
