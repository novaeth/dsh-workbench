import type { WriteChannel } from '@dsh-workbench/shared';
import { useHostWrite, type HostWrite, type HostWriteOptions } from './use-host-write';

let sessionSource: (() => string | undefined) | undefined;

/**
 * 让动作 POST 带上当前会话：外壳在挂载时接上，之后每个 `actions` 写都自动加 `session`。
 * 宿主拿它当流程里 agent 节点的父会话 —— 按钮起的流程挂在你正在看的那个对话下。
 */
export function setWriteSessionSource(source: () => string | undefined): void {
  sessionSource = source;
}

/** 写请求体里要不要附一段会话：只有动作通道需要，别的通道原样发。 */
export function writeBodyWithSession(
  channel: WriteChannel,
  body: Record<string, unknown>,
  session: string | undefined,
): Record<string, unknown> {
  return channel !== 'actions' || session === undefined ? body : { ...body, session };
}

/** 模块与外壳共用的写句柄：动作通道自动带上当前会话，其余与 {@link useHostWrite} 一致。 */
export function useKitHostWrite<T>(options: HostWriteOptions): HostWrite<T> {
  const write = useHostWrite<T>(options);
  const send: HostWrite<T>['send'] = (body, callOptions) => {
    const session = options.channel === 'actions' ? sessionSource?.() : undefined;
    return write.send(writeBodyWithSession(options.channel, body, session), callOptions);
  };
  return { ...write, send };
}
