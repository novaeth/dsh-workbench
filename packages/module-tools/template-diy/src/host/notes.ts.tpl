import { randomUUID } from 'node:crypto';
import type { DshToolDefinition, UnitMountDeps } from '@dsh-workbench/core/contract';
import { TEXT_OUTPUT, recordOf, sessionWorkspace, textOf } from '@dsh-workbench/shared/host';
import { DECLARED_TOOLS } from '../declared-tools';
import {
  NOTE_FILE,
  UNIT_ID,
  addNoteOf,
  noteIdOf,
  noteProblemOf,
  notesOf,
  type Note,
} from '../model/notes';

export interface NotesResult {
  readonly ok: boolean;
  readonly notes?: readonly Note[];
  readonly note?: Note;
  readonly code?: string;
  readonly message?: string;
  readonly text?: string;
}

export interface Notes {
  list(workspace: string): Note[];
  add(workspace: string, rawText: unknown): NotesResult;
  readonly tool: DshToolDefinition;
  handle(payload: unknown): unknown;
}

export function createNotes(deps: UnitMountDeps): Notes {
  const storeAt = (workspace: string) => deps.store.for(UNIT_ID, workspace);

  const list = (workspace: string): Note[] => notesOf(storeAt(workspace).read(NOTE_FILE));

  const add = (workspace: string, rawText: unknown): NotesResult => {
    const problem = noteProblemOf(rawText);
    if (problem !== undefined) return { ok: false, code: 'note-invalid', message: problem };
    const at = new Date().toISOString();
    const existing = list(workspace);
    const { note, notes } = addNoteOf(
      existing,
      String(rawText),
      at,
      noteIdOf(at, randomUUID().slice(0, 8)),
    );
    storeAt(workspace).write(NOTE_FILE, notes);
    return { ok: true, note, notes };
  };

  const tool: DshToolDefinition = {
    name: DECLARED_TOOLS.addNote.name,
    description: '往当前工作区的模块笔记里加一条（最多 20 条，只写本模块自己的文件夹，不动平台）。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要记的一句话（200 字以内）。' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(raw, exec) {
      const workspace = sessionWorkspace(exec);
      if (workspace === null || workspace === '') {
        return { ok: false, text: '这个会话没有工作区：先打开一个项目再记。' };
      }
      const result = add(workspace, recordOf(raw)['text']);
      return result.ok
        ? { ok: true, text: `记下了：${result.note?.text ?? ''}` }
        : { ok: false, text: result.message ?? '没记上' };
    },
  };

  return {
    list,
    add,
    tool,
    handle(payload: unknown): unknown {
      const body = recordOf(payload);
      const workspace = textOf(body['path']);
      if (workspace === '') {
        return { ok: false, error: { code: 'no-workspace', message: '先打开一个项目再记' } };
      }
      const result = add(workspace, body['text']);
      if (!result.ok) {
        return { ok: false, error: { code: result.code ?? 'note-invalid', message: result.message ?? '没记上' } };
      }
      return { ok: true, notes: result.notes, text: `记下了：${result.note?.text ?? ''}` };
    },
  };
}
