const PLUGIN_ID = '@dsh-workbench/module-hello';

const UNIT_ID = 'hello';

interface UnitMountResult {
  readonly routes: Record<string, never>;
  registerTools(): Array<() => void>;
}

interface UnitModuleFace {
  readonly unit: string;
  mount(deps: { readonly manifest: { readonly id: string } }): UnitMountResult;
}

interface UnitRegistry {
  register(face: UnitModuleFace): () => void;
}

interface HostContext {
  get<T = unknown>(name: string): T | undefined;
  effect(effect: () => void | (() => void), label?: string): () => void;
  logger?: { warn?(message: string): void } | undefined;
}

const helloHost: UnitModuleFace = {
  unit: UNIT_ID,
  mount: () => ({ routes: {}, registerTools: () => [] }),
};

export const name = PLUGIN_ID;

export const inject = ['workbenchUnits'];

export function apply(ctx: HostContext): void {
  const units = ctx.get<UnitRegistry>('workbenchUnits');
  if (units === undefined) {
    ctx.logger?.warn?.(`[${UNIT_ID}] 外壳没有提供 workbenchUnits 服务：这个模块装不进来`);
    return;
  }
  ctx.effect(() => units.register(helloHost), `module-hello: 注册 ${UNIT_ID}`);
}
