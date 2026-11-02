export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

export function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
