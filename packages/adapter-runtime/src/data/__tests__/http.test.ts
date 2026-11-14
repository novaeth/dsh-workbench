import { describe, expect, it } from 'vitest';
import { readHttp } from '../http.js';

function resp(status: number): Response {
  return new Response('{}', { status });
}

describe('readHttp · 状态码归一', () => {
  it('401 归 auth，403 归 permission-denied，其它 4xx 归 http', async () => {
    const one = await readHttp(
      { kind: 'http', url: 'https://a.example.com/x' },
      {},
      (async () => resp(401)) as typeof fetch,
    );
    expect(one).toMatchObject({ ok: false, error: { code: 'auth', status: 401 } });
    const two = await readHttp(
      { kind: 'http', url: 'https://a.example.com/x' },
      {},
      (async () => resp(403)) as typeof fetch,
    );
    expect(two).toMatchObject({ ok: false, error: { code: 'permission-denied', status: 403 } });
    const three = await readHttp(
      { kind: 'http', url: 'https://a.example.com/x' },
      {},
      (async () => resp(500)) as typeof fetch,
    );
    expect(three).toMatchObject({ ok: false, error: { code: 'http', status: 500 } });
  });
});
