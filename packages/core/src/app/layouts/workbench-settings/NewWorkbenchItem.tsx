import { Fragment, createElement as h, useCallback, useMemo, useState } from 'react';
import type { ProfileCreateApplied, ProfileCreateSnapshot } from '@/kernel/contract/profile-create';
import { PROFILE_CREATE_RESOURCE, PROFILE_CREATE_ROUTE } from '@/kernel/contract/profile-create';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS, Note, SelectField, TextField } from '@dsh-workbench/shared';
import { Button, Checkbox, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { FormRow, FormRows } from '@dsh-workbench/shared';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import { SettingsDisclosure } from './SettingsDisclosure';
import styles from './NewWorkbenchItem.module.css';

const COPIED_MS = 1200;
const NAME_ID = 'workbench-settings-new-name';

export interface NewWorkbenchItemProps {
  readonly t: Translate;
}

interface CopyFlags {
  readonly settings: boolean;
}

function defaultSourceOf(snapshot: ProfileCreateSnapshot): string {
  const named = snapshot.profiles.find((profile) => profile.name === 'web');
  if (named !== undefined) return named.name;
  const other = snapshot.profiles.find((profile) => !profile.current);
  return other?.name ?? snapshot.profiles[0]?.name ?? '';
}

export function NewWorkbenchItem({ t }: NewWorkbenchItemProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sourcePick, setSourcePick] = useState('');
  const [copy, setCopy] = useState<CopyFlags>({ settings: true });
  const [revision, setRevision] = useState(0);
  const [applied, setApplied] = useState<ProfileCreateApplied | null>(null);
  const [copied, setCopied] = useState(false);
  const snapshot = useApiResource<ProfileCreateSnapshot>(
    PROFILE_CREATE_ROUTE,
    {},
    revision,
    { enabled: open },
  );
  const value = snapshot.phase === 'ready' ? snapshot.value : undefined;
  const profiles = useMemo(() => value?.profiles ?? [], [value]);
  const source = sourcePick !== '' ? sourcePick : value === undefined ? '' : defaultSourceOf(value);
  const reading = useVisibleBusy(snapshot.phase === 'loading', MIN_BUSY_MS);
  const write = useHostWrite<ProfileCreateApplied>({
    channel: 'actions',
    resource: PROFILE_CREATE_RESOURCE,
    networkText: t('profileCreate.failed'),
  });
  const busy = useVisibleBusy(write.busy, MIN_BUSY_MS);

  const options = profiles.map((profile) => ({
    value: profile.name,
    label: profile.current ? `${profile.name}（${t('profileCreate.current')}）` : profile.name,
  }));
  const canCreate = name.trim() !== '' && source !== '' && !busy.busy;
  const toggle = (key: keyof CopyFlags, next: boolean): void => {
    setCopy((current) => ({ ...current, [key]: next }));
  };
  const create = (): void => {
    if (!canCreate) return;
    setApplied(null);
    void write.send({ profile: name.trim(), source, copy }).then((outcome) => {
      if (!outcome.ok) return;
      setApplied(outcome.value);
      setName('');
      setRevision((current) => current + 1);
    });
  };
  const command = applied?.command;
  const copyCommand = useCallback((): void => {
    if (command === undefined) return;
    void writeClipboard(command).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [command]);

  return (
    <SettingsDisclosure
      title={t('profileCreate.nav')}
      description={t('profileCreate.lead')}
      open={open}
      onToggle={() => setOpen((current) => !current)}
    >
      <div className={styles.body}>
        {snapshot.phase === 'error' ? (
          <Note tone="problem">
            {t('profileCreate.readFailed')}
            <Button variant="ghost" size="sm" onClick={() => setRevision((current) => current + 1)}>
              {t('profileCreate.retry')}
            </Button>
          </Note>
        ) : null}
        {reading.busy ? <Note>{t('profileCreate.reading')}</Note> : null}
        {value === undefined ? null : (
          <>
            {profiles.length === 0 ? <Note>{t('profileCreate.noProfiles')}</Note> : null}
            <FormRows>
              <FormRow label={t('profileCreate.name')} htmlFor={NAME_ID}>
                <TextField
                  id={NAME_ID}
                  value={name}
                  placeholder={t('profileCreate.nameHint')}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </FormRow>
              <FormRow label={t('profileCreate.source')}>
                <SelectField
                  value={source}
                  options={options}
                  onChange={setSourcePick}
                  ariaLabel={t('profileCreate.source')}
                  invalid={source === ''}
                />
              </FormRow>
              <FormRow label={t('profileCreate.copy')}>
                <Checkbox
                  checked={copy.settings}
                  label={t('profileCreate.settings')}
                  onChange={(next) => toggle('settings', next)}
                />
              </FormRow>
            </FormRows>
            {write.failed === null ? null : (
              <Note tone="problem" role="alert">
                {write.failed}
              </Note>
            )}
            <div className={styles.actions}>
              <Button variant="primary" size="md" disabled={!canCreate} onClick={create}>
                {busy.busy ? t('profileCreate.creating') : t('profileCreate.create')}
              </Button>
            </div>
          </>
        )}
        {applied === null ? null : (
          <div className={styles.result}>
            <Note>{t('profileCreate.created', { profile: applied.profile })}</Note>
            {command === undefined ? (
              <Note>{t('profileCreate.commandUnsupported')}</Note>
            ) : (
              <>
                <Note>{t('profileCreate.command')}</Note>
                <div className={styles.commandRow}>
                  <code className={styles.command}>{command}</code>
                  <Button variant="ghost" size="sm" onClick={copyCommand}>
                    {copied ? t('profileCreate.copied') : t('profileCreate.copyCommand')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </SettingsDisclosure>
  );
}
