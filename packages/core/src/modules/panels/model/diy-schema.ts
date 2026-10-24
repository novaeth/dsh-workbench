export const UNIT_PROP = { type: 'string', description: '工作区里的 unit（不填 = 这里只有一个就用它）。' };
export const SESSION_PROP = { type: 'string', description: '会话名（默认 workbench，一般不用填）。' };

export function pageSchema(
  extra: Record<string, unknown> = {},
  required: readonly string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    properties: { unit: UNIT_PROP, ...extra, session: SESSION_PROP },
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: false,
  };
}
