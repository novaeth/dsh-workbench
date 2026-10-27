import type { DshToolRunContext } from '../api/dsh.js';

export function sessionWorkspace(exec: DshToolRunContext | undefined): string | null {
  const cwd = exec?.agent?.session?.header?.cwd;
  return typeof cwd === 'string' && cwd.trim() !== '' ? cwd.trim() : null;
}

export function sessionIdOf(exec: DshToolRunContext | undefined): string | null {
  const id = exec?.agent?.session?.id;
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null;
}

export function textOutput(text: string): Array<Record<string, unknown>> {
  return [{ type: 'text', text }];
}

export function textRender(_args: unknown, value: unknown): Array<Record<string, unknown>> {
  const text = (value as { text?: unknown } | null)?.text;
  return textOutput(typeof text === 'string' ? text : JSON.stringify(value));
}

export const TEXT_OUTPUT = { schema: { type: 'object', properties: {}, additionalProperties: true }, render: textRender };

export function jsonText(value: unknown): string {
  return JSON.stringify(value);
}
