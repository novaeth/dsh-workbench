import { quoteShellArg } from '@dsh-workbench/shared/host';

const NO_PROMPT_ENV: readonly string[] = [
  'GIT_TERMINAL_PROMPT=0',
  'GIT_ASKPASS=/usr/bin/false',
  'SSH_ASKPASS=/usr/bin/false',
  'SSH_ASKPASS_REQUIRE=never',
  'GCM_INTERACTIVE=never',
  'GIT_SSH_COMMAND=ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new',
];

export function gitNoPromptPrefix(): string {
  return [quoteShellArg('env'), ...NO_PROMPT_ENV.map((one) => quoteShellArg(one))].join(' ');
}

export function withoutAskpassNoise(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/unable to read askpass response/i.test(line))
    .join('\n')
    .trim();
}
