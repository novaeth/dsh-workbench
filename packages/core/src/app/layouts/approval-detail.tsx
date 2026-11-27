import { Fragment, createElement as h, useEffect, useState } from 'react';
import type { ApprovalInput, ReactNode, Translate, UnitManifest, UnitToolRuntime } from '@dsh-workbench/shared';
import { ApprovalPlan } from '@dsh-workbench/shared';
import {
  debugApprovalRows,
  moduleOperationRows,
  moduleSupplyRows,
  panelApprovalRows,
  planApprovalRows,
  pluginApprovalRows,
  recordApprovalRows,
  stopApprovalRows,
  textOf,
  type ApprovalRow,
} from './approval-rows';

export type { ApprovalRow } from './approval-rows';
export {
  debugApprovalRows,
  moduleOperationRows,
  moduleSupplyRows,
  panelApprovalRows,
  planApprovalRows,
  pluginApprovalRows,
  recordApprovalRows,
  stopApprovalRows,
} from './approval-rows';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { PlanCard } from './approval-plan';
import type { MarketSourcesPayload, PublishChangelog, PublishPreview } from '@/kernel/contract/market-index';
import {
  ALL_TOOLS,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_PUBLISH_TOOL,
  DIY_PLAN_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  LONG_TASKS_STOP_TOOL,
  MARKET_DISABLE_TOOL,
  MARKET_ENABLE_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  PANELS_FOLLOW_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
} from '@/modules/panels/client';
import { readMarketSources, readPublishPreview } from '@/shared/hooks/market-queries';
import styles from './approval-detail.module.css';

function labelsOf(args: Readonly<Record<string, unknown>>): readonly string[] {
  const value = args['labels'];
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : []))),
  ];
}

const PANEL_APPROVAL_TOOLS: ReadonlySet<string> = new Set([
  PANELS_SHOW_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_FOLLOW_TOOL,
]);

const MODULE_APPROVAL_TOOLS: ReadonlySet<string> = new Set([
  MODULES_UNINSTALL_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
]);

const TARGET_KEYS: Readonly<Record<string, string>> = {
  team: 'approval.publish.targetTeam',
  public: 'approval.publish.targetPublic',
  tarball: 'approval.publish.targetTarball',
  git: 'approval.publish.targetGit',
  market: 'approval.publish.targetMarket',
  local: 'approval.publish.targetLocal',
};

function targetText(target: string, t: Translate): string {
  if (target === '') return t('approval.publish.targetAuto');
  const key = TARGET_KEYS[target];
  return key === undefined ? target : t(key);
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)/;

function bumped(version: string, kind: string): string | undefined {
  const match = SEMVER.exec(version);
  if (match === null) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  return undefined;
}

export function versionLineOf(from: string, asked: string, auto: string | undefined): string {
  if (from === '') return asked === '' ? '—' : asked;
  const target =
    asked === ''
      ? (auto ?? from)
      : /^(major|minor|patch)$/.test(asked)
        ? (bumped(from, asked) ?? asked)
        : asked;
  return target === from ? from : `${from} → ${target}`;
}

