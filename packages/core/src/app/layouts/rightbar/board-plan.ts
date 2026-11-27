import type { BoardModule } from '@dsh-workbench/shared';

export interface RealBoard {
  readonly modules: readonly BoardModule[];
  readonly configRead: boolean;
  readonly configFailed?: boolean | undefined;
}

export interface BoardPlan {
  readonly modules: readonly { readonly key: string; readonly module: BoardModule }[];
  readonly empty: boolean;
  readonly reading: boolean;
  readonly readFailed: boolean;
  readonly detail: string | null;
}

export function planBoard(real: RealBoard): BoardPlan {
  const failed = real.configFailed === true;
  return {
    modules: real.modules.map((module) => ({ key: module.id, module })),
    empty: !failed && real.configRead && real.modules.length === 0,
    reading: !failed && !real.configRead,
    readFailed: failed,
    detail: null,
  };
}
