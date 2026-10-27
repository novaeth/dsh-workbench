function baseName(value: string): string {
  const parts = value.trim().split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

function isOpencli(name: string): boolean {
  return name === 'opencli' || name === 'opencli.cmd' || name === 'opencli.exe';
}

export function commandNamesMatch(declared: string, resolved: string): boolean {
  const left = baseName(declared);
  const right = baseName(resolved);
  if (left === '' || right === '') return false;
  return left === right || (isOpencli(left) && isOpencli(right));
}
