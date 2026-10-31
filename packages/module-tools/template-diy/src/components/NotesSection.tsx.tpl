import { createElement as h, type ChangeEvent } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { kit } from '@dsh-workbench/core/client';
import { NOTE_TEXT_MAX, type Note as NoteRow } from '../model/notes';

const { Field, Note, Row, Rows, TextField } = kit.components;
const UNIT_ID = '__UNIT__';

export interface NotesSectionProps {
  readonly path: string;
  readonly className: string;
  readonly lineClassName: string;
  readonly t: (key: string) => string;
  readonly notes: readonly NoteRow[];
  readonly draft: string;
  readonly onDraft: (value: string) => void;
  readonly write: {
    readonly busy: boolean;
    readonly failed: string | null;
    send(text: string): Promise<{ readonly ok: boolean }>;
  };
}

export function NotesSection({
  path,
  className,
  lineClassName,
  t,
  notes,
  draft,
  onDraft,
  write,
}: NotesSectionProps): ReturnType<typeof h> {
  return h(
    'div',
    { className },
    h(
      Field,
      { label: t(`${UNIT_ID}.notesLabel`), hint: t(`${UNIT_ID}.notesHint`) },
      h(
        'div',
        { className: lineClassName },
        h(TextField, {
          value: draft,
          placeholder: t(`${UNIT_ID}.notePlaceholder`),
          maxLength: NOTE_TEXT_MAX,
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            onDraft(event.target.value);
          },
        }),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'sm',
            disabled: path === '' || draft.trim() === '' || write.busy,
            onClick: () => {
              void write.send(draft);
            },
          },
          t(`${UNIT_ID}.noteSave`),
        ),
      ),
    ),
    write.failed === null ? null : h(Note, null, write.failed),
    notes.length === 0
      ? h(Note, null, t(`${UNIT_ID}.notesEmpty`))
      : h(
          Rows,
          null,
          ...notes.map((one) => h(Row, { key: one.id, label: one.text, value: one.at })),
        ),
  );
}
