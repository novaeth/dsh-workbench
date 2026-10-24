import { describe, expect, it } from 'vitest';
import { buildMarker, encodeRef, markerBody } from '@dsh-workbench/shared';
import { decodeRef, parseMarkers } from '@dsh-workbench/shared/host';

const issue = { kind: 'issue', parts: ['example-team', 'DEMO-PROJ', '#1346'] } as const;

describe('encodeRef / decodeRef', () => {
  it('往返一致', () => {
    expect(encodeRef(issue)).toBe('issue:example-team/DEMO-PROJ/#1346');
    expect(decodeRef('issue:example-team/DEMO-PROJ/#1346')).toEqual(issue);
  });

  it('片段里出现 "/" 时，空片段被丢掉（不产生空 part）', () => {
    expect(decodeRef('issue:a//b')).toEqual({ kind: 'issue', parts: ['a', 'b'] });
  });

  it('形状不对 → undefined（不是引用）', () => {
    expect(decodeRef('没有冒号')).toBeUndefined();
    expect(decodeRef(':开头')).toBeUndefined();
    expect(decodeRef('Issue:大写不行')).toBeUndefined();
    expect(decodeRef('issue:')).toBeUndefined();
  });
});

describe('buildMarker / parseMarkers', () => {
  it('标记形状：@工作台:<kind>:<part>/<part>（无方括号、无空格）', () => {
    expect(buildMarker(issue)).toBe('@工作台:issue:example-team/DEMO-PROJ/#1346');
    expect(markerBody(encodeRef(issue))).toBe('工作台:issue:example-team/DEMO-PROJ/#1346');
  });

  it('最后一段就是 chip 会显示的文字（dsh 只取最后一个 "/" 之后那段）', () => {
    const marker = buildMarker(issue);
    expect(marker.slice(1).split('/').filter(Boolean).at(-1)).toBe('#1346');
  });

  it('从一句话里扫出来（前后还有别的字）', () => {
    const text = `看看 ${buildMarker(issue)} 这个缺陷`;

    expect(parseMarkers(text)).toEqual([issue]);
  });

  it('紧贴着中文标点也扫得出来（中文不会跑进 part）', () => {
    expect(parseMarkers(`${buildMarker(issue)}，谢谢`)).toEqual([issue]);
    expect(parseMarkers(`${buildMarker(issue)}。`)).toEqual([issue]);
  });

  it('句尾的 ASCII 标点当标点，不当 part', () => {
    expect(parseMarkers(`${buildMarker(issue)}.`)).toEqual([issue]);
    expect(parseMarkers(`${buildMarker(issue)},`)).toEqual([issue]);
  });

  it('多个标记都扫出来，重复的只算一次', () => {
    const other = { kind: 'commit', parts: ['abc123'] };
    const text = `${buildMarker(issue)} ${buildMarker(other)} ${buildMarker(issue)}`;

    expect(parseMarkers(text)).toEqual([issue, other]);
  });

  it('形状不对的标记当普通文本（不漏不瞎认）', () => {
    expect(parseMarkers('@工作台:坏的')).toEqual([]);
    expect(parseMarkers('@工作台:')).toEqual([]);
    expect(parseMarkers('@别的:issue:a/b')).toEqual([]);
    expect(parseMarkers('@工作台[issue:a/b]')).toEqual([]);
    expect(parseMarkers('完全没有标记')).toEqual([]);
  });
});

describe('serializeChipRef（chip 的 ref → 提交时的模型文本）', () => {
  it('把紧凑引用变成宿主能认的标记', async () => {
    const { serializeChipRef } = await import('../context-chips');

    expect(serializeChipRef('issue:example-team/DEMO-PROJ/#1346')).toBe(
      '@工作台:issue:example-team/DEMO-PROJ/#1346',
    );
    expect(parseMarkers(serializeChipRef('issue:a/b/c'))).toEqual([{ kind: 'issue', parts: ['a', 'b', 'c'] }]);
  });

  it('形状不对时退化成可读文本（不产生一个宿主认不出、模型也看不懂的标记）', async () => {
    const { serializeChipRef } = await import('../context-chips');

    expect(serializeChipRef('乱的')).toBe('@乱的');
  });
});
