import type { DshShell } from '@dsh-workbench/shared';
import type { PluginSurface } from '@dsh-workbench/shared/host';
import { createOpencli } from '@dsh-workbench/adapter-runtime';
import {
  createDeclarationLookup,
  createPluginCatalog,
  createPluginUnits,
} from '@dsh-workbench/adapter-supply';

export function createPluginSurface(options: {
  readonly shell?: DshShell | undefined;
  readonly command: string;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}): PluginSurface {
  return {
    declarationLookup: createDeclarationLookup,

    createUnits(input) {
      const shell = options.shell;
      if (shell === undefined) throw new Error('没有 shell 服务，插件的命令面起不来。');
      const catalog = createPluginCatalog({ shell, command: options.command });
      return createPluginUnits({
        registry: input.registry as never,
        catalog,
        rows: input.rows,
        declared: input.declared,
        opencliFor: (plugin) =>
          createOpencli({ shell, plugin, command: options.command, logger: options.logger }),
        ...(input.toolNames === undefined ? {} : { toolNames: input.toolNames }),
        ...(input.logger === undefined ? {} : { logger: input.logger }),
      });
    },
  };
}
