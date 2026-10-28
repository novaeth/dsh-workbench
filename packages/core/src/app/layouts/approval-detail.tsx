import { Fragment, createElement as h, useEffect, useState } from 'react';
import type { ApprovalInput, ReactNode, Translate, UnitManifest, UnitToolOpencli } from '@dsh-workbench/shared';
import { APPROVAL_NOTE_ARG, ApprovalPlan } from '@dsh-workbench/shared';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketSourcesPayload, PublishChangelog, PublishPreview } from '@/kernel/contract/market-index';
import {
  ALL_TOOLS,
  DIY_PUBLISH_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  LONG_TASKS_STOP_TOOL,
  MARKET_DISABLE_TOOL,
  MARKET_ENABLE_TOOL,
} from '@/modules/panels/client';
import { readMarketSources, readPublishPreview } from '@/shared/hooks/market-queries';
import styles from './approval-detail.module.css';

export interface ApprovalRow {
  readonly label: string;
  readonly value: string;
}

function textOf(args: Readonly<Record<string, unknown>>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function recordApprovalRows(
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const unit = textOf(args, 'unit');
  const doing = textOf(args, 'doing');
  const url = textOf(args, 'url');
  return [
    { label: t('approval.record.site'), value: url === '' ? t('approval.record.noUrl') : url },
    {
      label: t('approval.record.what'),
      value: doing === '' ? t('approval.record.oneAction') : `「${doing}」`,
    },
    { label: t('approval.record.lands'), value: `shots/rec-${unit === '' ? '<unit>' : unit}.jsonl` },
  ];
}

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
}: {
  readonly args: Readonly<Record<string, unknown>>;
  readonly t: Translate;
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
    void readPublishPreview(unit, version, author, changelog, changelogType).then((response) => {
      if (live) setPreview(response.ok ? response.preview : null);
    });
    return () => {
      live = false;
    };
  }, [unit, version, author, changelog, changelogType]);
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
): ReadonlyMap<string, UnitToolOpencli> {
  const index = new Map<string, UnitToolOpencli>();
  for (const manifest of manifests) {
    for (const tool of manifest.tools) {
      if (tool.opencli === undefined) continue;
      index.set(tool.name, tool.opencli);
    }
  }
  return index;
}

function argText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text;
}

export function pluginApprovalRows(
  origin: UnitToolOpencli,
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const rows: ApprovalRow[] = [
    { label: t('approval.plugin.name'), value: origin.plugin },
    { label: t('approval.plugin.command'), value: origin.command },
  ];
  const note = args[APPROVAL_NOTE_ARG];
  if (typeof note === 'string' && note.trim() !== '') {
    rows.push({ label: t('approval.plugin.note'), value: note.replace(/\s+/g, ' ').trim() });
  }
  for (const name of origin.args) {
    if (!(name in args)) continue;
    rows.push({ label: name, value: argText(args[name]) });
  }
  return rows;
}

export function shellApprovalRenderer(
  manifests: () => readonly UnitManifest[],
): (input: ApprovalInput, t: Translate) => ReactNode {
  return (input, t) => shellApprovalDetail(input, t, pluginToolIndexOf(manifests()));
}

export function shellClaimsApprovalDetail(tool: string): boolean {
  return (ALL_TOOLS as readonly string[]).includes(tool);
}

function stopApprovalRows(
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const unit = textOf(args, 'unit');
  const id = textOf(args, 'id');
  return [
    {
      label: t('approval.longTask.what'),
      value: `${unit === '' ? '<unit>' : unit} · ${id === '' ? '<id>' : id}`,
    },
  ];
}

export function shellApprovalPlan(
  input: ApprovalInput,
  t: Translate,
  pluginTools?: ReadonlyMap<string, UnitToolOpencli> | undefined,
): ApprovalPlanView | undefined {
  const origin = pluginTools?.get(input.tool);
  if (origin !== undefined) return { rows: pluginApprovalRows(origin, input.args, t) };
  if (input.tool === DIY_RECORD_PREPARE_TOOL) {
    return { rows: recordApprovalRows(input.args, t), warn: t('approval.record.noSwitch') };
  }
  if (input.tool === LONG_TASKS_STOP_TOOL) {
    return {
      rows: stopApprovalRows(input.args, t),
      warn: t('approval.longTask.signal'),
    };
  }
  return shellClaimsApprovalDetail(input.tool) ? { rows: [] } : undefined;
}

export function shellApprovalDetail(
  input: ApprovalInput,
  t: Translate,
  pluginTools?: ReadonlyMap<string, UnitToolOpencli> | undefined,
): ReactNode {
  if (input.tool === DIY_PUBLISH_TOOL) return h(PublishApprovalSeat, { args: input.args, t });
  if (input.tool === MARKET_ENABLE_TOOL || input.tool === MARKET_DISABLE_TOOL) {
    return h(MarketSourceApprovalSeat, { tool: input.tool, args: input.args, t });
  }
  const plan = shellApprovalPlan(input, t, pluginTools);
  if (plan === undefined) return undefined;
  if (plan.rows.length === 0) return h(Fragment, null);
  return <ApprovalPlan rows={plan.rows} warn={plan.warn} />;
}