export function publishRows(
  args: Readonly<Record<string, unknown>>,
  preview: PublishPreview | null | undefined,
  t: Translate,
): readonly ApprovalRow[] {
  const unit = textOf(args, 'unit');
  const target = textOf(args, 'target');
  const version = textOf(args, 'version');
  const author = textOf(args, 'author');
  const rows: ApprovalRow[] = [
    {
      label: t('approval.publish.module'),
      value:
        preview === undefined
          ? t('approval.publish.reading')
          : preview === null
            ? unit === ''
              ? '—'
              : unit
            : preview.name,
    },
    {
      label: t('approval.publish.version'),
      value:
        preview === undefined
          ? t('approval.publish.reading')
          : preview === null
            ? version === ''
              ? '—'
              : version
            : versionLineOf(preview.version, version, preview.market?.nextVersion),
    },
    { label: t('approval.publish.target'), value: targetText(target, t) },
    {
      label: t('approval.publish.author'),
      value:
        author !== ''
          ? author
          : preview === undefined
            ? t('approval.publish.reading')
            : preview?.author === undefined || preview.author === ''
              ? t('approval.publish.authorMissing')
              : preview.author,
    },
  ];
  const marketTarget = target === 'market' || (target === '' && preview?.market !== undefined);
  if (marketTarget) {
    const asked = labelsOf(args);
    const labels = asked.length > 0 ? asked : (preview?.labels ?? []);
    rows.push({
      label: t('approval.publish.labels'),
      value:
        preview === undefined && asked.length === 0
          ? t('approval.publish.reading')
          : labels.length === 0
            ? t('approval.publish.labelsNone')
            : labels.join(' · '),
    });
    const category = textOf(args, 'category') || (preview?.category ?? '');
    rows.push({
      label: t('approval.publish.category'),
      value:
        category !== ''
          ? category
          : preview === undefined
            ? t('approval.publish.reading')
            : t('approval.publish.categoryMissing'),
    });
    const known = preview?.categories;
    if (category !== '' && known !== undefined && !known.includes(category)) {
      rows.push({
        label: t('approval.publish.categoryVocabulary'),
        value:
          known.length === 0 ? t('approval.publish.categoryVocabularyEmpty') : known.join(' · '),
      });
    }
  }
  const claim = preview?.claim;
  if (claim !== undefined && claim.state !== 'new' && claim.state !== 'unknown') {
    if (claim.state === 'unit-taken') {
      rows.push({
        label: t('approval.publish.unit'),
        value: t('approval.publish.unitTaken', { entry: claim.entry }),
      });
    } else if (claim.state === 'path-taken') {
      rows.push({
        label: t('approval.publish.path'),
        value: t('approval.publish.pathTaken', { entry: claim.entry }),
      });
    } else {
      rows.push({
        label: t('approval.publish.owner'),
        value:
          claim.state === 'owned'
            ? claim.owner
            : claim.state === 'unowned'
              ? t('approval.publish.ownerUnowned')
              : t('approval.publish.ownerTaken', { owner: claim.owner }),
      });
    }
  }
  const market = preview?.market;
  if (market !== undefined) {
    rows.push(
      { label: t('approval.publish.repo'), value: market.url },
      { label: t('approval.publish.branch'), value: market.ref ?? t('approval.publish.defaultBranch') },
      { label: t('approval.publish.artifacts'), value: `${market.artifactPath} · ${market.files.join(' · ')}` },
      { label: t('approval.publish.index'), value: market.indexPath },
      { label: t('approval.publish.commits'), value: t('approval.publish.twoCommits') },
    );
  } else if (preview?.registry !== undefined) {
    rows.push({ label: t('approval.publish.registry'), value: preview.registry });
  }
  return rows;
}

function PublishChangelogSeat({
  changelog,
  t,
}: {
  readonly changelog: PublishChangelog | undefined;
  readonly t: Translate;
}) {
  if (changelog === undefined) return null;
  if (changelog.missing === true || changelog.text === undefined || changelog.text.trim() === '') {
    return h(
      'p',
      { className: styles.changelogMissing, role: 'note' },
      t('approval.publish.changelogMissing', { version: changelog.version }),
    );
  }
  return h(
    'section',
    { className: styles.changelog },
    h(
      'p',
      { className: styles.changelogTitle },
      changelog.pending === true
        ? t('approval.publish.changelogPending', { version: changelog.version })
        : t('approval.publish.changelog', { version: changelog.version }),
    ),
    h(
      'div',
      { className: styles.changelogBody },
      h(MarkdownText, {
        text: changelog.text,
        variant: 'compact',
        labels: {
          code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
          footnotes: t('markdown.footnotes'),
        },
      }),
    ),
  );
}

function PublishApprovalSeat({
  args,
  t,
  workspace,
}: {
  readonly args: Readonly<Record<string, unknown>>;
  readonly t: Translate;
  readonly workspace: string | undefined;
}) {
  const unit = textOf(args, 'unit');
  const version = textOf(args, 'version');
  const author = textOf(args, 'author');
  const changelog = typeof args['changelogNote'] === 'string' ? args['changelogNote'] : '';
  const changelogType = textOf(args, 'changelogType');
  const [preview, setPreview] = useState<PublishPreview | null | undefined>(() =>
    unit === '' ? null : undefined,
  );
  useEffect(() => {
    if (unit === '') return;
    let live = true;
    void readPublishPreview(unit, version, author, changelog, changelogType, workspace).then((response) => {
      if (live) setPreview(response.ok ? response.preview : null);
    });
    return () => {
      live = false;
    };
  }, [unit, version, author, changelog, changelogType, workspace]);
  return h(
    ApprovalPlan,
    { rows: publishRows(args, preview, t) },
    h(PublishChangelogSeat, { changelog: preview?.changelog, t }),
  );
}

export interface ApprovalPlanView {
  readonly rows: readonly ApprovalRow[];
  readonly warn?: string | undefined;
}

export function marketSourceRows(
  tool: string,
  args: Readonly<Record<string, unknown>>,
  payload: MarketSourcesPayload | null | undefined,
  t: Translate,
): readonly ApprovalRow[] {
  const id = textOf(args, 'id');
  const source =
    payload === undefined || payload === null
      ? undefined
      : payload.sources.find((one) => one.id === (id === '' ? payload.selected : id));
  const reading = t('approval.market.reading');
  const rows: ApprovalRow[] = [
    {
      label: t('approval.market.source'),
      value:
        payload === undefined
          ? reading
          : source === undefined
            ? id === ''
              ? '—'
              : id
            : `${source.label}（${source.id}）`,
    },
    { label: t('approval.market.url'), value: source?.url ?? (payload === undefined ? reading : '—') },
    {
      label: t('approval.market.action'),
      value: tool === MARKET_ENABLE_TOOL ? t('approval.market.enable') : t('approval.market.disable'),
    },
  ];
  if (source !== undefined) {
    rows.push({
      label: t('approval.market.policy'),
      value: source.policy === 'artifacts-in-repo' ? t('approval.market.writable') : t('approval.market.readOnly'),
    });
  }
  return rows;
}

