import { describe, expect, it, vi } from 'vitest';
import { RECORD_ARM_SCRIPT, RECORD_KEEP_KEY } from './diy-record-scripts';
import { buttonOf, flush, makeHarness, readPage, runScript, startOf } from '../__tests__/record-page-harness';

describe('请求发出的那一刻先记账（页面一跳走也不丢入参）', () => {
  it('★★★ 假 fetch 永不 resolve：发送那一刻就已经有一条（方法 / URL / 入参全在，status 0）', async () => {
    const harness = makeHarness();
    harness.win.fetch = () => new Promise<never>(() => {});
    runScript(RECORD_ARM_SCRIPT, harness);
    startOf(harness).onclick?.();
    void harness.win.fetch('/api/publish', { method: 'POST', body: '{"title":"发布 v1.2"}' });
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/publish',
      body: '{"title":"发布 v1.2"}',
      status: 0,
      ct: '',
      response: '',
    });
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['calls']).toEqual(calls);
  });

  it('★★ 回包回来补全的是同一条（不新增行）', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    startOf(harness).onclick?.();
    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"title":"发布 v1.2"}' });
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.['status']).toBe(200);
    expect(calls[0]?.['ct']).toBe('application/json');
    expect(calls[0]?.['response']).toBe('{"ok":true}');
    expect(calls[0]?.['body']).toBe('{"title":"发布 v1.2"}');
  });

  it('★ XHR：send 那一刻先记，loadend 补全同一条', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    startOf(harness).onclick?.();

    const xhr = new harness.XMLHttpRequest();
    xhr.open('POST', '/api/publish');
    xhr.send('{"title":"x"}');
    const sent = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ method: 'POST', url: '/api/publish', body: '{"title":"x"}', status: 0, response: '' });

    xhr.status = 201;
    xhr.responseText = '{"ok":true}';
    xhr.fire('loadend');
    const done = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(done).toHaveLength(1);
    expect(done[0]?.['status']).toBe(201);
    expect(done[0]?.['response']).toBe('{"ok":true}');
  });

  it('★ 失败的 fetch 也只在发出那一刻记一条，回包那一拍补上状态', async () => {
    const harness = makeHarness();
    harness.win.fetch = () => Promise.reject(new Error('net down'));
    runScript(RECORD_ARM_SCRIPT, harness);
    startOf(harness).onclick?.();
    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"a":1}' }).catch(() => undefined);
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.['status']).toBe(0);
    expect(calls[0]?.['ct']).toBe('fetch-error');
    expect(calls[0]?.['body']).toBe('{"a":1}');
  });

  it('★ sendBeacon 只记一条（它本来就没有回包）', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    startOf(harness).onclick?.();
    harness.navigator.sendBeacon?.('/api/beacon', '{"a":1}');
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/beacon', body: '{"a":1}', status: 0, ct: '', response: '' });
  });
});

describe('门铃（页面内计数 + 唤醒）：零网络请求，宿主那条 eval 就等它', () => {
  const armed = (): ReturnType<typeof makeHarness> => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    return harness;
  };
  const winOf = (harness: ReturnType<typeof makeHarness>): Record<string, unknown> =>
    harness.win as unknown as Record<string, unknown>;

  it('★ 三处各把 beatN 加一、beatKind 分别是 start / shot / stop', async () => {
    const harness = armed();
    startOf(harness).onclick?.();
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['beatN']).toBe(1);
    const first = await readPage(harness);
    expect(first['beat']).toBe(true);
    expect(first['beatKind']).toBe('start');

    buttonOf(harness, '拍一张当前页面的截图').onclick?.();
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['beatN']).toBe(2);
    const second = await readPage(harness);
    expect(second['beatKind']).toBe('shot');

    buttonOf(harness, '结束录制').onclick?.();
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['beatN']).toBe(3);
    const third = await readPage(harness);
    expect(third['beatKind']).toBe('stop');
  });

  it('★★ 一条 XHR 都不再发（上一轮那条判据的反转）', async () => {
    const harness = armed();
    startOf(harness).onclick?.();
    buttonOf(harness, '拍一张当前页面的截图').onclick?.();
    buttonOf(harness, '结束录制').onclick?.();
    await readPage(harness);

    expect(harness.xhrs).toEqual([]);
  });

  it('★★ 唤醒：注册上的 window.__dshBeatWake 被调一次、随即清空', () => {
    const harness = armed();
    const win = winOf(harness);
    let woke = 0;
    win['__dshBeatWake'] = () => {
      woke += 1;
    };

    startOf(harness).onclick?.();
    expect(woke).toBe(1);
    expect(win['__dshBeatWake']).toBeNull();
  });

  it('★★ 读那一拍：计数早变过就立刻回 beat:true；没变就等唤醒', async () => {
    const harness = armed();
    startOf(harness).onclick?.();
    const immediate = await readPage(harness);
    expect(immediate['beat']).toBe(true);
    expect(immediate['beatKind']).toBe('start');

    const waiting = readPage(harness);
    buttonOf(harness, '拍一张当前页面的截图').onclick?.();
    const woken = await waiting;
    expect(woken['beat']).toBe(true);
    expect(woken['beatKind']).toBe('shot');
  });

  it('★★ 等满 3 秒没人按 ⇒ beat:false（假定时器）', async () => {
    vi.useFakeTimers();
    try {
      const harness = armed();
      startOf(harness).onclick?.();
      await readPage(harness);

      const pending = readPage(harness);
      await vi.advanceTimersByTimeAsync(3000);
      const late = await pending;
      expect(late['beat']).toBe(false);
      expect(late['beatKind']).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 页面上没有 ARM 状态（刚导航过）⇒ 立刻回 beat:false，不干等、不抛', async () => {
    vi.useFakeTimers();
    try {
      const read = await readPage(makeHarness());
      expect(read['ok']).toBe(false);
      expect(read['beat']).toBe(false);
      expect(read['beatKind']).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
