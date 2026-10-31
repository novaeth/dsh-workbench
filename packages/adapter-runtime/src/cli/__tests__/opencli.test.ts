import { describe, expect, it } from 'vitest';
import { createFakeLogger, createFakeShell } from '@dsh-workbench/shared/testing';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';
import { createOpencli } from '../opencli.js';

async function expectDataError(promise: Promise<unknown>, code: string): Promise<WorkbenchDataError> {
  try {
    await promise;
    throw new Error(`预期抛 WorkbenchDataError(${code})，但它成功了`);
  } catch (error) {
    expect(error).toBeInstanceOf(WorkbenchDataError);
    const dataError = error as WorkbenchDataError;
    expect(dataError.code).toBe(code);
    return dataError;
  }
}

describe('createOpencli', () => {
  it('拼出 `opencli demo <args> --site-session persistent -f json`，参数逐个转义，窗口模式走环境变量', async () => {
    const fake = createFakeShell([{ stdout: '[]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    await opencli.json(['issues', '--team', "it's", '--project', 'a b']);

    const apostrophe = process.platform === 'win32' ? `'it''s'` : `'it'\\''s'`;
    expect(fake.commands()[0]).toBe(
      `'opencli' 'demo' 'issues' '--team' ${apostrophe} '--project' 'a b' --site-session persistent -f json`,
    );
    expect(fake.calls[0]?.env).toEqual({ OPENCLI_WINDOW: 'background' });
  });

  it('★ 每条命令都租一页持久站点会话：新版插件（navigateBefore:false + cookie jar）没有页就一律误报未登录', async () => {
    const fake = createFakeShell([{ stdout: '[]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'inventory' });

    await opencli.json(['envs', '--enterprise', '2']);

    expect(fake.commands()[0]).toContain(`--site-session persistent`);
  });

  it('★ 写命令退回一次性会话（ADR-0014 §2.2）：读靠共享的那扇标签，写不占它', async () => {
    const fake = createFakeShell([{ stdout: '[]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'inventory' });

    await opencli.json(['build', '--job_id', '1'], { session: 'ephemeral' });

    expect(fake.commands()[0]).not.toContain('--site-session');
  });

  it('解析 JSON 并带上时间戳', async () => {
    const fake = createFakeShell([{ stdout: '[{"code":2133}]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    const result = await opencli.json(['issues']);
    expect(result.value).toEqual([{ code: 2133 }]);
    expect(result.at).toBeGreaterThan(0);
  });

  it('不缓存：同 key 串行两次就是两次真实调用（数据必须实时）', async () => {
    const fake = createFakeShell([{ stdout: '[]' }, { stdout: '[{"code":1}]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    const first = await opencli.json(['issues'], { key: 'k' });
    const second = await opencli.json(['issues'], { key: 'k' });

    expect(first.value).toEqual([]);
    expect(second.value).toEqual([{ code: 1 }]);
    expect(fake.calls).toHaveLength(2);
  });

  it('同一 key 的并发请求合并成一次调用', async () => {
    const fake = createFakeShell([{ stdout: '[]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    const [a, b] = await Promise.all([
      opencli.json(['issues'], { key: 'same' }),
      opencli.json(['issues'], { key: 'same' }),
    ]);

    expect(fake.calls).toHaveLength(1);
    expect(a.value).toEqual(b.value);
  });

  it('不同 key 按**上限**并行（这里钉 2；默认值是 4，见 OPENCLI_MAX_CONCURRENT）', async () => {
    const fake = createFakeShell([{ stdout: '[]' }, { stdout: '[]' }, { stdout: '[]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo', maxConcurrent: 2 });

    await Promise.all([
      opencli.json(['a'], { key: 'a' }),
      opencli.json(['b'], { key: 'b' }),
      opencli.json(['c'], { key: 'c' }),
    ]);

    expect(fake.peak()).toBe(2);
    expect(fake.calls).toHaveLength(3);
  });

  it('超过上限就排队：多的那几个不会同时起飞', async () => {
    const fake = createFakeShell([{ stdout: '[]' }, { stdout: '[]' }, { stdout: '[]' }, { stdout: '[]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo', maxConcurrent: 2 });

    await Promise.all([
      opencli.json(['a'], { key: 'a' }),
      opencli.json(['b'], { key: 'b' }),
      opencli.json(['c'], { key: 'c' }),
      opencli.json(['d'], { key: 'd' }),
    ]);

    expect(fake.peak()).toBe(2);
    expect(fake.calls).toHaveLength(4);
  });

  it('登录态失效 → auth-required（平台无关的码），并把**登录页地址**带出来（来自信封的 help）', async () => {
    const envelope = [
      'ok: false',
      'error:',
      '  code: AUTH_REQUIRED',
      '  message: 未登录 Acme，请先在浏览器中完成登录',
      '  help: Please open Chrome or Chromium and log in to https://example-team.demo.net/login',
      '  exitCode: 4',
      '',
    ].join('\n');
    const fake = createFakeShell([
      { exitCode: 4, stderr: envelope },
      { exitCode: 4, stderr: envelope },
    ]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    const error = await expectDataError(opencli.json(['issues']), 'auth-required');
    expect(error.message).toContain('未登录 Acme');
    expect(error.helpUrl).toBe('https://example-team.demo.net/login');
  });

  it('★ auth-required 只重试一次：冷启动那一跳（页还没租到 → cookie jar 读不到）不该让面板说"未登录"', async () => {
    const envelope = [
      'ok: false',
      'error:',
      '  code: AUTH_REQUIRED',
      '  message: 未登录 Inventory，请先在浏览器中完成登录',
      '  exitCode: 77',
      '',
    ].join('\n');
    const fake = createFakeShell([{ exitCode: 77, stderr: envelope }, { stdout: '[{"id":22}]' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'inventory' });

    const result = await opencli.json(['envs']);

    expect(result.value).toEqual([{ id: 22 }]);
    expect(fake.calls).toHaveLength(2);
  });

  it('★ auth-required 两次都没成 → 照原样报（真的没登录时，多跑一次也还是那颗「去登录」）', async () => {
    const envelope = ['ok: false', 'error:', '  code: AUTH_REQUIRED', '  message: 未登录 Inventory', '  exitCode: 77', ''].join('\n');
    const fake = createFakeShell([
      { exitCode: 77, stderr: envelope },
      { exitCode: 77, stderr: envelope },
    ]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'inventory' });

    await expectDataError(opencli.json(['envs']), 'auth-required');
    expect(fake.calls).toHaveLength(2);
  });

  it('别的失败不重试（一次就是一次）', async () => {
    const fake = createFakeShell([{ exitCode: 1, stderr: 'boom' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'inventory' });

    await expectDataError(opencli.json(['envs']), 'cli-unclassified');
    expect(fake.calls).toHaveLength(1);
  });

  it('别的信封码 → cli-command-failed，带上 code 与 help（而不是猜）', async () => {
    const envelope = ['ok: false', 'error:', '  code: BROWSER_CONNECT', '  message: 连不上浏览器', '  help: start Chrome first', ''].join('\n');
    const fake = createFakeShell([{ exitCode: 3, stderr: envelope }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    const error = await expectDataError(opencli.json(['issues']), 'cli-command-failed');
    expect(error.message).toContain('BROWSER_CONNECT');
    expect(error.hint).toBe('start Chrome first');
  });

  it('**没有信封** → cli-unclassified（单独一档），且不谎报原因（哪怕文案里有"请先登录"）', async () => {
    const fake = createFakeShell([{ exitCode: 2, stderr: 'error: 请先登录后再执行\nsomething broke' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    const error = await expectDataError(opencli.json(['issues']), 'cli-unclassified');
    expect(error.code).toBe('cli-unclassified');
    expect(error.helpUrl).toBeUndefined();
    expect(error.detail).toContain('something broke');
    expect(error.hint).toContain('更新插件');
  });

  it('输出不是 JSON → cli-bad-output', async () => {
    const fake = createFakeShell([{ stdout: '完全不认识的输出' }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo' });

    await expectDataError(opencli.json(['issues']), 'cli-bad-output');
  });

  it('超时 → cli-timeout', async () => {
    const fake = createFakeShell([{ timedOut: true }]);
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo', timeoutMs: 5000 });

    const error = await expectDataError(opencli.json(['issues']), 'cli-timeout');
    expect(error.message).toContain('5 秒');
  });

  it('执行缝故障 → cli-exec-failed，并带安装提示', async () => {
    const fake = createFakeShell([{ failWith: new Error('spawn opencli ENOENT') }]);
    const { logger } = createFakeLogger();
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo', logger });

    const error = await expectDataError(opencli.json(['issues']), 'cli-exec-failed');
    expect(error.hint).toContain('PATH');
  });

  it('失败会留下一条 warn（诊断用，不上抛给用户）', async () => {
    const fake = createFakeShell([{ exitCode: 1, stderr: 'boom' }]);
    const { logger, warnings } = createFakeLogger();
    const opencli = createOpencli({ shell: fake.shell, plugin: 'demo', logger });

    await expectDataError(opencli.json(['issues']), 'cli-unclassified');
    expect(warnings.join()).toContain('opencli 调用失败');
  });
});
