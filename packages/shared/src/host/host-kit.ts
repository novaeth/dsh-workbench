import type { HostSurface } from '../contract/protocol/platform.js';
import type { EnvSupplyPort } from './port-types.js';
import { createFlowHost, type FlowHost } from './flow/kit.js';
import { sessionIdOf, sessionWorkspace } from './tool-kit.js';

/**
 * 宿主 kit 的公共部分：flow、工具侧 session 读法、外部供给装法、宿主平台事实。
 */
export interface HostKit {
  readonly flow: FlowHost;
  readonly sessionIdOf: typeof sessionIdOf;
  readonly sessionWorkspace: typeof sessionWorkspace;
  readonly libInstallCommand: EnvSupplyPort['libInstallCommand'];
  readonly surface: HostSurface;
}

/**
 * 建一份宿主 kit；每个挂载点一份，没有模块级状态。
 * @param parts.libInstallCommand 拼「装这个共用依赖」的那条命令。
 * @param parts.surface 宿主平台事实；由组合根按 profile 与宿主进程算好再交进来。
 * @returns flow / sessionIdOf / sessionWorkspace / libInstallCommand / surface。
 */
export function createHostKit(parts: {
  readonly libInstallCommand: EnvSupplyPort['libInstallCommand'];
  readonly surface: HostSurface;
}): HostKit {
  return {
    flow: createFlowHost(),
    sessionIdOf,
    sessionWorkspace,
    libInstallCommand: parts.libInstallCommand,
    surface: parts.surface,
  };
}
