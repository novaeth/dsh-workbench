export function hostEnvOf(
  env: Readonly<Record<string, string | undefined>> | undefined,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

export function definedEnvOf(
  env: Readonly<Record<string, string | undefined>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
