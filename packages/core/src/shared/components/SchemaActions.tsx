import { createElement as h, Fragment, useState } from 'react';
import {
  Button,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { ActivityAction, IconConversation, Link } from '@dsh-workbench/shared';
import type { CardViewAction, Translate } from '@dsh-workbench/shared';
import { addContextChip } from '@/shared/api/context-chips';

function labelOf(action: CardViewAction, t: Translate): string {
  return action.label ?? (action.labelKey === undefined ? '' : t(action.labelKey));
}

function iconOf(action: CardViewAction) {
  const icon =
    action.icon ??
    (action.kind === 'open-url' ? 'open' : action.kind === 'retry' ? 'retry' : 'chat');
  if (icon === 'open') return h(IconRightUpOutlineRegular, { size: 14 });
  if (icon === 'retry') return h(IconRefreshOutlineRegular, { size: 14 });
  return h(IconConversation, { size: 14 });
}

function SchemaChatAction({ action, t }: { action: CardViewAction; t: Translate }) {
  const [failed, setFailed] = useState(false);
  if (action.kind !== 'chat') return null;
  const label = labelOf(action, t);
  const title = failed
    ? t('card.chatFailed')
    : action.title ?? (action.titleKey === undefined ? label : t(action.titleKey));
  const chipLabel =
    action.chip.label ??
    (action.chip.labelKey === undefined ? label : t(action.chip.labelKey));
  const onClick = (): void => {
    if (addContextChip(action.chip, chipLabel) === 'unavailable') {
      setFailed(true);
      setTimeout(() => setFailed(false), 2000);
    }
  };
  if (action.iconOnly === true) {
    return h(ActivityAction, {
      label,
      hint: title,
      icon: iconOf(action),
      onClick,
      failed,
    });
  }
  return h(
    Button,
    {
      type: 'button',
      variant: 'outline',
      size: 'sm',
      title,
      onClick,
    },
    label,
  );
}

export interface SchemaActionsProps {
  readonly actions: readonly CardViewAction[];
  readonly t: Translate;
  readonly onRefresh: () => void;
}

export function SchemaActions({ actions, t, onRefresh }: SchemaActionsProps) {
  return h(
    Fragment,
    null,
    ...actions.map((action, index) => {
      const label = labelOf(action, t);
      if (action.kind === 'chat') {
        return h(SchemaChatAction, { key: `${action.kind}-${String(index)}`, action, t });
      }
      if (action.iconOnly === true) {
        return h(ActivityAction, {
          key: `${action.kind}-${String(index)}`,
          label,
          hint: label,
          icon: iconOf(action),
          ...(action.kind === 'open-url'
            ? { href: action.href }
            : { onClick: onRefresh }),
        });
      }
      if (action.kind === 'retry') {
        return h(
          Button,
          {
            key: `${action.kind}-${String(index)}`,
            type: 'button',
            variant: 'outline',
            size: 'sm',
            onClick: onRefresh,
          },
          label,
        );
      }
      return h(Link, { key: `${action.kind}-${String(index)}`, href: action.href }, label);
    }),
  );
}
