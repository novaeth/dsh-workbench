import { h } from '../lib/react.js';
import type { FormAction } from './FormActions.js';
import { FormActions } from './FormActions.js';

/**
 * `SaveBar` 的契约：忙碌态、三句文案与两个回调。
 */
export interface SaveBarProps {
  readonly busy: boolean;
  readonly disabled?: boolean | undefined;
  readonly labels: {
    readonly cancel: string;
    readonly save: string;
    readonly saving: string;
  };
  readonly onCancel: () => void;
  readonly onSave: () => void;
}

/**
 * 设置面底下那条"取消 / 保存"：就是 `FormActions` 的两颗固定动作，顺序与间距不归调用点。
 * @param props.busy - 保存中：两颗钮一起禁用，保存那颗换成 `saving` 文案并带转圈。
 * @param props.disabled - 再额外禁掉保存钮（如没改动可存）；默认不禁，取消钮不受它管。
 * @param props.labels - 三句文案：`cancel` / `save` / `saving`。
 * @param props.onCancel - 点取消。
 * @param props.onSave - 点保存。
 * @returns 一组按钮。
 */
export function SaveBar({ busy, disabled, labels, onCancel, onSave }: SaveBarProps) {
  const actions: readonly FormAction[] = [
    { key: 'cancel', label: labels.cancel, kind: 'default', onClick: onCancel, disabled: busy },
    {
      key: 'save',
      label: busy ? labels.saving : labels.save,
      kind: 'primary',
      onClick: onSave,
      disabled: busy || disabled === true,
      busy,
    },
  ];
  return <FormActions actions={actions} />;
}
