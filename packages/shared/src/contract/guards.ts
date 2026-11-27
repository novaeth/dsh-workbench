export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

export function outsideKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

export function listOf(keys: readonly string[]): string {
  return keys.map((key) => JSON.stringify(key)).join(' / ');
}

export function pathSegmentsProblem(value: unknown, label: string): string | undefined {
  const raw = text(value);
  if (raw === '') return undefined;
  return raw.split('.').some((segment) => segment.trim() === '') ? `${label} 里不许有空段` : undefined;
}
