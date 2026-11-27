export function diagTextOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function firstLineOfText(text: string, limit = 300): string {
  const line = text.split('\n').map((one) => one.trim()).find(Boolean) ?? '';
  return line.length <= limit ? line : `${line.slice(0, limit)}…`;
}
