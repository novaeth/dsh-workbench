import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { RequestRecipe } from '@dsh-workbench/shared/host';
import { createDataReader } from '../index.js';
import { channelCallOf, channelUrlOf, wireBodyOf } from '../channel.js';

const COOKIE: RequestRecipe = {
  origin: 'https://x.example.com',
  request: { method: 'GET', path: '/api/balance' },
  response: { kind: 'json', path: 'data' },
};

const CSRF: RequestRecipe = {
  origin: 'https://git.example.com',
  auth: { source: { kind: 'cookieValue', name: 'XSRF-TOKEN' }, place: { in: 'header', name: 'X-XSRF-TOKEN' } },
  request: { method: 'POST', path: '/api/issues', contentType: 'form', body: { title: 't' } },
  response: { kind: 'json' },
};

const BEARER: RequestRecipe = {
  origin: 'https://x.example.com',
  auth: {
    source: { kind: 'endpoint', url: '/api/auth/refresh', method: 'POST', path: 'data.token' },
    place: { in: 'header', name: 'authorization', prefix: 'Bearer ' },
  },
  request: { method: 'GET', path: '/api/me' },
};

function readerOf(
  plan: Parameters<typeof createFakeShell>[0],
  channel = true,
  installed = true,
) {
  const fake = createFakeShell(plan);
  return {
    reader: createDataReader({ shell: fake.shell, channel, channelInstalled: () => installed }),
    fake,
  };
}

function installed(): { stdout: string } {
  return { stdout: '' };
}

describe('channel · 哪些配方走通道', () => {
  it('cookie（默认）走 fetch', () => {
    const call = channelCallOf(COOKIE, {}, 'opencli');
    expect(call?.argv.slice(0, 5)).toEqual(['opencli', 'workbench', 'fetch', '--api', '1']);
    expect(call?.argv).toContain('--jar');
    expect(call?.argv).not.toContain('--cookie');
    expect(call?.argv).not.toContain('--method');
  });

  it('cookieValue 带上 --cookie 与 --place', () => {
    const call = channelCallOf(CSRF, {}, 'opencli');
    expect(call?.argv).toContain('--cookie');
    expect(call?.argv).toContain('XSRF-TOKEN');
    expect(call?.argv).toContain('--place');
    expect(call?.argv).toContain('header:X-XSRF-TOKEN');
    expect(call?.argv).toContain('send');
    expect(call?.argv).toContain('--method');
    expect(call?.argv).toContain('POST');
  });

  it('endpoint / meta / global / storage / none 一律不走通道', () => {
    expect(channelCallOf(BEARER, {}, 'opencli')).toBeUndefined();
    expect(
      channelCallOf({ ...COOKIE, auth: { source: { kind: 'meta', name: 'csrf' }, place: { in: 'header', name: 'x' } } }, {}, 'opencli'),
    ).toBeUndefined();
    expect(
      channelCallOf({ ...COOKIE, auth: { source: { kind: 'global', path: 'st.t' }, place: { in: 'header', name: 'x' } } }, {}, 'opencli'),
    ).toBeUndefined();
    expect(channelCallOf({ ...COOKIE, auth: { kind: 'none' } }, {}, 'opencli')).toBeUndefined();
  });

  it('URL 与 body 的编码在宿主侧算好，argv 里没有凭据值', () => {
    expect(channelUrlOf(COOKIE, { query: { limit: '5' } })).toBe('https://x.example.com/api/balance?limit=5');
    expect(wireBodyOf(CSRF, {})).toEqual({ contentType: 'form', body: 'title=t' });
    expect(wireBodyOf({ ...COOKIE, request: { method: 'POST', path: '/a', body: { a: 1 } } }, {})).toEqual({
      contentType: 'json',
      body: '{"a":1}',
    });
    const call = channelCallOf(CSRF, {}, 'opencli');
    expect(call?.argv.join(' ')).not.toContain('XSRF-TOKEN=');
  });
});

