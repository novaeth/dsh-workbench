import { createElement as h } from 'react';
import { kit } from '@dsh-workbench/core/client';

const UNIT_ID = '__UNIT__';
const SETUP_ROUTE = `${UNIT_ID}/setup`;

const { SetupShell, TextField } = kit.components;
const { useUnitSetup } = kit.hooks;

interface SetupPayload {
  readonly configured?: boolean;
  readonly values?: { readonly name?: string };
}

export interface SetupFlowProps {
  readonly t: (key: string) => string;
  readonly path: string;
  readonly onDone: () => void;
}

export function SetupFlow({ t, path, onDone }: SetupFlowProps): ReturnType<typeof h> {
  const setup = useUnitSetup({
    steps: [
      {
        id: 'name',
        title: t(`${UNIT_ID}.setup.title`),
        render: (ctx) =>
          h(TextField, {
            value: String(ctx.values['name'] ?? ''),
            placeholder: t(`${UNIT_ID}.setup.namePlaceholder`),
            disabled: ctx.busy,
            onChange: (event) => {
              ctx.setValues({ ...ctx.values, name: event.target.value });
            },
          }),
        submit: async (values) => {
          const response = await kit.api.apiPost<{ ok: boolean }>(SETUP_ROUTE, {
            path,
            name: String(values['name'] ?? ''),
          });
          return response.ok ? { ok: true } : { ok: false, message: response.error.message };
        },
      },
    ],
    read: async () => {
      const response = await kit.api.apiGet<SetupPayload>(SETUP_ROUTE, { path });
      if (!response.ok) return { configured: false, values: {} };
      return {
        configured: response.configured === true,
        values: { name: response.values?.name ?? '' },
      };
    },
    onReady: () => {
      onDone();
    },
  });
  return h(SetupShell, {
    setup,
    labels: {
      back: t(`${UNIT_ID}.setup.back`),
      next: t(`${UNIT_ID}.setup.next`),
      finish: t(`${UNIT_ID}.setup.finish`),
      save: t(`${UNIT_ID}.setup.save`),
      saving: t(`${UNIT_ID}.setup.saving`),
      cancel: t(`${UNIT_ID}.setup.cancel`),
      reading: t(`${UNIT_ID}.setup.reading`),
      failed: t(`${UNIT_ID}.setup.failed`),
    },
    renderHome: () => null,
  });
}
