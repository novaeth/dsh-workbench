import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { DiscoverSourceRow } from '@/kernel/contract/market-index';
import {
  Button,
  IconPlusOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
  Input,
  Modal,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { sameSourceUrl, sourceFromUrl } from './discover-view';
import { DiscoverLoading } from './discover-states';
import styles from './MarketPage.module.css';

export interface DiscoverSourcesDialogProps {
  readonly t: Translate;
  readonly open: boolean;
  readonly sources: readonly DiscoverSourceRow[];
  readonly selected: string | null;
  readonly loading: boolean;
  readonly slow: boolean;
  readonly problem: { readonly id: string; readonly detail: string } | null;
  readonly busy: boolean;
  readonly adding: boolean;
  readonly onClose: () => void;
  readonly onAdd: (url: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onSelect: (id: string) => void;
}

type UrlProblem = 'invalid' | 'duplicate';

export function DiscoverSourcesDialog(props: DiscoverSourcesDialogProps) {
  const { t } = props;
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<UrlProblem | null>(null);
  const pending = props.busy || props.adding;
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
      onClose={props.onClose}
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
              <li key={source.id} className={styles.discoverSourceRow}>
                <div className={styles.discoverMain}>
                  <span className={styles.discoverStrong}>{source.label}</span>
                  <span className={styles.discoverMeta}>{source.url}</span>
                  {!props.loading && props.problem?.id === source.id ? (
                    <span className={styles.discoverSourceError}>{props.problem.detail}</span>
                  ) : null}
                </div>
                {source.id === props.selected ? (
                  props.loading ? (
                    <span className={styles.discoverSourceLoading}>
                      <StateDot state="ongoing" />
                      {t('panels.discover.loading')}
                    </span>
                  ) : (
                    <span className={styles.discoverSourceCurrent}>{t('panels.discover.sourceCurrent')}</span>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('panels.discover.useSourceNamed', { label: source.label })}
                    disabled={pending}
                    onClick={() => {
                      props.onSelect(source.id);
                      props.onClose();
                    }}
                  >
                    {t('panels.discover.useSource')}
                  </Button>
                )}
                <Tooltip label={t('panels.discover.removeSource')} side="bottom" portal delayMs={300}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<IconTrashOutlineRegular size={13} />}
                    aria-label={t('panels.discover.removeSourceNamed', { url: source.url })}
                    disabled={pending}
                    onClick={() => props.onRemove(source.id)}
                  />
                </Tooltip>
                {source.id === props.selected && props.loading && props.slow ? (
                  <span className={styles.discoverSourceHint} role="note">
                    <IconWarningOutlineRegular size={12} aria-hidden="true" />
                    {t('panels.discover.slowHint')}
                  </span>
                ) : null}
              </li>
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
