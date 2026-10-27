import { describe, expect, it } from 'vitest';
import { gitNoPromptPrefix, withoutAskpassNoise } from '../git-exec';

describe('自己发的 git 命令：不许问人', () => {
  it('改掉 IDE 塞进来的 GIT_ASKPASS，并关掉终端提示与 SSH 交互', () => {
    const prefix = gitNoPromptPrefix();
    expect(prefix.startsWith("'env' ")).toBe(true);
    expect(prefix).toContain('GIT_TERMINAL_PROMPT=0');
    expect(prefix).toContain('GIT_ASKPASS=/usr/bin/false');
    expect(prefix).toContain('SSH_ASKPASS_REQUIRE=never');
    expect(prefix).toContain('GCM_INTERACTIVE=never');
    expect(prefix).toContain('BatchMode=yes');
  });

  it('不关凭据助手：https 免密正是靠它', () => {
    expect(gitNoPromptPrefix()).not.toContain('credential.helper');
  });

  it('askpass 那句抱怨不进给人看的细节', () => {
    expect(
      withoutAskpassNoise("error: unable to read askpass response from '/usr/bin/false'\nfatal: could not read Username\n"),
    ).toBe('fatal: could not read Username');
  });
});
