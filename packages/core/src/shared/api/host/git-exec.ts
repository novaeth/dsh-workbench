export function gitNoPromptEnv(platform: NodeJS.Platform = process.platform): Readonly<Record<string, string>> {
  const shared = {
    GIT_TERMINAL_PROMPT: '0',
    SSH_ASKPASS_REQUIRE: 'never',
    GCM_INTERACTIVE: 'never',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new',
  };
  if (platform === 'win32') return shared;
  return { ...shared, GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false' };
}

export function gitNoPromptProcessEnv(
  parent: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...parent, ...gitNoPromptEnv(platform) };
  if (platform === 'win32') {
    delete env.GIT_ASKPASS;
    delete env.SSH_ASKPASS;
  }
  return env;
}

export function withoutAskpassNoise(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/unable to read askpass response/i.test(line))
    .join('\n')
    .trim();
}
