import { createFlowHost, type FlowHost } from './flow/kit.js';
import { libInstallCommand } from './lib-install.js';
import { sessionIdOf, sessionWorkspace } from './tool-kit.js';

/**
 * 宿主 kit 的公共部分：flow、工具侧 session 读法、外部供给装法。
 */
export interface HostKit {
  readonly flow: FlowHost;
  readonly sessionIdOf: typeof sessionIdOf;
  readonly sessionWorkspace: typeof sessionWorkspace;
  readonly libInstallCommand: typeof libInstallCommand;
}

/**
 * 建一份宿主 kit；每个挂载点一份，没有模块级状态。
 * @returns flow / sessionIdOf / sessionWorkspace / libInstallCommand。
 */
export function createHostKit(): HostKit {
  return {
    flow: createFlowHost(),
    sessionIdOf,
    sessionWorkspace,
    libInstallCommand,
  };
}
