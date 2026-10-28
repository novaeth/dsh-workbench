function envValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? { ok: false } : { ok: true, value };
}

export function npmRegistryOf(
  source: { readonly registryEnv?: string; readonly registryDefault?: string },
  env: Readonly<Record<string, string | undefined>>,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly env: string } {
  const name = source.registryEnv ?? '';
  if (name !== '') {
    const fromEnv = envValue(env, name);
    if (fromEnv.ok) return fromEnv;
  }
  const fallback = source.registryDefault?.trim();
  if (fallback === undefined || fallback === '') return { ok: false, env: name };
  return { ok: true, value: fallback };
}
