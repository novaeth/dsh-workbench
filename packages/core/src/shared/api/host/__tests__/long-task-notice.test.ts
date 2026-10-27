import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LongTaskBase, LongTaskChange } from '@dsh-workbench/shared/host';
import {
  type AgentsLookup,
  type NoticeAgent,
  type NoticeMessage,
} from '../diy-debug-act';
import { approvalCallOf, type ApprovalExec } from '../approval-call';
import { longTaskStopNotice, notifyLongTaskStop } from '../long-task-notice';

const PKG_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

function change(over: Partial<LongTaskBase> & { readonly by?: string | undefined } = {}): LongTaskChange<LongTaskBase> {
  const { by, ...snapshot } = over;
  return {
    kind: 'settle',
    by,
    snapshot: {
      id: 'run-1',
      workspace: '/w/a',
      target: 'env-prod',
      status: 'stopped',
      step: '',
      steps: [],
      startedAt: '2026-10-21T00:00:00.000Z',
      at: '2026-10-21T00:00:01.000Z',
      ...snapshot,
    },
  };
}

function fakeAgents(status: string): { lookup: AgentsLookup; log: string[]; box: NoticeMessage[] } {
  const log: string[] = [];
  const box: NoticeMessage[] = [];
  const agent: NoticeAgent = {
    status,
    inject: (message) => {
      log.push('inject');
      box.push(message);
    },
    followup: (message) => {
      log.push('followup');
      box.push(message);
    },
  };
  return { lookup: { get: (id) => (id === 's-1' ? agent : undefined) }, log, box };
}

describe('longTaskStopNotice：被停了要不要回流给发起它的那个会话', () => {
  it('★ 用户按的（`by === undefined`）：文案里是「用户」，summary 逐字', () => {
    const notice = longTaskStopNotice('inventory', change({ session: 's-1' }));

    expect(notice?.session).toBe('s-1');
    expect(notice?.summary).toBe('长任务：inventory 的「env-prod」被停了');
    expect(notice?.message.content[0]?.text).toBe(
      '［长任务 · inventory］「env-prod」那一趟被用户停了 —— 别再把它当"还在跑"；要接着做就重新起一趟（workbench_long_tasks_list 看当前这几趟）。',
    );
  });

  it('★ 别的会话按的（`by` 有值且不等于发起方）：文案里是「别的会话」', () => {
    const notice = longTaskStopNotice('inventory', change({ session: 's-1', by: 's-2' }));

    expect(notice?.message.content[0]?.text).toContain('那一趟被别的会话停了');
  });

  it('★ 自己停自己不发（`by === snapshot.session`）', () => {
    expect(longTaskStopNotice('inventory', change({ session: 's-1', by: 's-1' }))).toBeNull();
  });

  it('★ 跑完 / 失败不发（那是模块自己那把工具的活）', () => {
    expect(longTaskStopNotice('inventory', change({ session: 's-1', status: 'ok' }))).toBeNull();
    expect(longTaskStopNotice('inventory', change({ session: 's-1', status: 'failed' }))).toBeNull();
  });

  it('★ 界面起的那趟（没记会话）不发 —— 没人可通知', () => {
    expect(longTaskStopNotice('inventory', change())).toBeNull();
  });

  it('★ 投递三路（模式 `drop`）：正在跑的 inject 一条；闲着的跳过；没这个 agent 就当没发生', () => {
    const busy = fakeAgents('running');
    expect(notifyLongTaskStop(busy.lookup, 'inventory', change({ session: 's-1' }))).toBe('inject');
    expect(busy.box[0]?.content[0]?.text).toContain('［长任务 · inventory］');

    const idle = fakeAgents('idle');
    expect(notifyLongTaskStop(idle.lookup, 'inventory', change({ session: 's-1' }))).toBe('skipped-idle');
    expect(idle.log).toEqual([]);

    expect(notifyLongTaskStop({ get: () => undefined }, 'inventory', change({ session: 's-1' }))).toBe('none');
    expect(notifyLongTaskStop(busy.lookup, 'inventory', change({ session: 's-1', by: 's-1' }))).toBeNull();
  });
});

describe('approvalCallOf：审批那一拍给策略看的调用描述', () => {
  function exec(over: { readonly id?: string; readonly cwd?: string } = {}): ApprovalExec {
    return {
      arguments: { id: 'run-1' },
      agent: { session: { id: over.id, header: { cwd: over.cwd } } },
    };
  }

  it('★ 工作区与发起会话都从 `exec` 现取', () => {
    expect(approvalCallOf(exec({ id: 's-1', cwd: '/w/a' }), 'wb_demo')).toEqual({
      name: 'wb_demo',
      arguments: { id: 'run-1' },
      workspace: '/w/a',
      session: 's-1',
    });
  });

  it('★ 取不到的那几格不写：没 cwd / 没会话 id ⇒ 没有 workspace / session 这两个键', () => {
    expect(approvalCallOf(exec(), 'wb_demo')).toEqual({ name: 'wb_demo', arguments: { id: 'run-1' } });
    expect(Object.keys(approvalCallOf(exec(), 'wb_demo'))).toEqual(['name', 'arguments']);
  });

  it('★ `name` 没给就不写那个键；`exec` 也没有时只剩实参这一格', () => {
    expect(Object.keys(approvalCallOf(exec({ id: 's-1', cwd: '/w/a' }), undefined))).toEqual([
      'arguments',
      'workspace',
      'session',
    ]);
    expect(approvalCallOf(undefined, undefined)).toEqual({});
  });
});

describe('写审批那一拍把调用方会话带上', () => {
  it('★ 接线住在 approval-gate.ts：那一拍用 `approvalCallOf(exec, name)`', () => {
    const source = readFileSync(join(PKG_ROOT, 'src/shared/api/host/approval-gate.ts'), 'utf8');

    expect(source).toContain('const call = approvalCallOf(exec, name);');
  });
});
