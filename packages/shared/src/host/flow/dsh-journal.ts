import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import type { DshHostContext, DshSession, DshSessionId, DshSessionStore } from '../../api/dsh.js';
import { SESSION_PROJECTIONS_SERVICE, SESSION_STORE_SERVICE } from '../../config/constants.js';
import {
  DIY_FLOW_PROJECTION,
  DIY_FLOW_RECORD,
  parseDiyFlowSnapshot,
  type DiyFlowJournal,
  type DiyFlowSnapshot,
} from './journal.js';

interface ProjectionHandle {
  stateOf(session: DshSession): DiyFlowSnapshot | null;
  dispose(): Promise<void>;
}

interface ProjectionRegistry {
  register(definition: unknown): Promise<ProjectionHandle>;
}

const snapshotSchema = {
  parse: (value: unknown): DiyFlowSnapshot | null => parseDiyFlowSnapshot(value),
};

export function createDshFlowJournal(ctx: DshHostContext): DiyFlowJournal {
  const projections = ctx.get(SESSION_PROJECTIONS_SERVICE) as ProjectionRegistry | undefined;
  const sessions = ctx.get(SESSION_STORE_SERVICE) as DshSessionStore | undefined;
  if (projections === undefined || sessions === undefined) {
    return { read: () => null, write: () => {} };
  }

  let handle: ProjectionHandle | undefined;
  void projections
    .register({
      key: DIY_FLOW_PROJECTION,
      stateSchema: snapshotSchema as never,
      init: () => null,
      apply: (state: DiyFlowSnapshot | null, event: { type: string; data: unknown }) => {
        if (event.type !== DIY_FLOW_RECORD) return state;
        const parsed = parseDiyFlowSnapshot(event.data);
        return parsed ?? state;
      },
      stateVersion: 1,
    })
    .then((next) => {
      handle = next;
    })
    .catch((error: unknown) => {
      ctx.logger?.warn?.(`[dsh-workbench] 注册流程状态 projection 失败：${String(error)}`);
    });

  ctx.effect?.(() => () => {
    const now = handle;
    handle = undefined;
    if (now !== undefined) void now.dispose();
  }, 'dsh-workbench: 流程状态 projection 随宿主卸载');

  const sessionOf = (session: string): DshSession | undefined =>
    sessions.get(session as DshSessionId);

  return {
    read(session) {
      const handleNow = handle;
      const current = sessionOf(session);
      if (handleNow === undefined || current === undefined) return null;
      return handleNow.stateOf(current);
    },
    write(session, snapshot) {
      const current = sessionOf(session);
      if (current === undefined) return;
      appendPluginRecord(current, DIY_FLOW_RECORD, snapshot);
    },
  };
}
