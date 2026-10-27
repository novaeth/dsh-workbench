import { Fragment, createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { DiscoverSourceRow } from '@/kernel/contract/market-index';
import {
  Button,
  IconPlusOutlineRegular,
  IconWarningOutlineRegular,
  Input,
  Modal,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { sameSourceUrl, sourceFromUrl } from './discover-view';
import { DiscoverLoading } from './discover-states';
import { DiscoverSourceConfirm, DiscoverSourceItem } from './discover-source-item';
import styles from './MarketPage.module.css';

export interface DiscoverSourcesDialogProps {
  readonly t: Translate;
  readonly open: boolean;
  readonly sources: readonly DiscoverSourceRow[];
  readonly selected: string | null;
  readonly loading: boolean;
  readonly slow: boolean;
  readonly problem: { readonly id: string; readonly detail: string } | null;
  readonly failure: string | null;
  readonly busy: boolean;
  readonly adding: boolean;
  readonly pendingSourceId: string | null;
  readonly onClose: () => void;
  readonly onAdd: (url: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onSelect: (id: string) => void;
  readonly onEnable: (id: string) => void;
  readonly onReadOnly: (id: string) => void;
}

type UrlProblem = 'invalid' | 'duplicate';

export function DiscoverSourcesDialog(props: DiscoverSourcesDialogProps) {
  const { t } = props;
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<UrlProblem | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const pending = props.busy || props.adding || props.pendingSourceId !== null;
  const selectedVisible = props.sources.some((source) => source.id === props.selected);
  const add = (): void => {
    if (pending) return;
    const parsed = sourceFromUrl(url);
    if (!parsed.ok) {
      setProblem('invalid');
      return;
    }
    if (props.sources.some((source) => sameSourceUrl(source.url, parsed.source.url))) {
      setProblem('duplicate');
      return;
    }
    setProblem(null);
    setUrl('');
    props.onAdd(url);
  };
  return (
    <Modal
      open={props.open}
      onClose={() => {
        setUrl('');
        setProblem(null);
        setRemoving(null);
        props.onClose();
      }}
      title={t('panels.discover.sourcesTitle')}
      closeLabel={t('panels.discover.close')}
      description={t('panels.discover.sourcesIntro')}
      className={styles.discoverDialog}
    >
      <div className={styles.discoverDialogBody}>
        {props.loading && !selectedVisible ? (
          props.slow ? (
            <p className={styles.discoverNotice} role="note">
              <IconWarningOutlineRegular size={14} aria-hidden="true" />
              <span>{t('panels.discover.slowHint')}</span>
            </p>
          ) : (
            <DiscoverLoading label={t('panels.discover.loading')} />
          )
        ) : null}
        {props.sources.length === 0 ? null : (
          <ul className={styles.discoverSourceList} aria-label={t('panels.discover.sourcesLabel')}>
            {props.sources.map((source) => (
              <Fragment key={source.id}>
                <DiscoverSourceItem
                  t={t}
                  source={source}
                  selected={source.id === props.selected}
                  loading={props.loading}
                  slow={props.slow}
                  problem={!props.loading && props.problem?.id === source.id ? props.problem.detail : null}
                  pending={pending}
                  enable={source.kind === 'git' && source.policy !== 'artifacts-in-repo'}
                  disable={source.kind === 'git' && source.policy === 'artifacts-in-repo'}
                  working={source.id === props.pendingSourceId}
                  onSelect={() => props.onSelect(source.id)}
                  onRemove={() => setRemoving(source.id)}
                  onEnable={() => props.onEnable(source.id)}
                  onReadOnly={() => props.onReadOnly(source.id)}
                />
                {removing === source.id ? (
                  <DiscoverSourceConfirm
                    t={t}
                    label={source.label}
                    onCancel={() => setRemoving(null)}
                    onConfirm={() => {
                      props.onRemove(source.id);
                      setRemoving(null);
                    }}
                  />
                ) : null}
              </Fragment>
            ))}
          </ul>
        )}
        <form
          className={styles.discoverSourceForm}
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            className={styles.discoverGrow}
            value={url}
            placeholder={t('panels.discover.sourcePlaceholder')}
            aria-label={t('panels.discover.sourceUrl')}
            aria-invalid={problem !== null}
            data-modal-autofocus
            onChange={(event) => {
              setUrl(event.currentTarget.value);
              setProblem(null);
            }}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            aria-busy={props.adding}
            icon={props.adding ? <StateDot state="ongoing" /> : <IconPlusOutlineRegular size={13} />}
            disabled={pending || url.trim() === ''}
          >
            {props.adding ? t('panels.discover.addingSource') : t('panels.discover.addSource')}
          </Button>
        </form>
        {props.failure === null ? null : (
          <p className={styles.discoverError} role="alert">
            {props.failure}
          </p>
        )}
        {problem === null ? null : (
          <p className={styles.discoverError} role="alert">
            {problem === 'duplicate'
              ? t('panels.discover.sourceDuplicate')
              : t('panels.discover.sourceBadUrl')}
          </p>
        )}
        <p className={styles.discoverNotice} role="note">
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
          <span>{t('panels.discover.sourceTrust')}</span>
        </p>
      </div>
    </Modal>
  );
}
