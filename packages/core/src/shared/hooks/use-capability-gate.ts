import { useCallback, useState } from 'react';
import type { CapabilityPayload, GateMode } from '@dsh-workbench/shared';
import { gateOf } from '@/shared/api/unit-board';

import { useCapabilities, useCapabilityProbe, type CapabilityMap } from './use-capabilities';

/**
 * 一格的能力门：`capability` 是这一格声明的能力（没读到是 `null`）、`gated` 放行没（为真 = 这一格能画）、
 * `forceProbe()` 现在就去探一次。
 */
export interface CapabilityGate {
  readonly capability: CapabilityPayload | null;
  readonly gated: boolean;
  forceProbe(): void;
}

/**
 * 卡片里判断“这一格现在能不能画”时调用：`refreshToken` 变化触发一次重探。
 * `options.mode` 换门的口径（默认 `'capability'`）、`options.fixture` 给夹具一份假能力；
 * `gated` 按口径算 —— 读数还没到先放行（让它去读），读到明确不通过才拦；`forceProbe()` 是“现在就去探一次”。
 */
export function useCapabilityGate(
  unit: string,
  refreshToken: number,
  options: { readonly mode?: GateMode | undefined; readonly fixture?: CapabilityPayload | undefined } = {},
): CapabilityGate {
  const [probeNonce, setProbeNonce] = useState(0);
  const forceProbe = useCallback(() => setProbeNonce((value) => value + 1), []);
  const capabilities = useCapabilities(refreshToken + probeNonce);
  const capability = options.fixture ?? capabilities?.[unit] ?? null;

  return { capability, gated: gateOf(capability, options.mode ?? 'capability').gated, forceProbe };
}

/**
 * 整张能力表的视图：表本体加探针的 `checkedAt` / `checking`，以及 `forceProbe()` 与 `reload()`。
 */
export interface CapabilityMapView {
  readonly capabilities: CapabilityMap | null;
  readonly checkedAt: number | null;
  readonly checking: boolean;
  forceProbe(): void;
  reload(): void;
}

/**
 * 设置页 / 体检那类“要全部单元的能力表”时调用：`reload()` 重取整张表、`forceProbe()` 立刻探一次、
 * `checking` 是探针在跑；没探过时 `capabilities` 是 `null`。
 */
export function useCapabilityMap(refreshToken: number): CapabilityMapView {
  const [probeNonce, setProbeNonce] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const forceProbe = useCallback(() => setProbeNonce((value) => value + 1), []);
  const reload = useCallback(() => setReloadNonce((value) => value + 1), []);
  const probe = useCapabilityProbe();

  return {
    capabilities: useCapabilities(refreshToken + probeNonce, reloadNonce),
    ...probe,
    forceProbe,
    reload,
  };
}
