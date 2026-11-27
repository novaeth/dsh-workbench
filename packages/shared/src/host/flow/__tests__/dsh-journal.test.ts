import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import SessionStore, { type Session, type SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import { createDshFlowJournal } from '../dsh-journal.js';

const snapshot = {
  version: 1 as const,
  flow: 'diy-tweak',
  input: { destination: 'tweak' },
  step: 'build',
  values: { plan: { see: ['一眼'] } },
  status: 'running' as const,
};

interface SessionStoreLike {
  create(): Session;
  fork(source: Session, boundary?: undefined, childSessionId?: SessionId): Session;
}

async function setup() {
  const ctx = new Context();
  await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjectionRegistry);
  const sessions = ctx.sessions as unknown as SessionStoreLike;
  const session = sessions.create();
  const journal = createDshFlowJournal(ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { ctx, sessions, session, journal };
}

describe('dsh flow journal', () => {
  it('★ 插件记录能写能读，turn/start 不清空', async () => {
    const { ctx, session, journal } = await setup();
    journal.write(session.id, snapshot);
    expect(journal.read(session.id)).toEqual(snapshot);

    session.append('turn/start', { turn: 2 });
    expect(journal.read(session.id)).toEqual(snapshot);
    await ctx.fiber.dispose();
  });

  it('★ 没有记录的会话读回 null', async () => {
    const { ctx, session, journal } = await setup();
    expect(journal.read(session.id)).toBeNull();
    await ctx.fiber.dispose();
  });

  it('★ fork 出来的会话带上同一条流程记录', async () => {
    const { ctx, sessions, session, journal } = await setup();
    journal.write(session.id, snapshot);
    const child = sessions.fork(session, undefined, 'child' as SessionId);
    expect(journal.read(child.id)).toEqual(snapshot);
    await ctx.fiber.dispose();
  });
});
