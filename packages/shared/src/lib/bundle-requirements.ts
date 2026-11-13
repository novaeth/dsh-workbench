export function requirementsText(requirements: Readonly<Record<string, string>> | undefined): string | undefined {
  const parts = Object.entries(requirements ?? {})
    .filter(([, range]) => range.trim() !== '')
    .map(([name, range]) => `${name === 'engines.dsh' ? 'dsh' : name} ${range}`);
  return parts.length === 0 ? undefined : parts.join('、');
}
