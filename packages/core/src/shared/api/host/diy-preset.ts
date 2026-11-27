import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type {
  DshAgentPresetDefinition,
  DshAgentPresetRegistry,
  DshAgentPresetUnregister,
  DshHostContext,
  DshLoader,
} from '@dsh-workbench/shared/host';
import { now, presetConfigOf, diyPresetFrom } from '@dsh-workbench/shared/host';
import { DIY_PRESET_SOURCE_DEFAULT } from '@/kernel/contract/diy';

const RETRY_MS = 250;
const DEADLINE_MS = 15_000;

export interface DiyPresetSourcePort {
  readonly current: () => string;
  readonly watch: (listener: () => void) => () => void;
}

type Derived =
  | { readonly ok: true; readonly definition: DshAgentPresetDefinition; readonly source: string }
  | { readonly ok: false; readonly retry: boolean };

function skillsDirOf(): string | null {
  try {
    const manifest = createRequire(import.meta.url).resolve('@dsh-workbench/core/package.json');
    return join(dirname(manifest), 'skills');
  } catch (error) {
    return null;
  }
}

export function registerDiyPreset(ctx: DshHostContext, port: DiyPresetSourcePort): void {
  const skillsDir = skillsDirOf();
  if (skillsDir === null) {
    ctx.logger?.warn?.(
      '[dsh-workbench] 读不到自己的包根：DIY 的 skills 目录定不下来，本次不注册「工作台 DIY 模式」',
    );
    return;
  }
  const dir = skillsDir;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let gaveUp = false;
  let active: { readonly source: string; readonly off: DshAgentPresetUnregister } | undefined;
  let generation = 0;
  let chain: Promise<void> = Promise.resolve();
  const until = now() + DEADLINE_MS;

  function schedule(): void {
    if (stopped || gaveUp || timer !== undefined) return;
    if (now() >= until) {
      gaveUp = true;
      ctx.logger?.warn?.(
        `[dsh-workbench] 等了 ${DEADLINE_MS}ms 仍没有可用的 dsh 模式声明 —— ` +
          '本次不注册「工作台 DIY 模式」',
      );
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      request();
    }, RETRY_MS);
  }

  function derive(loader: DshLoader, source: string): Derived {
    let config: unknown;
    try {
      config = presetConfigOf(loader.entries(), source);
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-workbench] 读 dsh 的 loader 行失败：${String(error)}`);
      return { ok: false, retry: true };
    }
    if (config === undefined) return { ok: false, retry: true };
    try {
      const name =
        typeof config === 'object' && config !== null && typeof (config as { name?: unknown }).name === 'string'
          ? (config as { name: string }).name.trim()
          : '';
      return {
        ok: true,
        definition: diyPresetFrom(config, dir, source, name === '' ? (source === 'standard' ? '标准模式' : source) : name),
        source,
      };
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-workbench] 从「${source}」派生「工作台 DIY 模式」失败：${String(error)}`);
      return { ok: false, retry: false };
    }
  }

  function definitionFor(loader: DshLoader, source: string): Derived {
    const wanted = derive(loader, source);
    if (wanted.ok || source === DIY_PRESET_SOURCE_DEFAULT) return wanted;
    const fallback = derive(loader, DIY_PRESET_SOURCE_DEFAULT);
    if (fallback.ok) {
      const reason = wanted.retry ? '原来源不可用' : '原来源无法派生';
      ctx.logger?.warn?.(
        wanted.retry
          ? `[dsh-workbench] dsh 里没有「${source}」这个模式；DIY 模式改为从「${DIY_PRESET_SOURCE_DEFAULT}」派生`
          : `[dsh-workbench] 「${source}」无法派生 DIY 模式；改为从「${DIY_PRESET_SOURCE_DEFAULT}」派生`,
      );
      const generated = '（基于「标准模式」）';
      const base = fallback.definition.description ?? '';
      return {
        ok: true,
        source: fallback.source,
        definition: {
          ...fallback.definition,
          description: base.endsWith(generated)
            ? `${base.slice(0, -generated.length)}（基于标准模式；${reason}）`
            : `${base}（${reason}）`,
        },
      };
    }
    return fallback;
  }

  async function reconcile(
    mine: number,
    registry: DshAgentPresetRegistry,
    loader: DshLoader,
  ): Promise<void> {
    if (stopped || mine !== generation) return;
    const source = port.current() || DIY_PRESET_SOURCE_DEFAULT;
    if (active?.source === source) return;
    const derived = definitionFor(loader, source);
    if (!derived.ok) {
      if (derived.retry) schedule();
      return;
    }
    if (active !== undefined) {
      const previous = active;
      active = undefined;
      await previous.off();
    }
    if (stopped || mine !== generation) return;
    const off = await registry.register(derived.definition);
    if (stopped || mine !== generation) {
      await off();
      return;
    }
    active = { source, off };
    ctx.logger?.info?.(
      `[dsh-workbench] 「工作台 DIY 模式」从「${derived.source}」派生（${derived.definition.plugins.length} 行）`,
    );
  }

  function request(): void {
    if (stopped || gaveUp) return;
    const registry = ctx.get('agentPresets');
    const loader = ctx.get('loader');
    if (typeof registry?.register !== 'function' || loader === undefined) {
      schedule();
      return;
    }
    const mine = ++generation;
    chain = chain.then(() => reconcile(mine, registry, loader)).catch((error: unknown) => {
      ctx.logger?.warn?.(`[dsh-workbench] 注册「工作台 DIY 模式」失败：${String(error)}`);
    });
  }

  ctx.effect(() => {
    request();
    const offWatch = port.watch(() => request());
    return () => {
      stopped = true;
      offWatch();
      if (timer !== undefined) clearTimeout(timer);
      const current = active;
      active = undefined;
      if (current !== undefined) void current.off();
    };
  }, 'dsh-workbench: DIY 模式按用户选中的模式从 dsh 当前声明派生（无生成物）');
}
