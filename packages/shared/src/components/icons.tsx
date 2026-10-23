import { h, type ReactNode } from '../lib/react.js';

/**
 * 自绘图标的契约：只给边长像素。
 */
export interface IconProps {
  size?: number;
}

function Shell({
  size,
  strokeWidth = 1,
  viewBox = '0 0 16 16',
  children,
}: {
  size: number;
  strokeWidth?: number;
  viewBox?: string;
  children?: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  );
}

/**
 * 会话图标：一枚对话气泡，dsh 的图标表里没有，留给我们自己用；默认 16px。
 * @param props.size - 边长像素，同时给 `width` 与 `height`。
 * @returns 一枚 `aria-hidden` 的 svg。
 */
export function IconConversation({ size = 16 }: IconProps) {
  return (
    <Shell size={size} strokeWidth={1.3}>
      <path
        d="M2.5 7.2c0-2.3 2.1-4.2 4.8-4.2h1.4c2.7 0 4.8 1.9 4.8 4.2s-2.1 4.2-4.8 4.2H7.5l-3.2 2v-2.3c-1.1-.8-1.8-2-1.8-3.9Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </Shell>
  );
}

const BRAND_FRAME = 'M10 6H54A5 5 0 0 1 59 11V43A5 5 0 0 1 54 48H10A5 5 0 0 1 5 43V11A5 5 0 0 1 10 6Z M12 10H52A3 3 0 0 1 55 13V41A3 3 0 0 1 52 44H12A3 3 0 0 1 9 41V13A3 3 0 0 1 12 10Z';

const BRAND_TAIL =
  'M8.844 13.742C8.967 12.328 8.45 10.4 8.45 9.65C8.45 8.94 8.88 8.43 9.6 8.43C11.285 8.43 12.106 8.281 12.685 8.104C13.71 7.791 14.585 6.768 15.055 5.945C15.137 5.803 14.99 5.641 14.829 5.671C13.829 5.86 12.828 5.376 11.827 4.978C10.659 4.514 9.491 4.707 8.935 4.876C8.805 4.915 8.658 4.819 8.636 4.686C8.468 3.643 7.405 2.615 5.498 2.238C4.54 2.048 3.748 1.574 3.347 1.202C3.252 1.113 3.088 1.125 3.03 1.242C2.628 2.059 2.168 3.82 5.248 6.115C5.82 6.494 6.31 6.785 6.574 7.637C6.72 8.104 6.157 9.168 6.061 9.368C5.157 11.27 5.089 12.19 4.926 13.742Z';

const BRAND_TAIL_TRANSFORM = 'translate(14.6263 10.5853) scale(1.95)';

/**
 * 品牌标：一台显示器里放着 dsh 的鲸鱼尾巴；默认 24px（它是品牌物，别拿它当通用图标）。
 * @param props.size - 边长像素，同时给 `width` 与 `height`。
 * @returns 一枚 `aria-hidden` 的 svg。
 */
export function IconBrandMark({ size = 24 }: IconProps) {
  return (
    <Shell size={size} viewBox="0 0 64 64">
      <path d={BRAND_FRAME} fill="currentColor" fillRule="evenodd" />
      <rect x={27.5} y={48} width={9} height={4.75} fill="currentColor" />
      <rect x={19} y={52.75} width={26} height={4.75} rx={2.375} fill="currentColor" />
      <g transform={BRAND_TAIL_TRANSFORM}>
        <path d={BRAND_TAIL} fill="currentColor" />
        <circle cx={6.885} cy={13.742} r={1.95} fill="currentColor" />
      </g>
    </Shell>
  );
}

/**
 * opencli 的标：包类型那一格用它；颜色写死的品牌物，不跟主题走。默认 16px。
 * @param props.size - 边长像素，同时给 `width` 与 `height`。
 * @returns 一枚 `aria-hidden` 的 svg。
 */
