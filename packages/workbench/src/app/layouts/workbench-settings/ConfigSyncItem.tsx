import { Fragment, createElement as h, useEffect, useMemo, useState } from 'react';
import type {
  ConfigSyncApplied,
  ConfigSyncProfile,
  ConfigSyncRow,
  ConfigSyncSnapshot,
} from '@/shared/api/config-sync';
import { CONFIG_SYNC_RESOURCE, CONFIG_SYNC_ROUTE } from '@/shared/api/config-sync';
import { Spinner } from '@dsh-workbench/shared';
import type { ModuleBlocker, Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS, Note, SkeletonRows, blockerOfError } from '@dsh-workbench/shared';
import { Button, IconRefreshOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import { SettingsItem } from './SettingsItem';
import { SourceRows } from './ConfigSyncRows';
import styles from './ConfigSyncItem.module.css';

const AUTO_RETRY_MS = 1200;

export interface ConfigSyncItemProps {
  readonly t: Translate;
}

interface SectionText {
  readonly t: Translate;
}

function SourcePicker({
  t,
  profiles,
  source,
  onPick,
}: SectionText & {
  readonly profiles: readonly ConfigSyncProfile[];
  readonly source: string;
  readonly onPick: (name: string) => void;
}): JSX.Element | null {
  if (profiles.length === 0) return null;
  return (
    <div className={styles.sources} role="group" aria-label={t('configSync.source')}>
      <span className={styles.sourcesLabel}>{t('configSync.source')}</span>
      {profiles.map((profile) => (
        <Button
          key={profile.name}
          variant={profile.name === source ? 'outline' : 'ghost'}
          size="sm"
          className={profile.name === source ? styles.sourceOn : undefined}
          aria-pressed={profile.name === source}
          title={
            profile.readable
              ? t('configSync.sourceRows', { name: profile.name, count: profile.candidates })
              : t('configSync.sourceBroken')
          }
          onClick={() => onPick(profile.name)}
        >
          {profile.name}
          <span className={styles.sourceCount}>
            {profile.readable ? profile.candidates : t('configSync.sourceDead')}
          </span>
        </Button>
      ))}
    </div>
  );
}

function AppliedRows({ t, applied }: SectionText & { readonly applied: ConfigSyncApplied }): JSX.Element {
  return (
    <Note>
      {applied.verified ? t('configSync.applied') : t('configSync.appliedUnverified')}
      {applied.files.length === 0
        ? ''
        : ` · ${t('configSync.appliedFiles', { count: applied.files.length })}`}
      {applied.written.length === 0
        ? ''
        : ` · ${t('configSync.appliedIds', { ids: applied.written.join('、') })}`}
      {applied.skipped.length === 0
        ? ''
        : ` · ${t('configSync.skippedIds', { ids: applied.skipped.join('、') })}`}
    </Note>
  );
}

function ReadingRow({ t }: SectionText): JSX.Element {
  return (
    <div className={styles.reading}>
      <p className={styles.status} role="status">
        <Spinner />
        {t('configSync.loading')}
      </p>
      <SkeletonRows rows={3} />
    </div>
  );
}

function FailureRow({
  t,
  blocker,
  onRetry,
}: SectionText & { readonly blocker: ModuleBlocker; readonly onRetry: () => void }): JSX.Element {
  return (
    <div className={styles.failure} role="alert" data-config-sync-failure="">
      <span className={styles.failureTitle}>
        <StateDot state="error" />
        {blocker.title}
      </span>
      {blocker.hint === undefined ? null : <span className={styles.failureHint}>{blocker.hint}</span>}
      <Button size="sm" variant="ghost" className={styles.failureAction} onClick={onRetry}>
        {t('blocker.retry')}
      </Button>
    </div>
  );
}

function StatusNotes({
  t,
  value,
  writeFailed,
  applied,
  broken,
  rows,
}: SectionText & {
  readonly value: ConfigSyncSnapshot;
  readonly writeFailed: string | null;
  readonly applied: ConfigSyncApplied | null;
  readonly broken: { readonly path: string; readonly reason: string } | null;
  readonly rows: readonly ConfigSyncRow[];
}): JSX.Element {
  return (
    <>
      {writeFailed === null ? null : (
        <Note tone="problem" role="alert">
          {writeFailed}
        </Note>
      )}
      {applied === null ? null : <AppliedRows t={t} applied={applied} />}
      {value.profiles.length === 0 ? <Note tone="problem">{t('configSync.noSource')}</Note> : null}
      {broken === null ? null : (
        <Note tone="problem">
          {t('configSync.unreadable', { path: broken.path, reason: broken.reason })}
        </Note>
      )}
      {value.emptyProviders ? <Note tone="problem">{t('configSync.emptyProviders')}</Note> : null}
      {rows.length === 0 ? <Note>{t('configSync.nothing')}</Note> : null}
    </>
  );
}

function SourceList({
  t,
  rows,
  picked,
  profile,
  assetOverwrites,
  canApply,
  busy,
  chosenCount,
  onToggle,
  onToggleAsset,
  onApply,
}: SectionText & {
  readonly rows: readonly ConfigSyncRow[];
  readonly picked: readonly string[];
  readonly profile: string;
  readonly assetOverwrites: readonly string[];
  readonly canApply: boolean;
  readonly busy: boolean;
  readonly chosenCount: number;
  readonly onToggle: (key: string, next: boolean) => void;
  readonly onToggleAsset: (key: string, next: boolean) => void;
  readonly onApply: () => void;
}): JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <>
      <SourceRows
        t={t}
        rows={rows}
        picked={picked}
        profile={profile}
        assetOverwrites={assetOverwrites}
        onToggle={onToggle}
        onToggleAsset={onToggleAsset}
      />
      <div className={styles.foot}>
        <Button variant="primary" size="md" disabled={!canApply || busy} onClick={onApply}>
          {chosenCount === 0
            ? t('configSync.applyNone')
            : busy
              ? t('configSync.applying')
              : t('configSync.apply', { count: chosenCount })}
        </Button>
      </div>
    </>
  );
}

