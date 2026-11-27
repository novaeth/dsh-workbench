import { textOutput } from '../tool-output';

export const PROGRESS_OUTPUT = textOutput({
  step: { type: 'string' },
  index: { type: 'number' },
  total: { type: 'number' },
  remaining: { type: 'number' },
  done: { type: 'boolean' },
  restarted: { type: 'boolean' },
  baseline: { type: 'object', additionalProperties: true },
});