export function IconOpencli({ size = 16 }: IconProps) {
  return (
    <Shell size={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="opencli-mark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00e5a0" />
          <stop offset="50%" stopColor="#00b4d8" />
          <stop offset="100%" stopColor="#7b61ff" />
        </linearGradient>
      </defs>
      <rect width={64} height={64} rx={14} fill="#0a0a0f" />
      <text
        x="50%"
        y="54%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontFamily="monospace"
        fontWeight={700}
        fontSize={28}
        fill="url(#opencli-mark)"
      >
        &gt;_
      </text>
    </Shell>
  );
}

/**
 * npm 的标：包类型那一格用它；保留品牌红，不跟主题走。默认 16px。
 * @param props.size - 边长像素，同时给 `width` 与 `height`。
 * @returns 一枚 `aria-hidden` 的 svg。
 */
export function IconNpm({ size = 16 }: IconProps) {
  return (
    <Shell size={size} viewBox="0 0 1024 1024">
      <path
        d="M64 337.76h896v298.72H512v49.792H312.896v-49.824H64z m49.792 248.928h99.552v-149.376h49.76v149.344h49.792v-199.104H113.792z m248.896-199.136v248.928h99.552v-49.792h99.552v-199.136z m99.552 49.792H512v99.584h-49.792z m149.344-49.792v199.136h99.552v-149.376h49.792v149.344h49.792v-149.344h49.792v149.344h49.792v-199.104z"
        fill="#CB3837"
      />
    </Shell>
  );
}

/**
 * 模块类型标：渐变方块 + 白四宫格，用在"这是个模块"的行首；品牌物，颜色不跟主题走。默认 16px。
 * @param props.size - 边长像素，同时给 `width` 与 `height`。
 * @returns 一枚 `aria-hidden` 的 svg。
 */
export function IconModuleMark({ size = 16 }: IconProps) {
  return (
    <Shell size={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id="workbench-module-mark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width={24} height={24} rx={7} fill="url(#workbench-module-mark)" />
      <rect x="4.6" y="4.6" width="6.2" height="6.2" rx="1.9" fill="#ffffff" />
      <rect x="13.2" y="4.6" width="6.2" height="6.2" rx="1.9" fill="#ffffff" fillOpacity={0.78} />
      <rect x="4.6" y="13.2" width="6.2" height="6.2" rx="1.9" fill="#ffffff" fillOpacity={0.78} />
      <rect x="13.2" y="13.2" width="6.2" height="6.2" rx="1.9" fill="#ffffff" />
    </Shell>
  );
}

/**
 * 面板 / 卡片那类的图标：整屏与柱状那种形状，给"面板"这一档用；默认 16px。
 * @param props.size - 边长像素，同时给 `width` 与 `height`。
 * @returns 一枚 `aria-hidden` 的 svg。
 */
export function IconPanelScreen({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'hidden' }}
    >
      <path d="M939 112c17.673 0 32 14.327 32 32v554.667c0 17.673-14.327 32-32 32l-394.5-0.001v96c0 3.74-0.642 7.331-1.82 10.668H768.4c17.673 0 32 14.326 32 32 0 17.496-14.042 31.712-31.47 31.995l-0.53 0.004H256.6c-17.673 0-32-14.327-32-32 0-17.496 14.042-31.713 31.47-31.995l0.53-0.005h225.721a31.923 31.923 0 0 1-1.817-10.137l-0.004-0.53v-96H86c-17.496 0-31.713-14.041-31.996-31.47l-0.004-0.53V144c0-17.673 14.327-32 32-32z m-32 64H118v490.666h789V176zM341.9 432c17.496 0 31.713 14.042 31.996 31.47l0.004 0.53v85.333c0 17.673-14.327 32-32 32-17.496 0-31.713-14.041-31.996-31.47l-0.004-0.53V464c0-17.673 14.327-32 32-32z m170.6-85.333c17.496 0 31.713 14.041 31.996 31.47l0.004 0.53v170.666c0 17.673-14.327 32-32 32-17.496 0-31.713-14.041-31.996-31.47l-0.004-0.53V378.667c0-17.673 14.327-32 32-32z m170.6-85.334c17.496 0 31.713 14.042 31.996 31.471l0.004 0.53v256c0 17.672-14.327 32-32 32-17.496 0-31.713-14.042-31.996-31.471l-0.004-0.53v-256c0-17.673 14.327-32 32-32z" />
    </svg>
  );
}
