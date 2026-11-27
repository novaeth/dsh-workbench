import type { Translate } from '../../lib/dsh-client.js';
import type { ReactNode } from '../../lib/react.js';
import { Component, h } from '../../lib/react.js';
import { CodeBlock, DisclosureRow, IconInfoOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { createCopyFlash } from '../../lib/copy-flash.js';
import { faultPromptOf, firstLineOf } from '../../lib/fault-prompt.js';
import { newCorrId, reportClientFailure } from '../../lib/client-diag.js';
import { Note } from '../feedback/Note.js';
import { FormActions } from '../form/FormActions.js';
import styles from './CardBoundary.module.css';

const COPIED_MS = 1500;

/**
 * `CardBoundary` 的契约：被守的 unit、重来键与失败回调。
 */
export interface CardBoundaryProps {
  /** 出事的 unit id，写进报错文案并作为上报标识。 */
  readonly unit: string;
  /** 重来键：它一变（如切了工作区）就自动清掉报错，把卡片重新渲染一遍。 */
  readonly resetKey: string;
  /** 报错那句、重试钮与「复制给 agent」的翻译函数。 */
  readonly t: Translate;
  /** 失败时把原因报给工作台（面板状态要用）；不给就只打一条 console。 */
  readonly onFailure?: ((reason: string) => void) | undefined;
  /** 出错时改画这一份；不给就画卡片失败提示、可折叠的原文与两颗按钮。 */
  readonly fallback?: ReactNode | undefined;
  /** 正常时要渲染的卡片内容。 */
  readonly children?: ReactNode | undefined;
}

/**
 * `CardBoundary` 的状态：这次渲染炸出来的那句话、折叠行是否展开、刚复制过没有。
 */
export interface CardBoundaryState {
  readonly reason: string | null;
  readonly detailsOpen: boolean;
  readonly copied: boolean;
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
 * 卡片渲染崩溃时要交给 agent 的那段提示词：位置 + 哪个模块 + 报错首行。
 * @param unit - 出事的 unit id。
 * @param reason - 拦截到的失败原因。
 * @param t - 文案函数，键在 askAgent.* 与 panels.* 下。
 * @returns 可直接粘贴给 agent 的多行提示词。
 */
export function cardBrokenPromptOf(unit: string, reason: string, t: Translate, corrId?: string): string {
  const cause = firstLineOf(reason);
  return faultPromptOf(
    {
      screen: t('askAgent.screen.board'),
      problem: {
        why: t('panels.cardBroken', { unit }),
        ...(cause === undefined ? {} : { reason: cause }),
        ...(corrId === undefined ? {} : { corrId }),
      },
    },
    t,
  );
}

function stateOf(reason: string | null): CardBoundaryState {
  return { reason, detailsOpen: false, copied: false };
}

/**
 * 卡片级错误边界：一张卡渲染炸了只画一条报错 + 重试，不让整块面板跟着塌。
 * @returns 正常时是 `children`，炸过且还没重来之前是一条报错。
 */
export class CardBoundary extends Component<CardBoundaryProps, CardBoundaryState> {
  override state: CardBoundaryState = stateOf(null);

  private readonly flash = createCopyFlash(COPIED_MS);

  private lastCorrId: string | undefined;

  static getDerivedStateFromError(error: unknown): CardBoundaryState {
    return stateOf(errorReasonOf(error));
  }

  override componentDidCatch(error: unknown): void {
    const reason = errorReasonOf(error);
    const corrId = newCorrId();
    this.lastCorrId = corrId;
    reportClientFailure({
      corrId,
      screen: this.props.t('askAgent.screen.board'),
      step: this.props.unit,
      reason,
    });
    console.error(`[dsh-workbench] 模块 ${this.props.unit} 渲染失败：${reason}`, error);
    this.props.onFailure?.(reason);
  }

  override componentDidUpdate(previous: CardBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.reason !== null) {
      this.reset();
    }
  }

  override componentWillUnmount(): void {
    this.flash.dispose();
  }

  private readonly reset = (): void => {
    this.flash.dispose();
    this.lastCorrId = undefined;
    this.setState(stateOf(null));
  };

  private readonly copyPrompt = (): void => {
    const reason = this.state.reason;
    if (reason === null) return;
    this.flash.copy(cardBrokenPromptOf(this.props.unit, reason, this.props.t, this.lastCorrId), (copied) =>
      this.setState({ copied }),
    );
  };

  override render(): ReactNode {
    const { reason, detailsOpen, copied } = this.state;
    if (reason === null) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <Note tone="problem">
        <div className={styles.failure}>
          <span>{this.props.t('panels.cardBroken', { unit: this.props.unit })}</span>
          {reason === '' ? null : (
            <DisclosureRow
              className={styles.raw}
              icon={<IconInfoOutlineRegular size={14} />}
              title={this.props.t('env.fix.details')}
              open={detailsOpen}
              expandable
              expandOnRowClick
              previewChevron
              onToggle={() => this.setState({ detailsOpen: !detailsOpen })}
            >
              <CodeBlock
                code={reason}
                copyLabel={this.props.t('blocker.copy')}
                copiedLabel={this.props.t('env.copied')}
              />
            </DisclosureRow>
          )}
          <FormActions
            actions={[
              {
                key: 'retry',
                label: this.props.t('panels.cardRetry'),
                onClick: this.reset,
              },
              {
                key: 'ask-agent',
                label: this.props.t(copied ? 'askAgent.copied' : 'askAgent.copy'),
                kind: 'primary',
                onClick: this.copyPrompt,
              },
            ]}
          />
        </div>
      </Note>
    );
  }
}
