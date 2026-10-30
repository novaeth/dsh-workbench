import { describe, expect, it } from 'vitest';
import { gitNoPromptEnv, withoutAskpassNoise } from '../git-exec';

describe('自己发的 git 命令：不许问人', () => {
  it('★ POSIX：改掉 IDE 塞进来的 GIT_ASKPASS，并关掉终端提示与 SSH 交互', () => {
    const env = gitNoPromptEnv('darwin');

    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GIT_ASKPASS).toBe('/usr/bin/false');
    expect(env.SSH_ASKPASS_REQUIRE).toBe('never');
    expect(env.GCM_INTERACTIVE).toBe('never');
    expect(env.GIT_SSH_COMMAND).toContain('BatchMode=yes');
  });

  it('★ Windows：不给 ASKPASS 指 POSIX 路径（那台机器上没有 /usr/bin/false），终端提示与 SSH 交互照样关掉', () => {
    const env = gitNoPromptEnv('win32');

    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.SSH_ASKPASS_REQUIRE).toBe('never');
    expect(env.GCM_INTERACTIVE).toBe('never');
    expect(env).not.toHaveProperty('GIT_ASKPASS');
    expect(env).not.toHaveProperty('SSH_ASKPASS');
  });

  it('不关凭据助手：https 免密正是靠它', () => {
    expect(Object.keys(gitNoPromptEnv('darwin'))).not.toContain('credential.helper');
    expect(Object.keys(gitNoPromptEnv('win32'))).not.toContain('credential.helper');
  });

  it('askpass 那句抱怨不进给人看的细节', () => {
    expect(
      withoutAskpassNoise("error: unable to read askpass response from '/usr/bin/false'\nfatal: could not read Username\n"),
    ).toBe('fatal: could not read Username');
  });
});
