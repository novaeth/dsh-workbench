import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Note } from '@dsh-workbench/shared';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { SettingsRow } from './SettingsRow';

interface AdapterSetHealth {
  readonly configured: string | null;
  readonly active: string;
  readonly id: string;
  readonly version: string;
  readonly usesDefaults: boolean;
  readonly failure: string | null;
  readonly detail: string | null;
  readonly messageKey: string | null;
}

interface HealthSnapshot {
  readonly adapterSet?: AdapterSetHealth;
}

export interface AdapterSetItemProps {
  readonly t: Translate;
}

export function AdapterSetItem({ t }: AdapterSetItemProps): JSX.Element | null {
  const health = useApiResource<HealthSnapshot>('health', {}, 0);
  const unreadable = health.phase === 'error';
  const info = health.value?.adapterSet;
  const failed = info?.failure !== null && info?.failure !== undefined;
  if (!unreadable && (info === undefined || (!failed && info.configured === null))) return null;
  const problem = unreadable || info === undefined || failed;
  const message =
    unreadable || info === undefined
      ? t('adapterSet.healthUnreadable')
      : failed
        ? t(info.messageKey ?? 'adapterSet.failed', { spec: info.configured ?? '' })
        : t('adapterSet.active', { id: info.id, version: info.version });
  const detail = unreadable ? health.error?.message : (info?.detail ?? undefined);

  return (
    <SettingsRow
      title={t('adapterSet.title')}
      description={t('adapterSet.lead')}
      error={problem ? message : null}
    >
      {problem ? null : <Note>{message}</Note>}
      {info !== undefined && !failed && info.configured !== null && info.usesDefaults ? (
        <Note>{t('adapterSet.defaults')}</Note>
      ) : null}
      {detail === undefined || detail === '' ? null : <Note>{detail}</Note>}
    </SettingsRow>
  );
}