interface PickedKeys {
  readonly at: string;
  readonly keys: readonly string[];
}

function selectionOf(input: {
  readonly rows: readonly ConfigSyncRow[];
  readonly picks: PickedKeys | null;
  readonly assetPicks: PickedKeys | null;
  readonly signature: string;
}): {
  readonly picked: readonly string[];
  readonly assetOverwrites: readonly string[];
  readonly chosen: readonly ConfigSyncRow[];
  readonly textKeys: readonly string[];
  readonly chosenAssets: readonly string[];
  readonly canApply: boolean;
} {
  const defaults = input.rows
    .filter(
      (row) =>
        row.state === 'new' ||
        (row.state === 'same' && row.assets.some((asset) => asset.state === 'missing')),
    )
    .map((row) => row.key);
  const picked = input.picks !== null && input.picks.at === input.signature ? input.picks.keys : defaults;
  const assetOverwrites =
    input.assetPicks !== null && input.assetPicks.at === input.signature ? input.assetPicks.keys : [];
  const chosen = input.rows.filter((row) => picked.includes(row.key));
  const textKeys = chosen.filter((row) => row.state !== 'same').map((row) => row.key);
  const chosenAssets = chosen.flatMap((row) =>
    row.assets
      .filter(
        (asset) =>
          asset.state === 'missing' ||
          (asset.state === 'differs' && assetOverwrites.includes(asset.key)),
      )
      .map((asset) => asset.key),
  );
  return {
    picked,
    assetOverwrites,
    chosen,
    textKeys,
    chosenAssets,
    canApply: chosen.length > 0 && (textKeys.length > 0 || chosenAssets.length > 0),
  };
}

function RefreshButton({
  t,
  disabled,
  onClick,
}: SectionText & { readonly disabled: boolean; readonly onClick: () => void }): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<IconRefreshOutlineRegular size={16} aria-hidden="true" />}
      onClick={onClick}
      disabled={disabled}
      title={t('configSync.refresh')}
    >
      {t('configSync.refresh')}
    </Button>
  );
}

