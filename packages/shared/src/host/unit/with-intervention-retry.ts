/**
 * `withInterventionRetry` 的口径：最多试几次、每轮先等多久（也可按轮次算）、怎么等。
 */
export interface InterventionRetryOptions {
  readonly attempts?: number | undefined;
  readonly delayMs?: number | ((attempt: number) => number) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

const INTERVENTION_RETRY_ATTEMPTS = 5;

const INTERVENTION_RETRY_DELAY_MS = 1500;

function defaultInterventionSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * 把「看一眼接上没有」包成能交给 `longTasks.create({ recheck })` 的 handler：
 * 用户在人工干预节点上按「我处理完了」时先立刻试一次，没接上就有界地再试（第 2 轮起每轮先等）。
 * `check` 返回 true = 已经接上，不用再试；抛错算没接上、继续下一轮。
 * 同一 id 上一轮还在飞时再按直接忽略；成功 / 用尽都清单飞；**永不抛错**（fire-and-forget）。
 * @param check 看一眼接上没有，可同步可异步。
 * @param options 轮次上限（默认 5）、第几次等待等多久（默认 1500ms，可给函数，从第 1 次等待起算）、怎么等（默认真等，测试可注入假的）。
 * @returns 一条同签名的 handler，直接交给 `const longTasks = create({ recheck })`。
 */
export function withInterventionRetry<S extends { readonly id: string }>(
  check: (current: S) => boolean | Promise<boolean>,
  options: InterventionRetryOptions = {},
): (current: S) => void {
  const attempts = options.attempts ?? INTERVENTION_RETRY_ATTEMPTS;
  const delayMs = options.delayMs ?? INTERVENTION_RETRY_DELAY_MS;
  const sleep = options.sleep ?? defaultInterventionSleep;
  const inFlight = new Set<string>();
  return (current: S): void => {
    if (inFlight.has(current.id)) return;
    inFlight.add(current.id);
    void (async () => {
      try {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          if (attempt > 1) {
            await sleep(typeof delayMs === 'function' ? delayMs(attempt - 1) : delayMs);
          }
          try {
            if (await check(current)) return;
          } catch {
          }
        }
      } catch {
      } finally {
        inFlight.delete(current.id);
      }
    })();
  };
}
