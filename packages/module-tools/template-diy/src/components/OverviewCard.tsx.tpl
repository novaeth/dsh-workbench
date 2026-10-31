import { createElement as h, useState } from 'react';
import { kit } from '@dsh-workbench/core/client';
import { overviewStateOf, type OverviewReady } from '../model/overview';
import { RUN_RESOURCE, type SampleRun } from '../model/flow';
import { NOTE_RESOURCE, NOTES_ROUTE, type Note } from '../model/notes';
import { LIMIT_DEFAULT, PREFS_RESOURCE, PREFS_ROUTE, type Prefs } from '../model/prefs';
import { NotesSection } from './NotesSection';
import { OverviewBody } from './OverviewBody';
import { PrefsSection } from './PrefsSection';
import { RunSection } from './RunSection';
import styles from './OverviewCard.module.css';

const UNIT_ID = '__UNIT__';
const OVERVIEW_ROUTE = `${UNIT_ID}/overview`;

const { Card } = kit.components;
const { useApiResource, useHostWrite, useLongTask } = kit.hooks;

interface NotesPayload {
  readonly ok: boolean;
  readonly notes?: readonly Note[];
}

interface PrefsPayload {
  readonly ok: boolean;
  readonly prefs?: Prefs;
}

export interface OverviewCardProps {
  readonly path: string;
  readonly refreshToken: number;
  readonly onRefresh: () => void;
  readonly t: (key: string) => string;
}

export function OverviewCard(props: OverviewCardProps): ReturnType<typeof h> {
  const [draft, setDraft] = useState('');
  const [notesToken, setNotesToken] = useState(0);
  const [prefsToken, setPrefsToken] = useState(0);
  const path = props.path === '' ? undefined : props.path;

  const prefsResource = useApiResource<PrefsPayload>(PREFS_ROUTE, { path }, prefsToken, {
    enabled: props.path !== '',
  });
  const limit = prefsResource.value?.prefs?.limit ?? LIMIT_DEFAULT;
  const resource = useApiResource<OverviewReady>(OVERVIEW_ROUTE, { path, limit }, props.refreshToken, {
    enabled: props.path !== '',
  });
  const notesResource = useApiResource<NotesPayload>(NOTES_ROUTE, { path }, notesToken, {
    enabled: props.path !== '',
  });
  const feed = useLongTask<SampleRun>({
    unit: UNIT_ID,
    workspace: props.path === '' ? null : props.path,
  });
  const flowWrite = useHostWrite<{ runId: string }>({
    channel: 'actions',
    resource: RUN_RESOURCE,
    networkText: props.t(`${UNIT_ID}.network`),
  });
  const noteWrite = useHostWrite<{ notes?: readonly Note[] }>({
    channel: 'actions',
    resource: NOTE_RESOURCE,
    networkText: props.t(`${UNIT_ID}.network`),
  });
  const prefsWrite = useHostWrite<Prefs>({
    channel: 'prefs',
    resource: PREFS_RESOURCE,
    networkText: props.t(`${UNIT_ID}.network`),
  });

  const state = overviewStateOf({ phase: resource.phase, value: resource.value, error: resource.error });
  return h(
    Card,
    {
      t: props.t,
      title: props.t(`${UNIT_ID}.cardTitle`),
      refreshing: resource.phase === 'loading',
      onRefresh: () => {
        props.onRefresh();
        feed.refresh();
        setNotesToken((token) => token + 1);
        setPrefsToken((token) => token + 1);
      },
    },
    h(OverviewBody, { state, t: props.t }),
    h(RunSection, {
      path: props.path,
      className: styles.block,
      t: props.t,
      feed,
      write: flowWrite,
      failed: flowWrite.failed,
    }),
    h(NotesSection, {
      path: props.path,
      className: styles.block,
      lineClassName: styles.line,
      t: props.t,
      notes: notesResource.value?.notes ?? [],
      draft,
      onDraft: setDraft,
      write: {
        busy: noteWrite.busy,
        failed: noteWrite.failed,
        send: async (text: string) => {
          const outcome = await noteWrite.send({ path: props.path, text });
          if (outcome.ok) {
            setDraft('');
            setNotesToken((token) => token + 1);
            props.onRefresh();
          }
          return outcome;
        },
      },
    }),
    h(PrefsSection, {
      path: props.path,
      t: props.t,
      limit,
      busy: prefsWrite.busy,
      failed: prefsWrite.failed,
      onChange: (next: number) => {
        void prefsWrite.send({ workspace: props.path, limit: next }).then((outcome) => {
          if (outcome.ok) {
            setPrefsToken((token) => token + 1);
            props.onRefresh();
          }
        });
      },
    }),
  );
}
