import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { diyPresetFrom, now, standardPresetConfigOf } from '@dsh-workbench/shared/host';

const RETRY_MS = 250;
const DEADLINE_MS = 15_000;

function skillsDirOf(): string | null {
  try {
    const manifest = createRequire(import.meta.url).resolve('@dsh-workbench/core/package.json');
    return join(dirname(manifest), 'skills');
  } catch (error) {
    return null;
  }
}

export function registerDiyPreset(ctx: DshHostContext): void {
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
  let unregister: (() => Promise<void>) | undefined;
  const until = now() + DEADLINE_MS;

  function schedule(): void {
    if (stopped || gaveUp) return;
    if (now() >= until) {
      gaveUp = true;
      ctx.logger?.warn?.(
        `[dsh-workbench] 等了 ${DEADLINE_MS}ms 仍没拿到 dsh 的 standard preset —— ` +
          '本次不注册「工作台 DIY 模式」（dsh 的 loader 里没有 preset-standard？）',
      );
      return;
    }
    timer = setTimeout(attempt, RETRY_MS);
  }

  function attempt(): void {
    if (stopped || gaveUp) return;
    const registry = ctx.get('agentPresets');
    const loader = ctx.get('loader');
    if (typeof registry?.register !== 'function' || loader === undefined) {
      schedule();
      return;
    }

    let standard: unknown;
    try {
      standard = standardPresetConfigOf(loader.entries());
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-workbench] 读 dsh 的 loader 行失败：${String(error)}`);
      schedule();
      return;
    }
    if (standard === undefined) {
      schedule();
      return;
    }

    let definition;
    try {
      definition = diyPresetFrom(standard, dir);
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-workbench] DIY 模式派生失败：${String(error)}`);
      return;
    }

    void registry.register(definition).then(
      (off) => {
        if (stopped) {
          void off();
          return;
        }
        unregister = off;
        ctx.logger?.info?.(
          `[dsh-workbench] 「工作台 DIY 模式」从本次 dsh 的 standard 现场派生（${definition.plugins.length} 行）`,
        );
      },
      (error: unknown) => {
        ctx.logger?.warn?.(`[dsh-workbench] 注册「工作台 DIY 模式」失败：${String(error)}`);
      },
    );
  }

  ctx.effect(() => {
    attempt();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      if (unregister !== undefined) void unregister();
    };
  }, 'dsh-workbench: DIY 模式从本次 dsh 的 standard 现场派生（没有生成物）');
}
