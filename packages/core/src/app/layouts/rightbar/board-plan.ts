import type { BoardModule } from '@dsh-workbench/shared';
import { devSurface } from '@/shared/dev-surface';

import type { BoardShape } from './board-shape';

export type { BoardShape };

export interface RealBoard {
  readonly modules: readonly BoardModule[];
  readonly configRead: boolean;
}

export interface BoardPlan {
  readonly modules: readonly { readonly key: string; readonly module: BoardModule }[];
  readonly empty: boolean;
  readonly reading: boolean;
  readonly repeated: boolean;
}

export function planBoard(shape: BoardShape, real: RealBoard, all: readonly BoardModule[]): BoardPlan {
  if (shape.kind === 'real') {
    return {
      modules: real.modules.map((module) => ({ key: module.id, module })),
      empty: real.configRead && real.modules.length === 0,
      reading: !real.configRead,
      repeated: false,
    };
  }

  if (shape.kind === 'empty') {
    return { modules: [], empty: true, reading: false, repeated: false };
  }

  if (shape.kind === 'unread') {
    return { modules: [], empty: false, reading: true, repeated: false };
  }

  if (shape.kind === 'kit') {
    const kit = devSurface.kitModule;
    return {
      modules: kit === null ? [] : [{ key: kit.id, module: kit }],
      empty: false,
      reading: false,
      repeated: false,
    };
  }

  if (shape.kind === 'all') {
    return {
      modules: all.map((module) => ({ key: module.id, module })),
      empty: false,
      reading: false,
      repeated: all.length > 1,
    };
  }

  const seed = all[0];
  const modules =
    seed === undefined
      ? []
      : Array.from({ length: Math.max(0, shape.count) }, (_unused, at) => ({
          key: `${seed.id}#${at}`,
          module: seed,
        }));

  return { modules, empty: false, reading: false, repeated: modules.length > 1 };
}
