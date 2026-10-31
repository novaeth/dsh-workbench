import { UNITS_SERVICE } from '../config/constants.js';
import type { UnitModuleFace } from './unit-face.js';

/**
 * 宿主面注册只需要的那点上下文：`get` / `effect` / 可选的 `logger`。
 */
export interface UnitHostContextLike {
  get<T = unknown>(name: string): T | undefined;
  effect(effect: () => void | (() => void), label?: string): () => void;
  readonly logger?: { warn?(message: string): void } | undefined;
}

/**
 * 一个宿主插件导出的三件：`name` / `inject` / `apply`。
 */
export interface UnitHostPlugin {
  readonly name: string;
  readonly inject: readonly string[];
  apply(ctx: UnitHostContextLike): void;
}

/**
 * 把「宿主面注册进外壳」这段在每个模块里都一样的接线收成一份。
 * 用法：先 `const plugin = defineUnitHostPlugin({ … })`，再逐个导出 `name` / `inject` / `apply`
 * （逐名 `export const` 才过 arch 的导出对账；解构导出它认不出）。
 * @param options.name 插件名（包名）。
 * @param options.unit 单元 id。
 * @param options.face 这个单元的宿主面。
 * @returns `{ name, inject, apply }`；`apply` 里取 `workbenchUnits`、缺了就 warn 一声。
 */
export function defineUnitHostPlugin(options: {
  readonly name: string;
  readonly unit: string;
  readonly face: UnitModuleFace;
}): UnitHostPlugin {
  const { name, unit, face } = options;
  return {
    name,
    inject: [UNITS_SERVICE],
    apply(ctx: UnitHostContextLike): void {
      const units = ctx.get<{ register(face: UnitModuleFace): () => void }>(UNITS_SERVICE);
      if (units === undefined) {
        ctx.logger?.warn?.(`[${unit}] 外壳没有提供 workbenchUnits 服务：这个模块装不进来`);
        return;
      }
      ctx.effect(() => units.register(face), `${name}: 注册 ${unit}`);
    },
  };
}