export function ConfigSyncItem({ t }: ConfigSyncItemProps) {
  const [source, setSource] = useState('');
  const [revision, setRevision] = useState(0);
  const [guard, setGuard] = useState(0);
  const [picks, setPicks] = useState<{ readonly at: string; readonly keys: readonly string[] } | null>(null);
  const [assetPicks, setAssetPicks] = useState<{ readonly at: string; readonly keys: readonly string[] } | null>(
    null,
  );
  const [applied, setApplied] = useState<ConfigSyncApplied | null>(null);
  const snapshot = useApiResource<ConfigSyncSnapshot>(
    CONFIG_SYNC_ROUTE,
    source === '' ? {} : { source },
    revision,
  );
  const value = snapshot.phase === 'ready' ? snapshot.value : undefined;
  const failure = useMemo(() => {
    if (snapshot.phase !== 'error') return null;
    const blocker = blockerOfError(snapshot.error, t);
    return blocker.hint === undefined ? { ...blocker, hint: t('configSync.readHint') } : blocker;
  }, [snapshot.phase, snapshot.error, t]);
  useEffect(() => {
    if (failure === null || guard > 0) return undefined;
    const timer = setTimeout(() => {
      setGuard((current) => current + 1);
      setRevision((current) => current + 1);
    }, AUTO_RETRY_MS);
    return () => clearTimeout(timer);
  }, [failure, guard]);
  const write = useHostWrite<ConfigSyncApplied>({
    channel: 'actions',
    resource: CONFIG_SYNC_RESOURCE,
    networkText: t('configSync.failed'),
  });
  const busy = useVisibleBusy(write.busy, MIN_BUSY_MS);
  const reading = useVisibleBusy(snapshot.phase === 'loading', MIN_BUSY_MS);
  const rows = useMemo(() => value?.rows ?? [], [value]);
  const signature = `${value?.source ?? ''}|${String(revision)}|${rows
    .map(
      (row) =>
        `${row.key}:${row.state}:${row.missing.join('+')}:${row.assets
          .map((asset) => `${asset.key}:${asset.state}`)
          .join('+')}`,
    )
    .join(',')}`;
  const { picked, assetOverwrites, chosen, textKeys, chosenAssets, canApply } = selectionOf({
    rows,
    picks,
    assetPicks,
    signature,
  });
  const broken =
    value !== undefined && value.profiles.length > 0 && value.reason !== undefined
      ? { path: `${value.home}/profiles/${value.source}/cordis.patch.yml`, reason: value.reason }
      : null;

  const toggle = (key: string, next: boolean): void => {
    const rest = picked.filter((item) => item !== key);
    setPicks({ at: signature, keys: next ? [...rest, key] : rest });
  };

  const toggleAsset = (key: string, next: boolean): void => {
    const rest = assetOverwrites.filter((item) => item !== key);
    setAssetPicks({ at: signature, keys: next ? [...rest, key] : rest });
  };

  const reset = (next?: string): void => {
    setApplied(null);
    setPicks(null);
    setAssetPicks(null);
    setGuard(0);
    if (next === undefined) setRevision((current) => current + 1);
    else setSource(next);
  };

  const reread = (): void => reset();

  const pickSource = (name: string): void => reset(name);

  const apply = (): void => {
    if (value === undefined || !canApply) return;
    setApplied(null);
    const overwrite = chosen.filter((row) => row.state === 'differs').map((row) => row.key);
    void write
      .send({
        source: value.source,
        keys: textKeys,
        overwrite,
        assets: chosenAssets,
        overwriteAssets: assetOverwrites,
      })
      .then((outcome) => {
        if (!outcome.ok) return;
        setApplied(outcome.value);
        setRevision((current) => current + 1);
      });
  };

  return (
    <SettingsItem
      title={t('configSync.nav')}
      description={t('configSync.lead')}
      action={
        failure === null ? (
          <RefreshButton t={t} disabled={reading.busy} onClick={reread} />
        ) : undefined
      }
    >
      <div className={styles.body}>
        {value === undefined ? null : (
          <SourcePicker t={t} profiles={value.profiles} source={value.source} onPick={pickSource} />
        )}
        {reading.busy ? <ReadingRow t={t} /> : null}
        {failure !== null && !reading.busy ? (
          <FailureRow t={t} blocker={failure} onRetry={reread} />
        ) : null}
        {value !== undefined && !reading.busy ? (
          <>
            <StatusNotes
              t={t}
              value={value}
              writeFailed={write.failed}
              applied={applied}
              broken={broken}
              rows={rows}
            />
            <SourceList
              t={t}
              rows={rows}
              picked={picked}
              profile={value.self}
              assetOverwrites={assetOverwrites}
              canApply={canApply}
              busy={busy.busy}
              chosenCount={chosen.length}
              onToggle={toggle}
              onToggleAsset={toggleAsset}
              onApply={apply}
            />
          </>
        ) : null}
      </div>
    </SettingsItem>
  );
}
