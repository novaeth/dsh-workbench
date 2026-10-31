import { describe, expect, it } from 'vitest';
import { addNoteOf, noteProblemOf, notesOf } from './notes';

describe('notesOf', () => {
  it('没存过就是空数组', () => {
    expect(notesOf(null)).toEqual([]);
    expect(notesOf({ nope: true })).toEqual([]);
  });

  it('只认完整的条目，坏的丢掉；最多留 20 条', () => {
    const raw = [
      { id: 'a', text: '一', at: '2026-01-01T00:00:00.000Z' },
      { id: 'b', text: '缺 at' },
      ...Array.from({ length: 30 }, (_unused, index) => ({
        id: `n${String(index)}`,
        text: `第 ${String(index)} 条`,
        at: '2026-01-01T00:00:00.000Z',
      })),
    ];
    const notes = notesOf(raw);
    expect(notes).toHaveLength(20);
    expect(notes[0]?.id).toBe('a');
    expect(notes[19]?.id).toBe('n18');
  });
});

describe('noteProblemOf', () => {
  it('空 / 只有空白 / 超长都点名叫原因', () => {
    expect(noteProblemOf('   ')).toContain('写点什么');
    expect(noteProblemOf(undefined)).toContain('一句话');
    expect(noteProblemOf('x'.repeat(201))).toContain('200');
    expect(noteProblemOf('x'.repeat(200))).toBeUndefined();
  });
});

describe('addNoteOf', () => {
  it('新条目排最前，超过 20 条丢最旧', () => {
    const old = Array.from({ length: 20 }, (_unused, index) => ({
      id: `old-${String(index)}`,
      text: '旧',
      at: '2026-01-01T00:00:00.000Z',
    }));
    const { note, notes } = addNoteOf(old, '  新的一条  ', '2026-02-02T00:00:00.000Z', 'new');
    expect(note.text).toBe('新的一条');
    expect(notes[0]).toEqual(note);
    expect(notes).toHaveLength(20);
    expect(notes.some((one) => one.id === 'old-19')).toBe(false);
  });
});
