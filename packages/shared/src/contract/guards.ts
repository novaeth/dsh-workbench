export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
