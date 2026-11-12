export function authorOf(manifest: Record<string, unknown>): string {
  const author = manifest['author'];
  if (typeof author === 'string') return author.trim();
  if (author === null || typeof author !== 'object') return '';
  const record = author as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
  if (name === '') return '';
  const email = typeof record['email'] === 'string' ? record['email'].trim() : '';
  return email === '' ? name : `${name} <${email}>`;
}
