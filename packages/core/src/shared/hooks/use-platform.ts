import type { ClientSurface, HostSurface } from '@dsh-workbench/shared';
import { clientSurface } from '@/shared/api/platform/client';
import { useHostSurface } from './use-runtime-capabilities';

/**
 * 卡片看到的平台事实：客户端侧现算，宿主侧从 health 读；没读到之前宿主侧是 `undefined`。
 */
export interface PlatformView {
  readonly client: ClientSurface;
  readonly host: HostSurface | undefined;
}

/**
 * 卡片里拿平台事实的唯一入口：部署形态 / 能力 / 操作系统的差异按这里的值分叉，别自己读 `window` 或 `process`。
 * @returns `client` 是浏览器侧事实（deployment / shell / 宿主机 OS / capabilities），`host` 是宿主侧 surface（可能还没读到）。
 */
export function usePlatform(): PlatformView {
  const host = useHostSurface();
  return { client: clientSurface(), host };
}
