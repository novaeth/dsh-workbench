import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from './Spinner.js';
import './FormActions.css';

/**
 * 一颗动作按钮的语气：`default`、`danger`（破坏性，描边危险色，永远不当填充主操作）、`primary`（填充，一个区只许一颗）。
 */
export type FormActionKind = 'default' | 'danger' | 'primary';

/**
 * 操作区里的一颗动作：键、文案、语气与回调；`busy` 时自带转圈并禁用。
 */
export interface FormAction {
  readonly key: string;
  readonly label: ReactNode;
  readonly kind?: FormActionKind | undefined;
  readonly onClick: () => void;
  readonly disabled?: boolean | undefined;
  readonly busy?: boolean | undefined;
}

/**
 * `FormActions` 的契约：一组动作。
 */
export interface FormActionsProps {
  readonly actions: readonly FormAction[];
}

const RANK: Record<FormActionKind, number> = { default: 0, danger: 1, primary: 2 };

function kindOf(action: FormAction): FormActionKind {
  return action.kind ?? 'default';
}

function ordered(actions: readonly FormAction[]): readonly FormAction[] {
  return actions
    .map((action, index) => ({ action, index, rank: RANK[kindOf(action)] }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((one) => one.action);
}

function reportExtraPrimaries(actions: readonly FormAction[]): void {
  const keys = actions.filter((one) => kindOf(one) === 'primary').map((one) => one.key);
  if (keys.length < 2) return;
  console.error(
    `[dsh-workbench] FormActions 一个区里出现了 ${keys.length} 颗 primary（${keys.join('、')}）—— ` +
      '一个区只许一颗主操作（ADR-0054 §2 规则二）：多余的这颗该改成 default',
  );
}

function variantOf(kind: FormActionKind): 'ghost' | 'outline' | 'primary' {
  if (kind === 'primary') return 'primary';
  if (kind === 'danger') return 'outline';
  return 'ghost';
}

/**
 * 操作区：把一组动作按"primary 永远在右、danger 紧挨它左侧"排好，窄了自动折行。
 * @param props.actions - 动作清单；调用点给的顺序只在同语气内部生效，空数组时整块不渲染。
 * @returns 一排按钮，或 `null`（没有动作时）。
 */
export function FormActions({ actions }: FormActionsProps) {
  if (actions.length === 0) return null;
  reportExtraPrimaries(actions);
  return (
    <div className="wb-formActions">
      {ordered(actions).map((action) => {
        const kind = kindOf(action);
        const busy = action.busy === true;
        return (
          <Button
            key={action.key}
            type="button"
            size="sm"
            variant={variantOf(kind)}
            className={kind === 'danger' ? 'wb-formActionDanger' : undefined}
            disabled={busy || action.disabled === true}
            icon={busy ? <Spinner size={12} /> : undefined}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
