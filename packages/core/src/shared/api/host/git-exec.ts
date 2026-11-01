import { promptlessGitEnvOf, promptlessProcessEnvOf } from '@dsh-workbench/shared/host';

export function gitNoPromptEnv(platform: NodeJS.Platform = process.platform): Readonly<Record<string, string>> {
  return promptlessGitEnvOf(platform);
}

export function gitNoPromptProcessEnv(
  parent: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  return promptlessProcessEnvOf(parent, platform);
}

export function withoutAskpassNoise(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/unable to read askpass response/i.test(line))
    .join('\n')
    .trim();
}
