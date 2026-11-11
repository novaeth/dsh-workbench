import type { DshToolOutputDefinition } from '@dsh-workbench/shared';

type Rendered = ReturnType<DshToolOutputDefinition['render']>;

const RENDER = (_args: unknown, value: unknown): Rendered => {
  const payload = value as { text?: unknown } | null;
  return [{ type: 'text', text: typeof payload?.text === 'string' ? payload.text : JSON.stringify(value) }];
};

export function textOutput(extra: Record<string, unknown> = {}): DshToolOutputDefinition {
  return {
    schema: {
      type: 'object',
      properties: { text: { type: 'string' }, ...extra },
      additionalProperties: true,
    },
    render: RENDER,
  };
}

export const OUTPUT = textOutput();
