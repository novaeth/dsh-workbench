import type { ReactNode } from '../lib/react.js';
import type { Translate } from '../api/dsh-client.js';
import { h } from '../lib/react.js';
import { CardHead } from './CardHead.js';
import './Card.css';

/**
 * `Card` 的契约：标题、刷新、卡片体，以及可整块替换的卡头。
 */
export interface CardProps {
  readonly t: Translate;
  readonly title: string;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly meta?: ReactNode | undefined;
  readonly head?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * 一张卡的壳：卡头（标题 + 刷新钮）+ 卡片体，面板上每一格都是它。
 * @param props.t - 卡头那两句文案（刷新 / 刷新中）的翻译函数。
 * @param props.refreshing - 正在刷新：刷新钮随之禁用并转圈；接 `resource.phase === 'loading'`。
 * @param props.onRefresh - 点刷新钮做什么，异步由调用点自己管。
 * @param props.meta - 标题右侧那一小段补充（条数、时间）；不给不占位。
 * @param props.head - 整块替换卡头时给（如自带齿轮的 `CardHead`）；不给用默认卡头。
 * @param props.children - 卡片体。
 * @returns 一个 `<section>`。
 */
export function Card({ t, title, refreshing, onRefresh, meta, head, children }: CardProps) {
  return (
    <section className="wb-card">
      {head === undefined ? (
        <CardHead t={t} title={title} refreshing={refreshing} onRefresh={onRefresh} meta={meta} />
      ) : (
        head
      )}
      <div className="wb-cardBody">{children}</div>
    </section>
  );
}
