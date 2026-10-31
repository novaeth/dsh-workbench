import { createElement as h } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { kit } from '@dsh-workbench/core/client';
import { headlineOf, runIsLive, type SampleRun } from '../model/flow';

const { LongTaskRow, Note } = kit.components;
const UNIT_ID = '__UNIT__';

export interface RunSectionProps {
  readonly path: string;
  readonly className: string;
  readonly t: (key: string) => string;
  readonly feed: {
    readonly runs: readonly SampleRun[];
    stop(id: string): Promise<unknown>;
    readonly stopping: string | null;
    readonly stopFailed: string | null;
    refresh(): void;
  };
  readonly write: { readonly busy: boolean; send(body: Record<string, unknown>): Promise<{ readonly ok: boolean }> };
  readonly failed: string | null;
}

export function RunSection({ path, className, t, feed, write, failed }: RunSectionProps): ReturnType<typeof h> {
  const run = feed.runs[0];
  const live = run !== undefined && runIsLive(run);
  const stop =
    run === undefined || !live
      ? undefined
      : {
          onStop: () => {
            void feed.stop(run.id);
          },
          label: t(`${UNIT_ID}.stopLabel`),
          askLabel: t(`${UNIT_ID}.stopAsk`),
          busy: feed.stopping === run.id,
          failed: feed.stopFailed,
        };
  return h(
    'div',
    { className },
    h(
      Button,
      {
        variant: 'ghost',
        size: 'sm',
        disabled: path === '' || write.busy,
        onClick: () => {
          void write.send({ path }).then((outcome) => {
            if (outcome.ok) feed.refresh();
          });
        },
      },
      t(`${UNIT_ID}.runSample`),
    ),
    failed === null ? null : h(Note, null, failed),
    run === undefined
      ? h(Note, null, t(`${UNIT_ID}.runHint`))
      : h(LongTaskRow, {
          status: run.status,
          headline: headlineOf(run),
          problem: run.status === 'failed' ? run.why : undefined,
          steps: run.steps,
          raw: run.why,
          stepsTitle: t(`${UNIT_ID}.stepsTitle`),
          stop,
        }),
  );
}
