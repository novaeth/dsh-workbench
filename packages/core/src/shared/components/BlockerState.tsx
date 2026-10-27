import { createElement as h, useState } from 'react';
import type { ModuleBlocker } from '@dsh-workbench/shared';
import type { Translate } from '@dsh-workbench/shared';
import {
  Button,
  CodeBlock,
  DisclosureRow,
  IconInfoOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { useBlockerActions } from '@/shared/hooks/use-blocker-actions';
import { blockerActionLabel, blockerPending } from './blocker-action';

import styles from './BlockerState.module.css';
import { IconBrandMark } from '@dsh-workbench/shared';

/**
 * `<BlockerState>` 的 prop：一份 blocker 加几个回调。
 */
export interface BlockerStateProps {
  readonly blocker: ModuleBlocker;
  readonly t: Translate;
  readonly onRetry: () => void;
  readonly busy?: boolean;
  readonly flush?: boolean;
  readonly onOpenMarket?: () => void;
}

/**
 * 卡片被挡住（或要给一句 notice）时渲染的那一块：按 `blocker.severity` 出块状或一行提示，动作接重试 / 跑修复 / 复制。
 * @param props.blocker - 要显示的那份 blocker：`title` / `hint` / `detail` / `actions` / `severity`。
 * @param props.t - 翻译函数，这一块出现的每句话都从它来。
 * @param props.onRetry - `retry` 动作与修复成功后的重试回调。
 * @param props.onOpenMarket - `open-market` 动作；没给就退回 `onRetry`。
 * @param props.busy - 外层是不是在忙（默认 `false`）；为真时动作一并禁用。
 * @param props.flush - 是否贴着容器边（默认 `false`）：去掉图标、收窄留白，给卡片内嵌用。
 */
export function BlockerState({
  blocker,
  t,
  onRetry,
  busy = false,
  flush = false,
  onOpenMarket,
}: BlockerStateProps) {
  const { run, copied, running, failure } = useBlockerActions(onRetry, onOpenMarket);
  const [rawOpen, setRawOpen] = useState(false);

  const pending = blockerPending(busy, running);

  const inlineActions = blocker.actions.filter((action) => action.kind === 'open-url' && action.inline === true);
  const buttonActions = blocker.actions.filter(
    (action) => !(action.kind === 'open-url' && action.inline === true) || blocker.hint === undefined,
  );

  const buttons = buttonActions.map((action, index) => (
    <Button
      key={`${action.kind}:${action.label}`}
      type="button"
      size="sm"
      variant={index === 0 ? 'primary' : 'ghost'}
      disabled={pending}
      onClick={() => run(action)}
    >
      {blockerActionLabel(action, { retrying: busy, running, copied }, t)}
    </Button>
  ));

  const failureBlock =
    failure === null ? null : (
      <p className={styles.failure}>
        {t('blocker.fix.failed')}
        {failure.message}
        {failure.detail === undefined ? null : <span className={styles.failureDetail}>{failure.detail}</span>}
      </p>
    );

  if (blocker.severity === 'notice') {
    return (
      <div className={`${styles.notice}${flush ? ` ${styles.noticeFlat}` : ''}`} role="status" aria-busy={pending}>
        <span className={styles.noticeText}>
          <span className={styles.noticeTitle}>{blocker.title}</span>
          {blocker.hint === undefined ? null : <span className={styles.noticeHint}>{blocker.hint}</span>}
        </span>
        <span className={styles.noticeActions}>{buttons}</span>
        {failureBlock}
      </div>
    );
  }

  return (
    <div className={`${styles.blocker}${flush ? ` ${styles.blockerInline}` : ''}`} role="status" aria-busy={pending}>
      {flush ? null : (
        <span className={styles.icon} aria-hidden="true">
          <IconBrandMark size={32} />
        </span>
      )}
      <p className={styles.title}>{blocker.title}</p>
      {blocker.hint === undefined && inlineActions.length === 0 ? null : (
        <p className={styles.hint}>
          {blocker.hint}
          {inlineActions.map((action) => (
            <button
              key={`inline:${action.kind}:${action.label}`}
              type="button"
              className={`wb-link ${styles.inlineAction}`}
              disabled={pending}
              onClick={() => run(action)}
            >
              {action.label}
              <IconRightUpOutlineRegular size={12} />
            </button>
          ))}
        </p>
      )}

      {buttonActions.length === 0 ? null : <div className={styles.actions}>{buttons}</div>}
      {failureBlock}

      {blocker.detail === undefined ? null : (
        <DisclosureRow
          className={styles.raw}
          icon={<IconInfoOutlineRegular size={14} />}
          title={t('env.fix.details')}
          open={rawOpen}
          expandable
          expandOnRowClick
          previewChevron
          onToggle={() => setRawOpen(!rawOpen)}
        >
          <CodeBlock
            code={blocker.detail}
            className={styles.rawText}
            copyLabel={t('blocker.copy')}
            copiedLabel={t('env.copied')}
          />
        </DisclosureRow>
      )}
    </div>
  );
}
