import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordExpect } from '@dsh-workbench/shared/host';
import { captureFileOf } from '../diy-record';
import {
  bodyMissingOf,
  filterTextOf,
  listRowsOf,
  probeCommandOf,
  recordPageOf,
  recordRefusalText,
  recordTalkOf,
  renderRecordDetail,
  renderRecordRead,
  type RecordReadFacts,
} from '../diy-record-text';
import { RECORD_ARM_SCRIPT, RECORD_READ_SCRIPT, RECORD_STOP_SCRIPT } from '../diy-record-scripts';
import { GET, POST, URL, call } from '../../__tests__/record-fixtures';

const facts = (over: Partial<RecordReadFacts> = {}): RecordReadFacts => ({
  phase: 'finished',
  armed: true,
  hookCaught: 0,
  rows: [],
  merged: over.rows?.length ?? 0,
  capturedLines: 0,
  capturedInSegment: 0,
  capturedOutside: 0,
  capturedTotalLines: 0,
  capturedTruncated: false,
  capturedTailLimit: 20000,
  dropped: 0,
  nav: false,
  filter: '',
  captureRound: 'ok',
  ...over,
});

describe('录制交接：清单一条都不删、原文按 key 取（纯函数）', () => {
  it('★ 没给 expect：⭐ 落在"像写的那几条"（非 GET 或带 body），但清单一条都不删', () => {
    const rows = listRowsOf([GET(), POST()], null);
    expect(rows).toHaveLength(2);
    expect(rows.map((one) => one.marked)).toEqual([true, false]);
    expect(rows.map((one) => one.method)).toEqual(['POST', 'GET']);
    expect(rows.map((one) => one.likelyWrite)).toEqual([true, false]);
    expect(listRowsOf([call('GET', `${URL}/api/x`, 'q=1')], null)[0]?.likelyWrite).toBe(true);
  });

  it('★★ 给了 expect：只用来标 ⭐，**一条都不筛掉**（用户要的"任意请求都在清单里"）', () => {
    const rows = listRowsOf([GET(), POST()], { method: 'POST', urlContains: '/api/publish' });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.method).toBe('POST');
    expect(rows[0]?.marked).toBe(true);
    expect(rows[1]?.marked).toBe(false);
    const none = listRowsOf([POST()], { method: 'DELETE', urlContains: '/api/publish' });
    expect(none).toHaveLength(1);
    expect(none[0]?.marked).toBe(false);
  });

  it('★ 清单每行带序号 / key / 有没有入参出参（详情那一拍靠它定位）', () => {
    const rows = listRowsOf([call('POST', `${URL}/api/publish`, '{"a":1}', 'capture', 'POST x#2')], null);
    expect(rows[0]?.index).toBe(0);
    expect(rows[0]?.key).toBe('POST x#2');
    expect(rows[0]?.hasRequest).toBe(true);
    expect(rows[0]?.hasResponse).toBe(true);
  });

  it('★★ 清单每行把 detail 要的两样直接摆出来：key 原样 + at（没有 key 的钩子行说明白）', () => {
    const keyed = renderRecordRead(
      facts({
        rows: listRowsOf(
          [call('POST', `${URL}/api/publish`, '{"a":1}', 'capture', 'POST inventory.example.com/env/api/publish#2')],
          null,
        ),
      }),
    );
    expect(keyed).toContain('· [0] ⭐ POST inventory.example.com/env/api/publish#2（捕获 · 入参 有 · 出参 11 B · at 1）');

    const hookOnly = renderRecordRead(facts({ rows: listRowsOf([POST()], null) }));
    expect(hookOnly).toContain(`· [0] ⭐ POST ${URL}/api/publish（钩子 · 入参 有 · 出参 11 B · 无 key）`);
  });

  it('★ 原文只认第一条带 body 的；一条都没有就回空串（空 = 别硬写进 design.json）', () => {
    const text = probeCommandOf([POST()]);
    expect(text.startsWith('POST https://inventory.example.com/env/api/publish')).toBe(true);
    expect(text).toContain('{"env":"test"}');
    expect(probeCommandOf([])).toBe('');
    expect(probeCommandOf([call('POST', `${URL}/api/publish`, '')])).toBe('');
    expect(probeCommandOf([call('POST', `${URL}/api/publish`, '', 'capture')])).toBe('');
    const later = call('PUT', `${URL}/api/later`, '{"a":1}');
    expect(probeCommandOf([call('POST', `${URL}/api/publish`, ''), later]).startsWith(`PUT ${URL}/api/later`)).toBe(true);
  });

  it('★ bodyMissingOf：有候选但一条 body 都没有才算（空候选不算）', () => {
    expect(bodyMissingOf([])).toBe(false);
    expect(bodyMissingOf([call('POST', `${URL}/api/x`, '')])).toBe(true);
    expect(bodyMissingOf([call('POST', `${URL}/api/x`, '', 'capture')])).toBe(true);
    expect(bodyMissingOf([call('POST', `${URL}/api/x`, 'q=1')])).toBe(false);
    expect(bodyMissingOf([call('POST', `${URL}/api/x`, ''), POST()])).toBe(false);
  });

  it('★ filterTextOf：没设（或设了个空的）就是没筛选，回空串；设了是人话', () => {
    expect(filterTextOf(null)).toBe('');
    expect(filterTextOf({ method: 'POST', urlContains: '/api/publish' })).toBe('POST · url 含 /api/publish');
    expect(filterTextOf({ method: '', urlContains: '/api/publish' })).toBe('url 含 /api/publish');
    expect(filterTextOf({ method: 'POST', urlContains: '' })).toBe('POST');
    expect(filterTextOf({ method: '', urlContains: '' })).toBe('');
  });

  it('★ 页面上那份 payload 缺字段时逐格给缺省（不许把 undefined 放到正文里）', () => {
    const read = recordPageOf({ ok: true, phase: 'finished' });
    expect(read.phase).toBe('finished');
    expect(read.t0).toBeNull();
    expect(read.calls).toEqual([]);
    expect(recordPageOf(undefined).ok).toBe(false);
    expect(recordPageOf(undefined).phase).toBe('none');
  });

  it('★ 页面读数带上 shots / shotsAt；缺字段给 0 / null', () => {
    const read = recordPageOf({ ok: true, phase: 'finished', shots: 2, shotsAt: 7 });
    expect(read.shots).toBe(2);
    expect(read.shotsAt).toBe(7);

    const none = recordPageOf({ ok: true, phase: 'armed' });
    expect(none.shots).toBe(0);
    expect(none.shotsAt).toBeNull();
  });

  it('★★ 图 / 门铃并进抬头那一行：没按过不出现、落了给数量、失败如实报', () => {
    const rows = listRowsOf([POST()], null);
    const text = renderRecordRead(
      facts({ rows, shots: [{ n: 1, at: 1, path: '/w/diy/shots/rec-shot-demo-1.png' }] }),
    );
    expect(text.split('\n')[0]).toBe('录完了 · 1 条（⭐ 1） · 图 1 张');
    expect(text).not.toContain('这一段还落了');

    const recording = renderRecordRead(facts({ phase: 'recording', rows, hookCaught: 1 }));
    expect(recording).toContain('还在录');
    expect(recording).not.toContain('图 ');

    const none = renderRecordRead(facts({ rows }));
    expect(none).not.toContain('图 ');

    const failed = renderRecordRead(
      facts({ rows, shots: [{ n: 1, at: 1, path: '/w/diy/shots/rec-shot-demo-1.png', error: '运行时报了个错' }] }),
    );
    expect(failed).toContain('一张图没落下来');
    expect(failed).toContain('运行时报了个错');
    expect(failed).not.toContain('图 1 张');
  });

  it('★★ 门铃那一行：命中过才出（N 次 + 最近毫秒），没命中一个字都不出', () => {
    expect(renderRecordRead(facts({ beats: 0, beatMs: 0 }))).not.toContain('门铃：');
    expect(renderRecordRead(facts({ beats: 1, beatMs: 42 }))).toContain('门铃：1 次（最近 42 毫秒）');
    expect(renderRecordRead(facts({ phase: 'recording', beats: 2, beatMs: 7 }))).toContain('门铃：2 次（最近 7 毫秒）');
    expect(renderRecordRead(facts({ beats: 3, beatMs: 3001 }))).toContain('门铃：3 次（最近 3001 毫秒）');
  });

  it('★ 那段话：还没按开始 / 还在录 / 录完一条都没有 —— 分档说清', () => {
    expect(renderRecordRead(facts({ phase: 'armed' }))).toContain('还没按');
    expect(renderRecordRead(facts({ phase: 'recording', rows: listRowsOf([POST()], null), hookCaught: 1 }))).toContain('还在录');
    const bothZero = renderRecordRead(facts());
    expect(bothZero).toContain('一条请求都没抓到');
    expect(bothZero).toContain('页面钩子 0 条');
    expect(bothZero).toContain('落在这个时间段里 0 条');
    expect(bothZero).toContain('不是筛掉的');
    expect(renderRecordRead(facts({ rows: listRowsOf([POST()], null), capturedLines: 4, armed: false }))).toContain('还没有录制条');
  });

  it('★★ 清单正文：逐条带序号与 key、⭐ 标出来（正文后面不再跟一段解释）', () => {
    const rows = listRowsOf([GET(), POST()], null);
    const text = renderRecordRead(facts({ rows, merged: 2, hookCaught: 1, capturedInSegment: 1 }));

    expect(text).toContain('录完了 · 2 条（⭐ 1）');
    expect(text).toContain(`· [0] ⭐ POST ${URL}/api/publish`);
    expect(text).toContain(`· [1]   GET ${URL}/api/list`);
    expect(text).toContain('入参 有');
    expect(text).not.toContain('要看某一条的原文');
  });

  it('★★ 给了 expect：清单照样一条不删，但那几行解释不再画进正文', () => {
    const rows = listRowsOf([POST()], { method: 'POST', urlContains: '/api/publish' });
    const text = renderRecordRead(
      facts({
        rows,
        merged: 20,
        hookCaught: 5,
        capturedInSegment: 15,
        capturedOutside: 6,
        filter: 'POST · url 含 /api/publish',
      }),
    );

    expect(rows).toHaveLength(1);
    expect(text).toContain('录完了 · 20 条（⭐ 1）');
    expect(text).not.toContain('一条都没删');
    expect(text).not.toContain('符合筛选');
    expect(text).not.toContain('是筛掉了，不是钩子没工作');
    expect(text).not.toContain('会话捕获这一段');
    expect(text).not.toContain('不在这一段时间里');
  });

  it('★ 会话捕获那一轮成没成，如实报（fail / 还没回 都别装成"没抓到"）', () => {
    expect(renderRecordRead(facts({ captureRound: 'fail' }))).toContain('会话捕获最近一轮没跑成');
    expect(renderRecordRead(facts({ captureRound: '' }))).toContain('还没回过一轮');
    expect(renderRecordRead(facts({ captureRound: 'ok' }))).not.toContain('没跑成');
  });

  it('★★ 清单很长时 ⭐ 必须被画出来（只取尾部会把"像写的那一条"切掉）', () => {
    const many = Array.from({ length: 30 }, (_unused, index) =>
      call('GET', `${URL}/api/img/${String(index)}`, '', 'capture', `GET ${URL}/api/img/${String(index)}`),
    );
    const rows = listRowsOf([GET(), POST(), ...many], null);
    const text = renderRecordRead(facts({ rows }));

    expect(rows).toHaveLength(32);
    expect(text).toContain(`[0] ⭐ POST ${URL}/api/publish`);
    expect(text.split('\n').filter((line) => line.startsWith('· '))).toHaveLength(12);
  });

  it('★ 没顶到行数帽却仍被截：说清是"这一读被输出上限截了"，别报成两万行', () => {
    const text = renderRecordRead(facts({ capturedTruncated: true, capturedTotalLines: 46, capturedLines: 20 }));
    expect(text).toContain('一共落了 46 行');
    expect(text).toContain('没顶到 20000 行那顶帽');
    expect(text).toContain('这一读本身被输出上限截了');
  });

  it('★★ 抬头就一行：条数 + ⭐ 几（钩子 / 捕获的明细不再画 —— 那是 agent 不看的解释）', () => {
    const one = listRowsOf([POST()], null);
    const text = renderRecordRead(facts({ rows: one, hookCaught: 0, capturedLines: 1, capturedInSegment: 1 }));

    expect(text.split('\n')[0]).toBe('录完了 · 1 条（⭐ 1）');
    expect(text).not.toContain('页面钩子');
    expect(text).not.toContain('合并去重后');
    expect(text).not.toContain('⭐ 都列上');
  });

  it('★★ 捕获被 tail 截过：明说只解析了最后一段，不许再说"一条都没落""不是筛掉的"', () => {
    const truncated = renderRecordRead(
      facts({ capturedTotalLines: 5000, capturedTruncated: true, capturedTailLimit: 2000 }),
    );

    expect(truncated).toContain('一共落了 5000 行');
    expect(truncated).toContain('只解析了最后 2000 行');
    expect(truncated).toContain('只对最后这段成立');
    expect(truncated).not.toContain('一条都没落');
    expect(truncated).not.toContain('不是筛掉的');
    expect(truncated).toContain('但捕获文件被截过');

    const whole = renderRecordRead(facts({ capturedTotalLines: 12 }));
    expect(whole).not.toContain('只解析了最后');
    expect(whole).toContain('不是筛掉的');
  });

  it('★ 缓冲丢了 / 导航过 / 一行都没落 —— 三档如实说', () => {
    const text = renderRecordRead(facts({ rows: listRowsOf([POST()], null), dropped: 2, nav: true }));
    expect(text).toContain('最早丢了 2 条');
    expect(text).toContain('导航过');
    expect(text).toContain('会话捕获一条都没落');
  });

  it('★★ detail 那一拍：入参 / 出参 / 请求头 / 截断都写出来；没找到就说清有哪几条路', () => {
    const hit = renderRecordDetail({
      found: true,
      where: '会话捕获（浏览器那一层，快照原文）',
      method: 'POST',
      url: `${URL}/api/publish`,
      status: 200,
      ct: 'application/json',
      at: 1,
      request: '{"env":"test"}',
      response: '{"ok":true}',
      headers: '{"content-type":"application/json"}',
      requestFullSize: 14,
      responseFullSize: 11,
      requestSizeExact: true,
      responseSizeExact: true,
      ambiguous: 1,
      source: 'capture',
      maxBytes: 60000,
      note: '',
    });

    expect(hit).toContain(`POST ${URL}/api/publish · 200 · application/json`);
    expect(hit).toContain('入参（request body，原长 14 字节）：');
    expect(hit).toContain('{"env":"test"}');
    expect(hit).toContain('出参（response body，原长 11 字节）：');
    expect(hit).toContain('请求头（可能含凭据');
    expect(hit).not.toContain('没找到这一条');

    const cut = renderRecordDetail({
      found: true,
      where: '页面钩子（这一段）',
      method: 'POST',
      url: `${URL}/api/publish`,
      status: 200,
      ct: '',
      at: 1,
      request: 'x'.repeat(50),
      response: '',
      headers: '',
      requestFullSize: 50,
      responseFullSize: 0,
      requestSizeExact: false,
      responseSizeExact: false,
      ambiguous: 0,
      source: 'hook',
      maxBytes: 10,
      note: '',
    });
    expect(cut).toContain('这里截到 10');
    expect(cut).toContain('字符（没给 body_full_size');
    expect(cut).toContain('出参（response body）：没有');

    const miss = renderRecordDetail({
      found: false,
      where: '',
      method: '',
      url: '',
      status: 0,
      ct: '',
      at: 0,
      request: '',
      response: '',
      headers: '',
      requestFullSize: 0,
      responseFullSize: 0,
      requestSizeExact: false,
      responseSizeExact: false,
      ambiguous: 0,
      source: '',
      maxBytes: 60000,
      note: '「POST nope」既不在快照原文里，也不在钩子那一份里',
    });
    expect(miss).toContain('没找到这一条');
    expect(miss).toContain('复制成 curl');
  });

  it('★★ 同一个 key 跨轮重名：明说重名几次（要 at 才钉得住是哪一次）', () => {
    const text = renderRecordDetail({
      found: true,
      where: '会话捕获（浏览器那一层，快照原文）',
      method: 'POST',
      url: `${URL}/api/save`,
      status: 200,
      ct: 'application/json',
      at: 1,
      request: '{"id":2}',
      response: '',
      headers: '',
      requestFullSize: 8,
      responseFullSize: 0,
      requestSizeExact: true,
      responseSizeExact: false,
      ambiguous: 3,
      source: 'capture',
      maxBytes: 60000,
      note: '',
    });

    expect(text).toContain('这个 key 在这一场的原文里出现 3 次');
    expect(text).toContain('带上清单里那一行的 at');
  });

  it('★ 那条写回包还没到（status 0）：抬头如实写，别让人读成"状态码 0"', () => {
    const text = renderRecordDetail({
      found: true,
      where: '会话捕获（浏览器那一层，快照原文）',
      method: 'POST',
      url: `${URL}/api/missions`,
      status: 0,
      ct: '',
      at: 1,
      request: '{"name":"测试任务"}',
      response: '',
      headers: '',
      requestFullSize: 18,
      responseFullSize: 0,
      responseSizeExact: false,
      requestSizeExact: true,
      ambiguous: 1,
      source: 'capture',
      maxBytes: 60000,
      note: '',
    });

    expect(text).toContain('回包还没到（status 0）');
    expect(text).toContain('入参（request body，原长 18 字节）');
    expect(text).toContain('出参（response body）：没有');
  });

  it('★ prepare 那一拍只回一句（2026-10-20 用户定的：别把浮条那三拍再抄一遍）', () => {
    expect(recordTalkOf()).toBe('已开始录制');
  });

  it('★ 捕获文件落在取证目录里（按 unit 取名）', () => {
    expect(captureFileOf('/w/artifacts/demo', 'demo')).toBe(join('/w', 'artifacts', 'demo', 'rec-demo.jsonl'));
  });

  it('★★ 每一档拒法都有话说（别回一句光秃秃的 code）', () => {
    for (const code of ['already-held', 'held-by-other', 'not-owner', 'none', 'already-recording', 'not-armed', 'not-recording', 'not-finished'] as const) {
      expect(recordRefusalText(code).length).toBeGreaterThan(6);
    }
  });

  it('★ 三段脚本都在：浮条三态 + sessionStorage 落盘 + 卸钩子', () => {
    expect(RECORD_ARM_SCRIPT).toContain('开始录制');
    expect(RECORD_ARM_SCRIPT).toContain('结束录制');
    expect(RECORD_ARM_SCRIPT).toContain('拍一张当前页面的截图');
    expect(RECORD_ARM_SCRIPT).toContain('sessionStorage');
    expect(RECORD_READ_SCRIPT).toContain('not-armed');
    expect(RECORD_READ_SCRIPT).toContain('shotsAt');
    expect(RECORD_STOP_SCRIPT).toContain('removeItem');
  });

  it('★ 纯的那几格：只给 urlContains 也标得住；body 太长截到 400；杂行不进 calls', () => {
    const rows = listRowsOf([GET(), POST()], { method: '', urlContains: '/api/publish' });
    expect(rows.map((one) => one.marked)).toEqual([true, false]);
    expect(rows.map((one) => one.url)).toEqual([`${URL}/api/publish`, `${URL}/api/list`]);

    const long = call('POST', `${URL}/api/publish`, 'x'.repeat(900));
    const text = probeCommandOf([long]);
    expect(text).toContain('x'.repeat(400));
    expect(text).not.toContain('x'.repeat(401));

    const mixed = recordPageOf({ ok: true, phase: 'finished', calls: [null, 3, 'x', POST()] });
    expect(mixed.calls).toEqual([POST()]);
  });
});

describe('录制交接：expect 那一路的形状（别把 RecordExpect 忘了）', () => {
  it('★ 空的 expect（method 与 urlContains 都空）跟不设一样：不筛、不标（filterTextOf 回空串）', () => {
    const empty: RecordExpect = { method: '', urlContains: '' };
    expect(filterTextOf(empty)).toBe('');
    expect(listRowsOf([GET()], empty)[0]?.marked).toBe(false);
  });
});
