import type { Need, Translate, UnitManifest, UnitToolRuntime } from '@dsh-workbench/shared';
import { APPROVAL_NOTE_ARG } from '@dsh-workbench/shared';
import {
  DIY_DEBUG_START_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
} from '@/modules/panels/client';

export type ApprovalCell = string | readonly string[];

export interface ApprovalRow {
  readonly label: string;
  readonly value: ApprovalCell;
}

export function textOf(args: Readonly<Record<string, unknown>>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function argLine(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text;
}

function argCell(value: unknown): ApprovalCell {
  if (Array.isArray(value) && value.length > 0) return value.map(argLine);
  return argLine(value);
}

export function planApprovalRows(
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const value = args['approval'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const approval = value as Readonly<Record<string, unknown>>;
  return (['object', 'change', 'target', 'impact'] as const).flatMap((key) => {
    const text = textOf(approval, key);
    return text === '' ? [] : [{ label: t(`approval.fact.${key}`), value: text }];
  });
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
    {
      label: t('approval.record.lands'),
      value: unit === '' ? t('approval.record.landsUnknown') : `shots/rec-${unit}.jsonl`,
    },
  ];
}

export function pluginApprovalRows(
  origin: UnitToolRuntime,
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
    rows.push({ label: name, value: argCell(args[name]) });
  }
  return rows;
}

const SUPPLY_LABEL: Readonly<Record<string, string>> = {
  extension: 'approval.supply.plugin',
  lib: 'approval.supply.lib',
};

function supplyNeedRows(needs: readonly Need[], t: Translate): readonly ApprovalRow[] {
  return needs.flatMap((need) => {
    if (need.kind !== 'extension' && need.kind !== 'lib') return [];
    const version = typeof need.version === 'string' && need.version !== '' ? ` ${need.version}` : '';
    const purpose = need.purpose.trim();
    return [
      {
        label: t(SUPPLY_LABEL[need.kind] ?? 'approval.supply.kind'),
        value: `${need.name}${version}${purpose === '' ? '' : ` —— ${purpose}`}`,
      },
    ];
  });
}

export function moduleSupplyRows(
  manifest: UnitManifest | undefined,
  id: string,
  t: Translate,
): readonly ApprovalRow[] {
  const rows: ApprovalRow[] = [{ label: t('approval.supply.module'), value: id === '' ? '—' : id }];
  if (manifest === undefined) {
    return [...rows, { label: t('approval.supply.kind'), value: t('approval.supply.missing') }];
  }
  const needs = (manifest.needs ?? []).filter((need) => need.kind === 'extension' || need.kind === 'lib');
  if (needs.length === 0) {
    return [...rows, { label: t('approval.supply.kind'), value: t('approval.supply.none') }];
  }
  return [...rows, ...supplyNeedRows(needs, t)];
}

export function stopApprovalRows(
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

function fourFacts(
  label: string,
  value: string,
  change: string,
  target: string,
  impact: string,
  t: Translate,
): readonly ApprovalRow[] {
  return [
    { label, value },
    { label: t('approval.fact.change'), value: change },
    { label: t('approval.fact.target'), value: target },
    { label: t('approval.fact.impact'), value: impact },
  ];
}

export function panelApprovalRows(
  tool: string,
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const id = textOf(args, 'id');
  const machine = textOf(args, 'scope') === 'machine';
  const target = machine ? t('approval.shell.machineDefaults') : t('approval.shell.projectPanel');
  const change =
    tool === PANELS_SHOW_TOOL
      ? t('approval.shell.addPanel')
      : tool === PANELS_MOVE_TOOL
        ? (() => {
            const raw = args['index'];
            const at = typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0;
            return at === 0
              ? t('approval.shell.moveFront')
              : t('approval.shell.moveAt', { index: at + 1 });
          })()
        : tool === PANELS_RESET_TOOL
          ? machine
            ? t('approval.shell.resetMachine')
            : t('approval.shell.resetProject')
          : t('approval.shell.followDefaults');
  const impact =
    tool === PANELS_SHOW_TOOL
      ? t('approval.shell.impactPanel')
      : tool === PANELS_MOVE_TOOL
        ? t('approval.shell.impactMove')
        : tool === PANELS_RESET_TOOL
          ? t('approval.shell.impactReset')
          : t('approval.shell.impactFollow');
  return fourFacts(
    tool === PANELS_RESET_TOOL ? t('approval.shell.panel') : t('approval.shell.module'),
    tool === PANELS_RESET_TOOL ? target : id === '' ? '—' : id,
    change,
    target,
    impact,
    t,
  );
}

export function moduleOperationRows(
  tool: string,
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  if (tool === MODULES_INSTALL_BUNDLE_TOOL) {
    const spec = textOf(args, 'spec');
    return fourFacts(
      t('approval.shell.bundle'),
      spec === '' ? '—' : spec,
      t('approval.shell.installBundle'),
      t('approval.shell.config'),
      t('approval.shell.impactInstallBundle'),
      t,
    );
  }
  if (tool === MODULES_UPDATE_WORKBENCH_TOOL) {
    return fourFacts(
      t('approval.shell.workbench'),
      t('approval.shell.itself'),
      t('approval.shell.updateLatest'),
      t('approval.shell.thisMachine'),
      t('approval.shell.impactWorkbench'),
      t,
    );
  }
  const id = textOf(args, 'id');
  const plugin = textOf(args, 'plugin');
  const pluginTool = tool === MODULES_UPDATE_PLUGIN_TOOL || tool === MODULES_UNINSTALL_PLUGIN_TOOL;
  const name = pluginTool ? plugin : id;
  const label = pluginTool
    ? t('approval.shell.plugin')
    : tool === MODULES_UPDATE_DEPENDENCY_TOOL
      ? t('approval.shell.dependency')
      : t('approval.shell.module');
  const change =
    tool === MODULES_UNINSTALL_TOOL
      ? t('approval.shell.uninstallModule')
      : tool === MODULES_UNINSTALL_PLUGIN_TOOL
        ? t('approval.shell.uninstallPlugin')
        : t('approval.shell.updateLatest');
  const impact =
    tool === MODULES_UNINSTALL_TOOL
      ? t('approval.shell.impactUninstallModule')
      : tool === MODULES_UNINSTALL_PLUGIN_TOOL
        ? t('approval.shell.impactUninstallPlugin')
        : tool === MODULES_UPDATE_DEPENDENCY_TOOL
          ? t('approval.shell.impactDependency')
          : t('approval.shell.impactPlugin');
  return fourFacts(
    label,
    name === '' ? '—' : name,
    change,
    t('approval.shell.thisMachine'),
    impact,
    t,
  );
}

export function debugApprovalRows(
  tool: string,
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const unit = textOf(args, 'unit');
  const starting = tool === DIY_DEBUG_START_TOOL;
  return fourFacts(
    t('approval.shell.module'),
    unit === '' ? '—' : unit,
    starting ? t('approval.shell.startDebug') : t('approval.shell.resumeDebug'),
    t('approval.shell.page'),
    starting ? t('approval.shell.impactStartDebug') : t('approval.shell.impactResumeDebug'),
    t,
  );
}