function MarketSourceApprovalSeat({
  tool,
  args,
  t,
}: {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly t: Translate;
}) {
  const [payload, setPayload] = useState<MarketSourcesPayload | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void readMarketSources().then((response) => {
      if (live) setPayload(response.ok ? { sources: response.sources, selected: response.selected } : null);
    });
    return () => {
      live = false;
    };
  }, []);
  return h(ApprovalPlan, { rows: marketSourceRows(tool, args, payload, t) });
}

export function pluginToolIndexOf(
  manifests: readonly UnitManifest[],
): ReadonlyMap<string, UnitToolRuntime> {
  const index = new Map<string, UnitToolRuntime>();
  for (const manifest of manifests) {
    for (const tool of manifest.tools) {
      if (tool.runtime === undefined) continue;
      index.set(tool.name, tool.runtime);
    }
  }
  return index;
}

export function shellClaimsApprovalDetail(tool: string): boolean {
  return (ALL_TOOLS as readonly string[]).includes(tool);
}

export function shellApprovalRenderer(
  manifests: () => readonly UnitManifest[],
  workspaceOf?: (() => string | null) | undefined,
): (input: ApprovalInput, t: Translate) => ReactNode {
  return (input, t) => {
    const list = manifests();
    return shellApprovalDetail(input, t, pluginToolIndexOf(list), list, workspaceOf?.() ?? undefined);
  };
}

export function shellApprovalPlan(
  input: ApprovalInput,
  t: Translate,
  pluginTools?: ReadonlyMap<string, UnitToolRuntime> | undefined,
  manifests?: readonly UnitManifest[] | undefined,
): ApprovalPlanView | undefined {
  const origin = pluginTools?.get(input.tool);
  if (origin !== undefined) return { rows: pluginApprovalRows(origin, input.args, t) };
  if (input.tool === MODULES_INSTALL_TOOL || input.tool === MODULES_UPDATE_TOOL) {
    const id = textOf(input.args, 'id');
    return { rows: moduleSupplyRows(manifests?.find((one) => one.id === id), id, t) };
  }
  if (input.tool === DIY_RECORD_PREPARE_TOOL) {
    return { rows: recordApprovalRows(input.args, t) };
  }
  if (input.tool === LONG_TASKS_STOP_TOOL) {
    return {
      rows: stopApprovalRows(input.args, t),
      warn: t('approval.longTask.signal'),
    };
  }
  if (PANEL_APPROVAL_TOOLS.has(input.tool)) {
    return { rows: panelApprovalRows(input.tool, input.args, t) };
  }
  if (MODULE_APPROVAL_TOOLS.has(input.tool)) {
    return { rows: moduleOperationRows(input.tool, input.args, t) };
  }
  if (input.tool === DIY_DEBUG_START_TOOL || input.tool === DIY_DEBUG_RESUME_TOOL) {
    return { rows: debugApprovalRows(input.tool, input.args, t) };
  }
  if (shellClaimsApprovalDetail(input.tool)) return { rows: [] };
  const declared = manifests?.flatMap((one) => one.tools).find((one) => one.name === input.tool);
  if (declared?.writes === true) return { rows: [], warn: t('approval.missingDetail') };
  return undefined;
}

export function shellApprovalDetail(
  input: ApprovalInput,
  t: Translate,
  pluginTools?: ReadonlyMap<string, UnitToolRuntime> | undefined,
  manifests?: readonly UnitManifest[] | undefined,
  workspace?: string | undefined,
): ReactNode {
  if (input.tool === DIY_PUBLISH_TOOL) return h(PublishApprovalSeat, { args: input.args, t, workspace });
  if (input.tool === MARKET_ENABLE_TOOL || input.tool === MARKET_DISABLE_TOOL) {
    return h(MarketSourceApprovalSeat, { tool: input.tool, args: input.args, t });
  }
  if (input.tool === DIY_PLAN_TOOL) {
    return <ApprovalPlan rows={planApprovalRows(input.args, t)}>{h(PlanCard, { args: input.args, t })}</ApprovalPlan>;
  }
  const plan = shellApprovalPlan(input, t, pluginTools, manifests);
  if (plan === undefined) return undefined;
  if (plan.rows.length === 0 && plan.warn === undefined) return h(Fragment, null);
  return <ApprovalPlan rows={plan.rows} warn={plan.warn} />;
}
