import { createElement as h, useState } from 'react';
import type {
  BoardModuleProps,
  CardViewSettingField,
  CardViewSettingLoad,
  CardViewSettingOption,
  CardViewSettings,
  Translate,
  WriteChannel,
} from '@dsh-workbench/shared';
import {
  FormRow,
  FormRows,
  Note,
  SaveBar,
  SelectField,
  SettingsSection,
  TextField,
} from '@dsh-workbench/shared';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';

export interface SchemaSettingsProps {
  readonly settings: CardViewSettings<unknown>;
  readonly model: unknown;
  readonly host: BoardModuleProps;
  readonly t: Translate;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

interface FieldProps {
  readonly field: CardViewSettingField<unknown>;
  readonly value: string;
  readonly model: unknown;
  readonly host: BoardModuleProps;
  readonly t: Translate;
  readonly onChange: (value: string) => void;
}

function optionsOfLoad(load: CardViewSettingLoad, payload: unknown): readonly CardViewSettingOption[] {
  try {
    return load.pick(payload);
  } catch {
    return [];
  }
}

function withCurrent(
  options: readonly CardViewSettingOption[],
  current: string,
): readonly CardViewSettingOption[] {
  return options.some((option) => option.value === current)
    ? options
    : [{ value: current, label: current }, ...options];
}

function SchemaSettingField({ field, value, model, host, t, onChange }: FieldProps) {
  const load = field.kind === 'select' ? field.load : undefined;
  const query =
    typeof load?.query === 'function' ? load.query(host) : (load?.query ?? {});
  const resource = useApiResource<unknown>(load?.route ?? '', query, host.refreshToken, {
    enabled: load !== undefined,
    report: false,
  });
  if (field.kind !== 'select') {
    return h(TextField, {
      value,
      onChange: (event) => onChange(event.target.value),
      ...(field.placeholderKey === undefined
        ? {}
        : { placeholder: t(field.placeholderKey) }),
    });
  }
  const loaded =
    load !== undefined && resource.value !== undefined
      ? optionsOfLoad(load, resource.value)
      : [];
  const options =
    load !== undefined
      ? loaded
      : (field.optionsOf?.(model) ?? field.options ?? []);
  const label = t(field.labelKey);
  return h(SelectField, {
    value,
    options: withCurrent(options, value).map((option) => ({
      value: option.value,
      label: option.label ?? (option.labelKey === undefined ? '' : t(option.labelKey)),
    })),
    onChange,
    ariaLabel: label,
    ...(field.search === true
      ? {
          search: true,
          searchLabel: label,
          searchPlaceholder: t(field.placeholderKey ?? field.labelKey),
        }
      : {}),
    ...(field.placeholderKey === undefined
      ? {}
      : { placeholder: t(field.placeholderKey) }),
  });
}

export function SchemaSettings({ settings, model, host, t, onSaved, onCancel }: SchemaSettingsProps) {
  const [values, setValues] = useState<Readonly<Record<string, string>>>(() => settings.values(model));
  const [problem, setProblem] = useState<string | null>(null);
  const [channel, ...resourceParts] = settings.save.route.split('/');
  const write = useHostWrite<unknown>({
    channel: channel as WriteChannel,
    resource: resourceParts.join('/'),
    networkText: t(settings.labels.failedKey),
  });

  const set = (key: string, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const save = async (): Promise<void> => {
    setProblem(null);
    const response = await write.send(settings.save.body(values, model, host));
    if (!response.ok) {
      setProblem(response.message);
      return;
    }
    onSaved();
  };

  const fields = settings.fields.map((field) =>
    h(
      FormRow,
      {
        key: field.key,
        label: t(field.labelKey),
        ...(field.hintKey === undefined ? {} : { hint: t(field.hintKey) }),
      },
      h(SchemaSettingField, {
        field,
        value: values[field.key] ?? '',
        model,
        host,
        t,
        onChange: (next: string) => set(field.key, next),
      }),
    ),
  );

  return (
    <SettingsSection
      label={t(settings.labelKey ?? settings.titleKey)}
      title={t(settings.titleKey)}
    >
      <FormRows>{fields}</FormRows>
      {problem === null && write.failed === null ? null : (
        h(Note, { tone: 'problem', role: 'alert' }, problem ?? write.failed)
      )}
      <SaveBar
        busy={write.busy}
        labels={{
          cancel: t(settings.labels.cancelKey),
          save: t(settings.labels.saveKey),
          saving: t(settings.labels.savingKey),
        }}
        onCancel={onCancel}
        onSave={() => {
          void save();
        }}
      />
    </SettingsSection>
  );
}
