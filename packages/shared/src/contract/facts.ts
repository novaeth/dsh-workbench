/**
 * 宿主推来的一帧事实变更：rev 在同一纪元里单调，facts 是这一帧动过的名字。
 */
export interface FactFrame {
  readonly epoch?: string;
  readonly rev: number;
  readonly facts: readonly string[];
}

/**
 * 范围查法的后缀：inventory/* 这类名字表示「这个前缀下的一族」，不是一条事实。
 */
export const FACT_SCOPE_SUFFIX = '*';

/**
 * 判一个名字是不是范围查法，不是问这条事实存不存在。
 * @param name 事实名或范围名。
 * @returns 单字符 * 不算范围；只有「至少一个字符加 *」才算。
 */
export function isFactScope(name: string): boolean {
  return name.length > 1 && name.endsWith(FACT_SCOPE_SUFFIX);
}

/**
 * 取范围名对应的前缀，普通事实名原样返回。
 * @param name 事实名或范围名。
 * @returns 去掉末尾 * 的前缀；本来不是范围就给原值。
 */
export function scopePrefixOf(name: string): string {
  return isFactScope(name) ? name.slice(0, -FACT_SCOPE_SUFFIX.length) : name;
}

/**
 * 事实的来路：start 建连并按帧回调，cursor 报已收到的宿主 rev（断线重连时交给宿主）。
 */
export interface FactTransport {
  start(handlers: { readonly onFrame: (frame: FactFrame) => void; readonly cursor: () => number }): () => void;
}

/**
 * 浏览器侧的事实通道：订阅、读版本、手动刷新，帧到了由它分发给订阅者。
 */
export interface FactChannel {
  subscribe(fact: string, listener: () => void): () => void;
  revisionOf(fact: string): number;
  refresh(fact?: string): void;
  applyFrame(frame: FactFrame): void;
  subscriberCount(): number;
}

interface FactEntry {
  rev: number;
  readonly listeners: Set<() => void>;
}

/**
 * 造一条事实通道：第一次订阅时才连传输层，最后一个订阅者走掉就断开。
 * @param options 传输层，用来连宿主。
 * @returns 通道句柄；没记录过的事实版本给 0，refresh() 不带事实名时刷新全部并逐个通知。
 */
export function createFactChannel(options: { readonly transport: FactTransport }): FactChannel {
  const entries = new Map<string, FactEntry>();
  let epoch: string | null = null;
  let stopTransport: (() => void) | null = null;
  let hostRev = 0;
  let generation = 0;

  const entryOf = (fact: string): FactEntry => {
    const existing = entries.get(fact);
    if (existing !== undefined) return existing;
    const created: FactEntry = { rev: 0, listeners: new Set() };
    entries.set(fact, created);
    return created;
  };

  const targetsOf = (fact: string): FactEntry[] => {
    if (!isFactScope(fact)) {
      const entry = entries.get(fact);
      return entry === undefined ? [] : [entry];
    }
    const prefix = scopePrefixOf(fact);
    const matched: FactEntry[] = [];
    for (const [name, entry] of entries) {
      if (name === prefix || name.startsWith(`${prefix}/`)) matched.push(entry);
    }
    return matched;
  };

  const mark = (fact: string, rev: number): void => {
    if (!isFactScope(fact)) {
      entryOf(fact).rev = rev;
      return;
    }
    for (const entry of targetsOf(fact)) entry.rev = rev;
  };

  const notify = (facts: Iterable<string>): void => {
    for (const fact of facts) {
      for (const entry of targetsOf(fact)) {
        for (const listener of [...entry.listeners]) listener();
      }
    }
  };

  const ensureTransport = (): void => {
    if (stopTransport !== null) return;
    stopTransport = options.transport.start({
      onFrame: (frame) => channel.applyFrame(frame),
      cursor: () => hostRev,
    });
  };

  const releaseTransport = (): void => {
    if (stopTransport === null) return;
    stopTransport();
    stopTransport = null;
  };

  const channel: FactChannel = {
    revisionOf: (fact) => entries.get(fact)?.rev ?? 0,
    subscribe(fact, listener) {
      const entry = entryOf(fact);
      entry.listeners.add(listener);
      ensureTransport();
      return () => {
        entry.listeners.delete(listener);
        if (channel.subscriberCount() === 0) releaseTransport();
      };
    },
    subscriberCount() {
      let count = 0;
      for (const entry of entries.values()) count += entry.listeners.size;
      return count;
    },
    refresh(fact) {
      generation += 1;
      if (fact === undefined) {
        for (const entry of entries.values()) entry.rev = generation;
        notify(entries.keys());
        return;
      }
      mark(fact, generation);
      notify([fact]);
    },
    applyFrame(frame) {
      const nextEpoch = frame.epoch ?? null;
      const first = epoch === null;
      const epochChanged = epoch !== null && nextEpoch !== null && epoch !== nextEpoch;
      if (nextEpoch !== null) epoch = nextEpoch;
      hostRev = epochChanged ? frame.rev : Math.max(hostRev, frame.rev);
      if (first) {
        generation += 1;
        for (const fact of frame.facts) mark(fact, generation);
        return;
      }
      if (epochChanged) {
        generation += 1;
        for (const entry of entries.values()) entry.rev = generation;
        notify(entries.keys());
        return;
      }
      if (frame.facts.length === 0) return;
      generation += 1;
      for (const fact of frame.facts) mark(fact, generation);
      notify(frame.facts);
    },
  };

  return channel;
}

/**
 * 把传输层收到的原始数据读成一帧；坏数据当没收到。
 * @param data 帧的原始数据，期望是 JSON 字符串。
 * @returns 合法帧；不是字符串、JSON 坏了、或 rev 不是数字都给 null。
 */
export function parseFactFrame(data: unknown): FactFrame | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as { epoch?: unknown; rev?: unknown; facts?: unknown };
    if (typeof parsed.rev !== 'number') return null;
    return {
      ...(typeof parsed.epoch === 'string' ? { epoch: parsed.epoch } : {}),
      rev: parsed.rev,
      facts: Array.isArray(parsed.facts) ? parsed.facts.filter((f): f is string => typeof f === 'string') : [],
    };
  } catch {
    return null;
  }
}

/**
 * 读口路由到事实名的映射，当前一对一。
 * @param route 读口路由。
 * @returns 该路由对应的事实名（就是路由本身）。
 */
export function factOfRoute(route: string): string {
  return route;
}