describe('channel · 端口怎么用', () => {
  it('通道通了就不发 eval；信封解包成 data', async () => {
    const { reader, fake } = readerOf([
      installed(),
      { stdout: JSON.stringify({ ok: true, data: { data: { balance: 3 } } }) },
    ], true, false);
    const result = await reader.request(COOKIE);

    expect(result).toEqual({ ok: true, data: { balance: 3 } });
    expect(fake.commands()).toHaveLength(2);
    const install = fake.commands()[0] ?? '';
    expect(install).toContain('cp -R');
    expect(install).toContain('ln -s');
    expect(install).toContain('plugin uninstall');
    expect(install).toContain('plugin install');
    expect(install.indexOf('ln -s')).toBeLessThan(install.indexOf('plugin install'));
    expect(fake.commands()[1]).toContain("'workbench' 'fetch'");
    expect(fake.commands().join(' ')).not.toContain("'eval'");
  });

  it('装一次就够：第二个配方不再装', async () => {
    const { reader, fake } = readerOf(
      [
        installed(),
        { stdout: JSON.stringify({ ok: true, data: { data: 1 } }) },
        { stdout: JSON.stringify({ ok: true, data: { data: 2 } }) },
      ],
      true,
      false,
    );
    await reader.request(COOKIE);
    await reader.request(COOKIE);

    expect(fake.commands().filter((one) => one.includes('plugin install'))).toHaveLength(1);
  });

  it('submit 走 send，带 --method 与表单体', async () => {
    const { reader, fake } = readerOf([installed(), { stdout: JSON.stringify({ ok: true, data: { id: 9 } }) }], true, false);
    const result = await reader.submit(CSRF);

    expect(result).toEqual({ ok: true, data: { id: 9 } });
    expect(fake.commands()[1]).toContain("'send'");
    expect(fake.commands()[1]).toContain("'--content-type' 'form'");
    expect(fake.commands()[1]).toContain("'title=t'");
  });

  it('通道跑不起来 → 回落页面脚本，且只回落一次', async () => {
    const { reader, fake } = readerOf([
      installed(),
      { exitCode: 1, stderr: 'command not found' },
      { stdout: JSON.stringify({ ok: true, data: { viaEval: true } }) },
    ], true, false);
    const result = await reader.request(COOKIE);

    expect(result).toEqual({ ok: true, data: { viaEval: true } });
    expect(fake.commands()[2]).toContain("'eval'");
  });

  it('回落之后一直走页面脚本，不再试通道', async () => {
    const { reader, fake } = readerOf([
      installed(),
      { exitCode: 1 },
      { stdout: JSON.stringify({ ok: true, data: 1 }) },
      { stdout: JSON.stringify({ ok: true, data: 2 }) },
    ], true, false);
    await reader.request(COOKIE);
    await reader.request(COOKIE);

    expect(fake.commands().filter((one) => one.includes("'fetch'"))).toHaveLength(1);
  });

  it('信封回了就不再回落：auth / http 按页面码映射', async () => {
    const { reader, fake } = readerOf([
      installed(),
      { stdout: JSON.stringify({ ok: false, code: 'not-logged-in' }) },
    ], true, false);
    const result = await reader.request({ ...COOKIE, loginUrl: 'https://x.example.com/login' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth');
      expect(result.error.helpUrl).toBe('https://x.example.com/login');
      expect(result.error.pageCode).toBe('not-logged-in');
    }
    expect(fake.commands().join(' ')).not.toContain("'eval'");
  });

  it('通道给 http-503 → http + status', async () => {
    const { reader } = readerOf([installed(), { stdout: JSON.stringify({ ok: false, code: 'http-503', message: '炸' }) }], true, false);
    const result = await reader.request(COOKIE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('http');
      expect(result.error.status).toBe(503);
    }
  });

  it('text 响应原样回字符串', async () => {
    const { reader } = readerOf([installed(), { stdout: JSON.stringify({ ok: true, text: '<rss />' }) }], true, false);
    const result = await reader.request({ ...COOKIE, response: { kind: 'text' } });
    expect(result).toEqual({ ok: true, data: '<rss />' });
  });

  it('通道没装好（装不上）→ 直接走页面脚本', async () => {
    const { reader, fake } = readerOf([
      { exitCode: 1 },
      { stdout: JSON.stringify({ ok: true, data: { viaEval: true } }) },
    ], true, false);
    const result = await reader.request(COOKIE);

    expect(result).toEqual({ ok: true, data: { viaEval: true } });
    expect(fake.commands().filter((one) => one.includes('plugin install'))).toHaveLength(1);
    expect(fake.commands()[1]).toContain("'eval'");
  });

  it('channel: false 时一条通道命令都不发', async () => {
    const { reader, fake } = readerOf([{ stdout: JSON.stringify({ ok: true, data: 1 }) }], false, false);
    await reader.request(COOKIE);

    expect(fake.commands()).toHaveLength(1);
    expect(fake.commands()[0]).toContain("'eval'");
  });
});
