import { createElement as h } from 'react';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';

type TooltipProps = Parameters<typeof Tooltip>[0];

/**
 * dsh `Tooltip` 的外壳默认值版：说明统一按右栏习惯（`bottom` / `end` / `gap 6` / 挂 body）来，其余 prop 原样转给 `Tooltip`。
 * @param props.side - 气泡出现在锚点哪一侧（默认 `'bottom'`）。
 * @param props.align - 底 / 顶气泡贴锚点哪条边（默认 `'end'`）。
 * @param props.gap - 锚点到气泡的间距（默认 `6`）。
 * @param props.portal - 是否挂到 `document.body`，以逃出裁剪容器与层叠上下文（默认 `true`）。
 * @param props.children - 单个锚点元素；`label` / `shortcutKeys` / `openOnClick` 等其余 prop 与 dsh 同形。
 */
export function Tip({ side = 'bottom', align = 'end', gap = 6, portal = true, ...rest }: TooltipProps) {
  return <Tooltip side={side} align={align} gap={gap} portal={portal} {...rest} />;
}
