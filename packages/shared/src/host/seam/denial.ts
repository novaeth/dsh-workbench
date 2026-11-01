const PATTERNS: readonly RegExp[] = [
  /npm (?:error|ERR!) path (.+)$/m,
  /(?:EPERM|EACCES):[^,\n]*, (?:open|unlink|mkdir|scandir|rename|access|stat|lstat|read|write|copyfile|rmdir|opendir|utimes|chmod|chown) '([^']+)'/i,
  /(?:Operation not permitted|Permission denied)[^\n]*?'([^']+)'/i,
  /fatal: could not create work tree dir '([^']+)'/i,
  /mkdir: cannot create directory '([^']+)'/i,
  /cannot (?:create|mkdir) (?:directory )?'([^']+)'/i,
  /(?:Operation not permitted|Permission denied):\s*([^\s'\n]+)/i,
];

function firstMatch(text: string): string | undefined {
  for (const pattern of PATTERNS) {
    const found = pattern.exec(text);
    const value = found?.[1]?.trim();
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

export function deniedPathOf(stderr: string, stdout = ''): string | undefined {
  return firstMatch(stderr) ?? firstMatch(stdout);
}

export function sandboxDeniedOf(facts: { readonly denied?: boolean | undefined } | undefined): boolean {
  return facts?.denied === true;
}
