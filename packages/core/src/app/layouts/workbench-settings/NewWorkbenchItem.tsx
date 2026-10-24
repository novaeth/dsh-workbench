import { Fragment, createElement as h, useMemo, useState } from 'react';
import type { ProfileCreateApplied, ProfileCreateSnapshot } from '@/kernel/contract/profile-create';
import { PROFILE_CREATE_RESOURCE, PROFILE_CREATE_ROUTE } from '@/kernel/contract/profile-create';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS, Note, SelectField, TextField } from '@dsh-workbench/shared';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import { SettingsItem } from './SettingsItem';
import styles from './NewWorkbenchItem.module.css';

export interface NewWorkbenchItemProps {
  readonly t: Translate;
}

interface CopyFlags {
  readonly settings: boolean;
  readonly plugins: boolean;
  readonly projects: boolean;
  readonly sessions: boolean;
}

function defaultSourceOf(snapshot: ProfileCreateSnapshot): string {
  const named = snapshot.profiles.find((profile) => profile.name === 'web');
  if (named !== undefined) return named.name;
  const other = snapshot.profiles.find((profile) => !profile.current);
  return other?.name ?? snapshot.profiles[0]?.name ?? '';
}

export function NewWorkbenchItem({ t }: NewWorkbenchItemProps): JSX.Element {
  const [name, setName] = useState('');
  const [sourcePick, setSourcePick] = useState('');
  const [copy, setCopy] = useState<CopyFlags>({
    settings: true,
    plugins: true,
    projects: true,
    sessions: false,
  });
  const [revision, setRevision] = useState(0);
  const [applied, setApplied] = useState<ProfileCreateApplied | null>(null);
  const snapshot = useApiResource<ProfileCreateSnapshot>(PROFILE_CREATE_ROUTE, {}, revision);
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
    setCopy((current) => {
      const draft = { ...current, [key]: next };
      if (key === 'settings' && next) draft.plugins = true;
      if (key === 'plugins' && !next && current.settings) return current;
      return draft;
    });
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

  return (
    <SettingsItem title={t('profileCreate.nav')} description={t('profileCreate.lead')}>
      <div className={styles.body}>
        {snapshot.phase === 'error' ? (
          <Note tone="problem">
            {t('profileCreate.readFailed')}
            <Button variant="ghost" size="sm" onClick={() => setRevision((current) => current + 1)}>
              {t('profileCreate.retry')}
            </Button>
          </Note>
        ) : null}
        {reading.busy ? <p className={styles.hint}>{t('profileCreate.reading')}</p> : null}
        {value === undefined ? null : (
          <>
            {profiles.length === 0 ? <Note>{t('profileCreate.noProfiles')}</Note> : null}
            <label className={styles.field}>
              <span className={styles.label}>{t('profileCreate.name')}</span>
              <TextField
                value={name}
                placeholder={t('profileCreate.nameHint')}
                autoComplete="off"
                spellCheck={false}
                className={styles.input}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <div className={styles.field}>
              <span className={styles.label}>{t('profileCreate.source')}</span>
              <SelectField
                value={source}
                options={options}
                onChange={setSourcePick}
                ariaLabel={t('profileCreate.source')}
                invalid={source === ''}
              />
            </div>
            <fieldset className={styles.copy}>
              <legend className={styles.label}>{t('profileCreate.copy')}</legend>
              <Checkbox
                checked={copy.settings}
                label={t('profileCreate.settings')}
                onChange={(next) => toggle('settings', next)}
              />
              <Checkbox
                checked={copy.plugins}
                disabled={copy.settings}
                title={copy.settings ? t('profileCreate.pluginsRequired') : undefined}
                label={
                  copy.settings
                    ? `${t('profileCreate.plugins')} · ${t('profileCreate.pluginsRequired')}`
                    : t('profileCreate.plugins')
                }
                onChange={(next) => toggle('plugins', next)}
              />
              <Checkbox
                checked={copy.projects}
                label={t('profileCreate.projects')}
                onChange={(next) => toggle('projects', next)}
              />
              <Checkbox
                checked={copy.sessions}
                label={t('profileCreate.sessions')}
                onChange={(next) => toggle('sessions', next)}
              />
            </fieldset>
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
          <Note>
            {t('profileCreate.created', { profile: applied.profile })}
            <span className={styles.commandLabel}>{t('profileCreate.command')}</span>
            <code className={styles.command}>{applied.command}</code>
          </Note>
        )}
      </div>
    </SettingsItem>
  );
}
