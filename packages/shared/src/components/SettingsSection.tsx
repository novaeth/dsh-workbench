import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import './SettingsSection.css';

/**
 * `SettingsSection` 的契约：一节的读屏名、标题、右上动作与内容。
 */
export interface SettingsSectionProps {
  readonly label: string;
  readonly title: ReactNode;
  readonly action?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * 设置面里的一节：标题 + 右上那颗动作 + 一节内容，把一屏设置分组。
 * @param props.label - 只给读屏的组名（`aria-label`），不是标题。
 * @param props.title - 人看的标题。
 * @param props.action - 标题右侧的动作（如"添加"）；不给不占位。
 * @param props.children - 这一节的内容。
 * @returns 一个 `role="group"` 的 section。
 */
export function SettingsSection({ label, title, action, children }: SettingsSectionProps) {
  return (
    <section className="wb-settings" role="group" aria-label={label}>
      <header className="wb-settingsHead">
        <span className="wb-settingsTitle">{title}</span>
        {action}
      </header>
      {children}
    </section>
  );
}
