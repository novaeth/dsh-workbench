import type { HostSurface } from '../contract/protocol/platform.js';
import type { EnvSupplyPort } from './port-types.js';
import type { UnitSeam } from './seam/unit-seam.js';
import { createFlowHost, type FlowHost } from './flow/kit.js';
import type { FlowAgentPort } from './flow/types.js';
import type { AiPort } from './ai/port.js';
import { sessionIdOf, sessionWorkspace } from './tool-kit.js';

/**
 * 宿主 kit 的公共部分：flow、工具侧 session 读法、外部供给装法、宿主平台事实、按 unit 绑定的执行缝门面。
 */
export interface HostKit {
  readonly flow: FlowHost;
  readonly sessionIdOf: typeof sessionIdOf;
  readonly sessionWorkspace: typeof sessionWorkspace;
  readonly libInstallCommand: EnvSupplyPort['libInstallCommand'];
  readonly surface: HostSurface;
  readonly seam?: UnitSeam | undefined;
  readonly ai?: AiPort | undefined;
}

/**
 * 建一份宿主 kit；每个挂载点一份，没有模块级状态。
 * @param parts.libInstallCommand 拼「装这个共用依赖」的那条命令。
 * @param parts.surface 宿主平台事实；由组合根按 profile 与宿主进程算好再交进来。
 * @param parts.seam 按 unit 绑定好的执行缝门面；模块清单没声明写入域时缺省不给。
 * @param parts.agents 宿主的 agent 端口；没有就不支持流程里的 agent 节点。
 * @param parts.ai 模块用的模型入口；没有就等于这份运行时没有模型。
 * @returns flow / sessionIdOf / sessionWorkspace / libInstallCommand / surface，有门面时带上 seam，有模型时带上 ai。
 */
export function createHostKit(parts: {
  readonly libInstallCommand: EnvSupplyPort['libInstallCommand'];
  readonly surface: HostSurface;
  readonly seam?: UnitSeam | undefined;
  readonly agents?: FlowAgentPort | undefined;
  readonly ai?: AiPort | undefined;
}): HostKit {
  return {
    flow: createFlowHost(parts.agents, parts.ai),
    sessionIdOf,
    sessionWorkspace,
    libInstallCommand: parts.libInstallCommand,
    surface: parts.surface,
    ...(parts.seam === undefined ? {} : { seam: parts.seam }),
    ...(parts.ai === undefined ? {} : { ai: parts.ai }),
  };
}
