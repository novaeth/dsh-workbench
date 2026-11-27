import type { Translate } from '@dsh-workbench/shared';
import { faultPromptOf, firstLineOf } from '@dsh-workbench/shared';
import type { FailureCardExtras, FailureCardModel } from './failure-card-text';
import type { MarketRow } from './market-row-types';

type ProblemCard = FailureCardModel & FailureCardExtras;

function promptOf(t: Translate, step: string, why: string, detail: string | undefined): string {
  const reason = firstLineOf(detail);
  return faultPromptOf(
    {
      screen: t('askAgent.screen.market'),
      step,
      problem: { why, ...(reason === undefined ? {} : { reason }) },
    },
    t,
  );
}

function base(t: Translate): ProblemCard {
  return {
    command: '',
    output: '',
    exitCode: null,
    title: undefined,
    fact: '',
    fixLabel: '',
    fix: '',
    actionLabel: t('panels.market.retry'),
    actionFirst: true,
    outputLabel: t('panels.market.problem.outputShow'),
    hideOutputLabel: t('panels.market.problem.outputHide'),
  };
}

function promptCard(
  t: Translate,
  input: {
    readonly step: string;
    readonly why: string;
    readonly fact?: string | undefined;
    readonly detail?: string | undefined;
    readonly detailLabels?: boolean | undefined;
  },
): ProblemCard {
  return {
    ...base(t),
    title: input.why,
    fact: input.fact ?? '',
    output: input.detail ?? '',
    fix: promptOf(t, input.step, input.why, input.detail),
    fixLabel: t('askAgent.copy'),
    ...(input.detailLabels === true
      ? {
          outputLabel: t('panels.market.problem.detail'),
          hideOutputLabel: t('panels.market.problem.hideDetail'),
        }
      : {}),
  };
}

export function rowProblemCardOf(t: Translate, row: MarketRow): ProblemCard | undefined {
  const problem = row.problem;
  if (problem === undefined) return undefined;
  const step = row.label ?? t(row.titleKey);
  if (problem.kind === 'startup') {
    return promptCard(t, {
      step,
      why: t('env.unit.failed'),
      fact: t('env.unit.failedHint'),
      detail: problem.detail,
    });
  }
  if (problem.kind === 'workbench-broken') {
    const why = t('panels.market.problem.workbenchTitle');
    const command = problem.command ?? '';
    return {
      ...base(t),
      title: why,
      fact: command === '' ? t('panels.market.problem.workbenchFactNoCommand') : t('panels.market.problem.workbenchFact'),
      command,
      showCommand: command !== '',
      ...(command === '' ? {} : { fix: command, fixLabel: t('panels.market.problem.copyCommand') }),
      actionFirst: false,
      askAgent: promptOf(t, why, why, command),
    };
  }
  if (problem.kind === 'reinstall') {
    return promptCard(t, {
      step,
      why: t('panels.market.problem.reinstallTitle'),
      fact: t('panels.market.problem.reinstallFact'),
      detail: problem.detail,
    });
  }
  const why = t('panels.market.problem.driftTitle');
  return {
    ...base(t),
    title: why,
    fact: t('panels.market.problem.driftFact', {
      declared: problem.declared,
      installed: problem.installed,
    }),
    askAgent: promptOf(t, step, why, `${problem.declared} / ${problem.installed}`),
    actionLabel: t('panels.market.reinstall'),
  };
}

export function listReadCardOf(t: Translate, detail: string): ProblemCard {
  const why = t('panels.market.problem.listTitle');
  return promptCard(t, {
    step: why,
    why,
    fact: t('panels.market.problem.listFact'),
    detail,
    detailLabels: true,
  });
}

export function selfUpdateFailureCardOf(t: Translate, detail: string): ProblemCard {
  const why = t('panels.market.selfUpdateFailed');
  return promptCard(t, { step: why, why, detail });
}
