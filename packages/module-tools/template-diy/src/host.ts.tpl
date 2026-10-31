import type { DshToolRegistry, UnitModuleFace } from '@dsh-workbench/core/contract';
import {
  defineUnitHostPlugin,
  factOfRoute,
  recordOf,
  textOf,
  writeApprovalOf,
} from '@dsh-workbench/shared/host';
import { DECLARED_TOOLS } from './declared-tools';
import { RUN_RESOURCE } from './model/flow';
import { NOTE_RESOURCE, NOTES_ROUTE, UNIT_ID } from './model/notes';
import { PREFS_RESOURCE, PREFS_ROUTE, applyPrefs, prefsOf } from './model/prefs';
import { createNotes } from './host/notes';
import { createSample } from './host/sample';
import { overviewAnswer } from './host/overview';

export { readOverview } from './host/overview';

const PLUGIN_ID = '__NAME__';

export const OVERVIEW_ROUTE = `${UNIT_ID}/overview`;

export type RouteHandler = (search: URLSearchParams) => Promise<unknown> | unknown;

function pathOf(search: URLSearchParams): string {
  return search.get('path') ?? '';
}

const face: UnitModuleFace = {
  unit: UNIT_ID,
  mount: (deps) => {
    const sample = createSample(deps);
    const notes = createNotes(deps);
    const storeAt = (workspace: string) => deps.store.for(UNIT_ID, workspace === '' ? null : workspace);

    return {
      routes: {
        [OVERVIEW_ROUTE]: (search: URLSearchParams) => overviewAnswer(search),
        [NOTES_ROUTE]: (search: URLSearchParams) => {
          const path = pathOf(search);
          if (path === '') {
            return { ok: false, error: { code: 'no-path', message: '没告诉我要看哪个目录' } };
          }
          return { ok: true, notes: notes.list(path) };
        },
        [PREFS_ROUTE]: (search: URLSearchParams) => ({
          ok: true,
          prefs: prefsOf(storeAt(search.get('workspace') ?? pathOf(search))),
        }),
      },
      prefs: {
        resource: PREFS_RESOURCE,
        handle: (payload: unknown) => {
          const body = recordOf(payload);
          const workspace = textOf(body['workspace']) || textOf(body['path']);
          if (workspace === '') {
            return { ok: false, error: { code: 'no-workspace', message: '没告诉我要存到哪个工作区' } };
          }
          return { ok: true, ...applyPrefs(storeAt(workspace), payload) };
        },
      },
      registerTools: () => {
        const tools = deps.ctx.get<DshToolRegistry>('tools');
        if (tools === undefined) {
          deps.logger?.warn?.(`[${UNIT_ID}] 外壳没有提供 tools 服务：这两把工具注册不进去`);
          return [];
        }
        return [tools.register(sample.runTool), tools.register(notes.tool)];
      },
      actions: [
        {
          resource: RUN_RESOURCE,
          handle: (payload: unknown) => sample.startFromPayload(payload),
        },
        {
          resource: NOTE_RESOURCE,
          handle: (payload: unknown) => notes.handle(payload),
        },
      ],
      factsOf: (call: { readonly source: string }) => {
        if (call.source === DECLARED_TOOLS.addNote.name || call.source === NOTE_RESOURCE) {
          return [factOfRoute(NOTES_ROUTE)];
        }
        if (call.source === PREFS_RESOURCE) return [factOfRoute(PREFS_ROUTE)];
        if (call.source === DECLARED_TOOLS.run.name) return [];
        return undefined;
      },
      ...writeApprovalOf({
        tools: [DECLARED_TOOLS.addNote.name],
        reason: '会往这个模块的笔记里加一条',
        question: { zh: '把这条笔记写进去吗？', en: 'Write this note?' },
        fallback: { zh: '只写本模块的笔记文件，不动平台', en: 'Writes only this module’s notes file' },
        detail: { zh: '新增 1 条笔记', en: 'Add 1 note' },
      }),
      ...(sample.runs === undefined ? {} : { longTasks: sample.runs }),
    };
  },
};

const plugin = defineUnitHostPlugin({ name: PLUGIN_ID, unit: UNIT_ID, face });

export const name = plugin.name;

export const inject = plugin.inject;

export const apply = plugin.apply;
