import type { ProvisionAction } from '../contract/workbench-contract.js';

export type { ProvisionAction };

export const PROVISION_ACTIONS = [
  'install',
  'update',
  'uninstall',
  'install-bundle',
  'install-version',
  'update-bundle',
  'remove-bundle',
  'cancel-install',
  'update-dependency',
  'update-plugin',
  'uninstall-plugin',
  'update-workbench',
  'migrate-workbench',
  'dismiss-followup',
] as const satisfies readonly ProvisionAction[];

export const DEPENDENCY_ACTIONS = ['update-dependency'] as const satisfies readonly ProvisionAction[];

export function isDependencyAction(
  action: ProvisionAction,
): action is (typeof DEPENDENCY_ACTIONS)[number] {
  return (DEPENDENCY_ACTIONS as readonly ProvisionAction[]).includes(action);
}

type MissingAction = Exclude<ProvisionAction, (typeof PROVISION_ACTIONS)[number]>;

const ALL_ACTIONS_COVERED: MissingAction extends never ? true : never = true;
void ALL_ACTIONS_COVERED;

export type ProvisionTarget = 'unit' | 'id' | 'spec' | 'name' | 'requestId';

export function provisionTargetOf(action: ProvisionAction): ProvisionTarget {
  if (action === 'update-dependency') return 'id';
  if (action === 'install-bundle' || action === 'install-version') return 'spec';
  if (action === 'remove-bundle') return 'name';
  if (action === 'update-plugin' || action === 'uninstall-plugin') return 'name';
  if (action === 'update-workbench' || action === 'migrate-workbench') return 'name';
  if (action === 'dismiss-followup') return 'id';
  if (action === 'cancel-install') return 'requestId';
  return 'unit';
}

export interface ProvisionRequest {
  readonly action: ProvisionAction;
  readonly unit?: string;
  readonly id?: string;
  readonly spec?: string;
  readonly name?: string;
  readonly requestId?: string;
  readonly registry?: string;
  readonly approvedBuilds?: readonly string[];
}

export interface ProvisionHandler {
  handle(request: ProvisionRequest): Promise<unknown> | unknown;
  affectedUnits?(request: ProvisionRequest): readonly string[];
}

const TARGET_CODE: Readonly<Record<ProvisionTarget, string>> = {
  unit: 'workbench/no-unit',
  id: 'workbench/no-id',
  spec: 'workbench/no-spec',
  name: 'workbench/no-name',
  requestId: 'workbench/no-request-id',
};

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};
}

function stringsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  return items.length === 0 ? undefined : items;
}

function requestOf(action: ProvisionAction, value: string): ProvisionRequest {
  if (action === 'update-dependency') return { action, id: value };
  if (action === 'install-bundle' || action === 'install-version') return { action, spec: value };
  if (action === 'remove-bundle') return { action, name: value };
  if (action === 'update-plugin' || action === 'uninstall-plugin') return { action, name: value };
  if (action === 'update-workbench' || action === 'migrate-workbench') return { action, name: value };
  if (action === 'dismiss-followup') return { action, id: value };
  if (action === 'cancel-install') return { action, requestId: value };
  return { action, unit: value };
}

export interface ProvisionRejected {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

export type ProvisionParsed =
  | { readonly ok: true; readonly request: ProvisionRequest }
  | ProvisionRejected;

export function parseProvisionBody(body: unknown): ProvisionParsed {
  const raw = asRecord(body);
  const action = raw.action;
  if (typeof action !== 'string' || !(PROVISION_ACTIONS as readonly string[]).includes(action)) {
    return {
      ok: false,
      code: 'workbench/bad-action',
      message: `不认识的 action：${String(action)}（可用：${PROVISION_ACTIONS.join(' / ')}）`,
    };
  }
  const wanted = action as ProvisionAction;
  const target = provisionTargetOf(wanted);
  const value = raw[target];
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, code: TARGET_CODE[target], message: `缺少 ${target}` };
  }
  if (wanted !== 'install-bundle' && wanted !== 'install-version') {
    return { ok: true, request: requestOf(wanted, value.trim()) };
  }

  const registry = typeof raw.registry === 'string' && raw.registry.trim() !== '' ? raw.registry.trim() : undefined;
  const approvedBuilds = stringsOf(raw.approvedBuilds);
  const requestId = typeof raw.requestId === 'string' && raw.requestId.trim() !== '' ? raw.requestId.trim() : undefined;
  return {
    ok: true,
    request: {
      ...requestOf(wanted, value.trim()),
      ...(registry === undefined ? {} : { registry }),
      ...(approvedBuilds === undefined ? {} : { approvedBuilds }),
      ...(requestId === undefined ? {} : { requestId }),
    },
  };
}
