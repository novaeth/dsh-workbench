const SCRIPT_EXTENSION = /\.(cmd|exe|bat)$/i;

function baseName(value: string): string {
  const parts = value.trim().split(/[\\/]/);
  return (parts[parts.length - 1] ?? '').replace(SCRIPT_EXTENSION, '');
}

export function commandNamesMatch(declared: string, resolved: string): boolean {
  const left = baseName(declared);
  const right = baseName(resolved);
  if (left === '' || right === '') return false;
  return left === right;
}
