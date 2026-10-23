function fragmentOf(hash: string): string {
  if (!hash.startsWith('#')) return '';
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return '';
  }
}

export function hashTargetsSection(anchor: string, hash: string): boolean {
  return anchor !== '' && fragmentOf(hash) === anchor;
}
