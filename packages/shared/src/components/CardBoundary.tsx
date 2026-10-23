import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '../api/dsh-client.js';
import type { ReactNode } from '../lib/react.js';
import { Component, h } from '../lib/react.js';
import { Note } from './Note.js';

/**
 * `CardBoundary` 的契约：被守的 unit、重来键与失败回调。
 */
export interface CardBoundaryProps {
  readonly unit: string;
  readonly resetKey: string;
  readonly t: Translate;
  readonly onFailure?: ((reason: string) => void) | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * `CardBoundary` 的状态：这次渲染炸出来的那句话，没炸是 `null`。
 */
export interface CardBoundaryState {
  readonly reason: string | null;
}

/**
 * 把抛出来的任何东西收成一句人能看的失败原因，上报与展示都用它。
 * @param error - 抛出来的值：`Error` 取 `message`，字符串原样，其余走 JSON。
 * @returns 一句原因文本；`Error('')` 这种没带 message 的会回空串（调用点别把它当"一定有话"）。
 */
export function errorReasonOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
}

/**
 * 卡片级错误边界：一张卡渲染炸了只画一条报错 + 重试，不让整块面板跟着塌。
 * @param props.unit - 出事的 unit id，写进报错文案并作为上报标识。
 * @param props.resetKey - 重来键：它一变（如切了工作区）就自动清掉报错，把卡片重新渲染一遍。
 * @param props.t - 报错那句与重试钮文案的翻译函数。
 * @param props.onFailure - 失败时把原因报给宿主（面板状态要用）；不给就只打一条 console。
 * @param props.children - 正常时要渲染的卡片内容。
 * @returns 正常时是 `children`，炸过且还没重来之前是一条报错。
 */
export class CardBoundary extends Component<CardBoundaryProps, CardBoundaryState> {
  override state: CardBoundaryState = { reason: null };

  static getDerivedStateFromError(error: unknown): CardBoundaryState {
    return { reason: errorReasonOf(error) };
  }

  override componentDidCatch(error: unknown): void {
    const reason = errorReasonOf(error);
    console.error(`[dsh-workbench] 模块 ${this.props.unit} 渲染失败：${reason}`, error);
    this.props.onFailure?.(reason);
  }

  override componentDidUpdate(previous: CardBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.reason !== null) {
      this.setState({ reason: null });
    }
  }

  private readonly retry = (): void => {
    this.setState({ reason: null });
  };

  override render(): ReactNode {
    const { reason } = this.state;
    if (reason === null) return this.props.children;
    return (
      <Note tone="problem">
        <span>{this.props.t('panels.cardBroken', { unit: this.props.unit, reason })}</span>{' '}
        <Button type="button" variant="outline" size="sm" onClick={this.retry}>
          {this.props.t('panels.cardRetry')}
        </Button>
      </Note>
    );
  }
}
