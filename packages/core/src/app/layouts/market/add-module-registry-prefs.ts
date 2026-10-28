import {
  STORAGE_KEY_MARKET_REGISTRY,
  STORAGE_KEY_MARKET_REGISTRY_CUSTOM,
  readText,
  writeText,
} from '@dsh-workbench/shared';
import {
  customRegistryAllowed,
  type RegistryChoice,
  type RegistryKind,
  type RegistryOption,
} from './add-module-text';

export interface RegistryPrefs {
  readonly choice: RegistryChoice;
  readonly custom: string;
}

export const DEFAULT_REGISTRY_CHOICE: RegistryChoice = { kind: 'default', value: '' };

function isRegistryKind(value: unknown): value is RegistryKind {
  return value === 'default' || value === 'url' || value === 'custom';
}

export function parseRegistryChoice(raw: string | null): RegistryChoice {
  if (raw === null) return DEFAULT_REGISTRY_CHOICE;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_REGISTRY_CHOICE;
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_REGISTRY_CHOICE;
  const record = value as { readonly kind?: unknown; readonly value?: unknown };
  if (!isRegistryKind(record.kind)) return DEFAULT_REGISTRY_CHOICE;
  if (record.kind === 'default') return DEFAULT_REGISTRY_CHOICE;
  if (record.kind === 'custom') return { kind: 'custom', value: '' };
  if (typeof record.value !== 'string' || !customRegistryAllowed(record.value)) {
    return DEFAULT_REGISTRY_CHOICE;
  }
  return { kind: 'url', value: record.value.trim() };
}

export function readRegistryPrefs(): RegistryPrefs {
  const custom = readText(STORAGE_KEY_MARKET_REGISTRY_CUSTOM);
  return {
    choice: parseRegistryChoice(readText(STORAGE_KEY_MARKET_REGISTRY)),
    custom: custom === null ? '' : custom.trim(),
  };
}

export function writeRegistryChoice(choice: RegistryChoice): void {
  if (choice.kind === 'custom') {
    writeText(STORAGE_KEY_MARKET_REGISTRY, JSON.stringify({ kind: 'custom', value: '' }));
    return;
  }
  if (choice.kind === 'url' && customRegistryAllowed(choice.value)) {
    writeText(STORAGE_KEY_MARKET_REGISTRY, JSON.stringify({ kind: 'url', value: choice.value.trim() }));
    return;
  }
  writeText(STORAGE_KEY_MARKET_REGISTRY, JSON.stringify(DEFAULT_REGISTRY_CHOICE));
}

export function writeRegistryCustom(value: string): void {
  const text = value.trim();
  writeText(STORAGE_KEY_MARKET_REGISTRY_CUSTOM, text === '' ? null : text);
}

export function reconcileRegistryChoice(
  choice: RegistryChoice,
  choices: readonly RegistryOption[],
): RegistryChoice {
  if (choice.kind !== 'url') return choice;
  return choices.some(
    (option) => option.choice.kind === 'url' && option.choice.value === choice.value,
  )
    ? choice
    : DEFAULT_REGISTRY_CHOICE;
}
