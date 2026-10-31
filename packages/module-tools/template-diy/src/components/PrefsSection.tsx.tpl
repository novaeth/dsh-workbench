import { createElement as h } from 'react';
import { kit } from '@dsh-workbench/core/client';
import { LIMIT_CHOICES } from '../model/prefs';

const { Field, Note, SelectField } = kit.components;
const UNIT_ID = '__UNIT__';

export interface PrefsSectionProps {
  readonly path: string;
  readonly t: (key: string) => string;
  readonly limit: number;
  readonly busy: boolean;
  readonly failed: string | null;
  readonly onChange: (limit: number) => void;
}

export function PrefsSection({ path, t, limit, busy, failed, onChange }: PrefsSectionProps): ReturnType<typeof h> {
  const known = LIMIT_CHOICES.includes(limit as (typeof LIMIT_CHOICES)[number]);
  const choices = known ? [...LIMIT_CHOICES] : [...LIMIT_CHOICES, limit].sort((a, b) => a - b);
  return h(
    Field,
    { label: t(`${UNIT_ID}.prefsLabel`), hint: t(`${UNIT_ID}.prefsHint`) },
    failed === null ? null : h(Note, null, failed),
    h(SelectField, {
      value: String(limit),
      disabled: path === '' || busy,
      options: choices.map((choice) => ({
        value: String(choice),
        label: `${String(choice)}${t(`${UNIT_ID}.prefsUnit`)}`,
      })),
      onChange: (value: string) => {
        onChange(Number(value));
      },
    }),
  );
}
