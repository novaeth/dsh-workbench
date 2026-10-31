export const UNIT_ID = '__UNIT__';
export const NOTE_FILE = 'notes.json';
export const NOTES_ROUTE = `${UNIT_ID}/notes`;
export const NOTE_RESOURCE = `${UNIT_ID}-add-note`;
export const NOTE_TEXT_MAX = 200;
export const NOTE_LIMIT = 20;

export interface Note {
  readonly id: string;
  readonly text: string;
  readonly at: string;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function notesOf(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  const notes: Note[] = [];
  for (const one of raw) {
    const value = recordOf(one);
    if (typeof value['id'] !== 'string' || typeof value['text'] !== 'string') continue;
    if (typeof value['at'] !== 'string') continue;
    notes.push({ id: value['id'], text: value['text'], at: value['at'] });
    if (notes.length >= NOTE_LIMIT) break;
  }
  return notes;
}

export function noteProblemOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return '笔记要是一句话';
  const text = raw.trim();
  if (text === '') return '写点什么再存';
  const length = [...text].length;
  if (length > NOTE_TEXT_MAX) return `最多 ${String(NOTE_TEXT_MAX)} 字，这条有 ${String(length)} 字`;
  return undefined;
}

export function addNoteOf(
  notes: readonly Note[],
  text: string,
  at: string,
  id: string,
): { readonly note: Note; readonly notes: Note[] } {
  const note: Note = { id, text: text.trim(), at };
  return { note, notes: [note, ...notes].slice(0, NOTE_LIMIT) };
}

export function noteIdOf(at: string, seed: string | number): string {
  return `${at}-${String(seed)}`;
}
