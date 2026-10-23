import type { ReactNode } from '../lib/react.js';
import type { Translate } from '../api/dsh-client.js';
import {
  Button,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
  IconSettingsOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../lib/react.js';
import './CardHead.css';

/**
 * `CardHead` 的契约：标题、补充、刷新，外加齿轮与平台跳转两格。
 */
export interface CardHeadProps {
  readonly t: Translate;
  readonly title: string;
  readonly meta?: ReactNode | undefined;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly gear?: string | undefined;
  readonly gearOpen?: boolean | undefined;
  readonly onToggleGear?: (() => void) | undefined;
  readonly platformHref?: string | undefined;
  readonly platform?: string | undefined;
  readonly platformTitle?: string | undefined;
}

/**
 * 卡头：标题 + 补充 + 刷新钮（`Card` 内部就是它），要自己拼卡头或加齿轮 / 平台跳转时直接用。
 * @param props.t - 刷新那两句文案（刷新 / 刷新中）的翻译函数。
 * @param props.title - 卡标题；`props.meta` 是它右侧那一小段补充，不给不占位。
 * @param props.refreshing - 正在刷新：刷新钮禁用并转圈。
 * @param props.onRefresh - 点刷新钮做什么。
 * @param props.gear - 齿轮钮的读屏名；`gearOpen` 控制它高亮、`onToggleGear` 是点击回调，三者一起给才画。
 * @param props.platformHref - 整张卡对应系统的地址：给了就画那颗 ↗（新窗口），tooltip 用 `platformTitle`，缺了退化用 `platform`。
 * @returns 一个 `<header>`。
 */
export function CardHead({
  t,
  title,
  meta,
  refreshing,
  onRefresh,
  gear,
  gearOpen,
  onToggleGear,
  platformHref,
  platform,
  platformTitle,
}: CardHeadProps) {
  const refreshLabel = refreshing ? t('rightbar.refreshing') : t('rightbar.refresh');
  const platformLabel = platformTitle ?? platform ?? t('rightbar.openPlatform');
  return (
    <header className="wb-cardHead">
      <h2 className="wb-cardTitle">{title}</h2>
      {meta === undefined ? null : <span className="wb-cardMeta">{meta}</span>}
      {platformHref === undefined ? null : (
        <Tooltip side="bottom" align="end" gap={6} portal label={platformLabel}>
          <a
            className="wb-iconButton wb-cardOpen"
            href={platformHref}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={platform ?? platformLabel}
          >
            <IconRightUpOutlineRegular size={14} />
          </a>
        </Tooltip>
      )}
      <Tooltip side="bottom" align="end" gap={6} portal label={refreshLabel}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={`wb-cardRefresh${refreshing ? ' wb-spinning' : ''}`}
          aria-label={refreshLabel}
          disabled={refreshing}
          icon={<IconRefreshOutlineRegular size={14} />}
          onClick={onRefresh}
        />
      </Tooltip>
      {gear === undefined || onToggleGear === undefined ? null : (
        <Tooltip side="bottom" align="end" gap={6} portal label={gear}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={`wb-cardGear${gearOpen === true ? ' wb-iconButtonActive' : ''}`}
            aria-label={gear}
            aria-expanded={gearOpen === true}
            icon={<IconSettingsOutlineRegular size={15} />}
            onClick={onToggleGear}
          />
        </Tooltip>
      )}
    </header>
  );
}
