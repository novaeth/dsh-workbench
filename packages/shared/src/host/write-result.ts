export function writeResultForClient(value: unknown, code: string): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const box = value as Record<string, unknown>;
  const existing = box['error'];
  if (box['ok'] !== false || (typeof existing === 'object' && existing !== null)) return value;
  const text = box['text'];
  const detail = box['detail'];
  return {
    ok: false,
    error: {
      code,
      message: typeof text === 'string' && text.trim() !== '' ? text : '这一步没有成功，也没说为什么',
      ...(typeof detail === 'string' ? { detail } : {}),
    },
  };
}
