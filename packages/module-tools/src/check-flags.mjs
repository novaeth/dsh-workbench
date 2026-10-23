export function flagsOf() {
  try {
    const parsed = JSON.parse(process.env.DSH_WB_ONLY_ARGS ?? '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function flagValue(flags, flag) {
  const at = flags.indexOf(flag);
  if (at === -1) return undefined;
  const value = flags[at + 1];
  return value === undefined || value.startsWith('--') ? undefined : value;
}
