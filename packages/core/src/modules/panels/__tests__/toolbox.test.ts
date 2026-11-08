import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNoopDataReader } from '@dsh-workbench/shared/testing';
import type { DshHostContext, DshToolDefinition, UnitManifest } from '@dsh-workbench/shared';
import { approvalFor } from '@dsh-workbench/shared/host';
import { createHostKit, createWorkspaceStore, hostSurface, WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { panelsHost } from '../index';
import {
  DIY_PACK_TOOLS,
  MANAGE_TOOLS,
  TOOLBOX_CLOSE_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
  panelsUnit,
} from '../unit';
import { testAdaptersWith } from './test-adapters';

const boardUnit: UnitManifest = {
  id: 'board-x',
  title: { zh: '看板 X', en: 'Board X' },
  titleKey: 'board.x',
  card: null,
  host: { inject: [], optional: [] },
  tools: [
    { name: 'workbench_board_x_list', writes: false },
    { name: 'workbench_board_x_do', writes: true },
  ],
};

const adapters = testAdaptersWith({ root: () => dir, profile: () => profileDir });

let dir = '';
let profileDir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-toolbox-'));
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-toolbox-profile-'));
  fs.writeFileSync(
    path.join(profileDir, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-test', dsh: { profile: { bundles: [] } }, dependencies: {} }),
    'utf8',
  );
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
});

const store = () => createWorkspaceStore({ root: dir });

function mount() {
  const registered: DshToolDefinition[] = [];
  const ctx = {
    get: (key: string) =>
      key === WORKBENCH_ADAPTERS
        ? adapters
        : key === 'tools'
          ? {
              register: (definition: DshToolDefinition) => {
                registered.push(definition);
                return () => {};
              },
            }
          : undefined,
    provide: () => () => {},
    logger: { info: () => {}, warn: () => {} },
  } as unknown as DshHostContext;

  const mounted = panelsHost.mount({
    manifest: panelsUnit,
    ctx,
    manifests: () => [panelsUnit, boardUnit],
    ownedUnits: () => [panelsUnit.id, 'board-x'],
    store: store(),
    data: createNoopDataReader(),
    ...createHostKit({ libInstallCommand: (options) => `npm i ${options.need.name}`, surface: hostSurface() }),
  });
  mounted.registerTools();
  return { mounted, registered };
}

const exec = (session?: string) =>
  ({
    agent: {
      ...(session === undefined
        ? {}
        : { session: { id: session, header: { cwd: dir } } }),
    },
  }) as never;

function tool(registered: readonly DshToolDefinition[], name: string): DshToolDefinition {
  const found = registered.find((definition) => definition.name === name);
  if (found === undefined) throw new Error(`没有注册 ${name}`);
  return found;
}

async function call(
  registered: readonly DshToolDefinition[],
  name: string,
  args: unknown,
  session?: string,
): Promise<Record<string, unknown>> {
  return (await tool(registered, name).execute?.(args, exec(session))) as Record<string, unknown>;
}

const deniedOf = (
  mounted: ReturnType<typeof mount>['mounted'],
  session: string | null,
  preset: string | null = null,
): readonly string[] => mounted.gate?.deniedTools({ workspace: dir, preset, session }) ?? [];

describe('工具箱：默认只留控制面，按会话开包', () => {
  it('清单：三个控制工具都在，开包那把写着 elevates、不算写', () => {
    const openTool = panelsUnit.tools?.find((one) => one.name === TOOLBOX_OPEN_TOOL);

    expect(panelsUnit.tools?.map((one) => one.name)).toEqual(
      expect.arrayContaining([TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL, TOOLBOX_CLOSE_TOOL]),
    );
    expect(openTool?.writes).toBe(false);
    expect(openTool?.elevates).toBe(true);
  });

  it('★ 默认会话：manage / diy / 单元包全收着；开一个单元包只放它自己', async () => {
    const { mounted, registered } = mount();
    const all = new Set([...MANAGE_TOOLS, ...DIY_PACK_TOOLS, 'workbench_board_x_list', 'workbench_board_x_do']);

    expect(new Set(deniedOf(mounted, 's-1'))).toEqual(all);

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['unit:board-x'] }, 's-1');
    const afterUnit = deniedOf(mounted, 's-1');

    expect(afterUnit).not.toContain('workbench_board_x_list');
    expect(afterUnit).toContain(MANAGE_TOOLS[0]);
    expect(afterUnit).toContain(DIY_PACK_TOOLS[0]);
  });

  it('★ 批量开：一次传多个 target，只问一次审批，全部生效', async () => {
    const { mounted, registered } = mount();

    const opened = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage', 'unit:board-x'] }, 's-1');

    expect(opened['newly']).toEqual(['manage', 'unit:board-x']);
    const after = deniedOf(mounted, 's-1');
    for (const name of [...MANAGE_TOOLS, 'workbench_board_x_list']) expect(after).not.toContain(name);
    for (const name of DIY_PACK_TOOLS) expect(after).toContain(name);
  });

  it('幂等：再开同一个包不重复问，返回说"本来就在开"', async () => {
    const { registered } = mount();

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');
    const again = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');

    expect(again['newly']).toEqual([]);
    expect(String(again['text'])).toContain('本来就在开');
  });

  it('收包：立刻从清单里收回，不需要审批', async () => {
    const { mounted, registered } = mount();

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');
    const closed = await call(registered, TOOLBOX_CLOSE_TOOL, { targets: ['manage'] }, 's-1');

    expect(closed['closed']).toEqual(['manage']);
    expect(deniedOf(mounted, 's-1')).toContain(MANAGE_TOOLS[0]);
  });

  it('会话隔离：s-1 开了 manage，s-2 还是默认面', async () => {
    const { mounted, registered } = mount();

    await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] }, 's-1');

    expect(deniedOf(mounted, 's-1')).not.toContain(MANAGE_TOOLS[0]);
    expect(deniedOf(mounted, 's-2')).toContain(MANAGE_TOOLS[0]);
  });

  it('DIY 模式默认开 manage + diy；显式收掉之后不再默认开回来', async () => {
    const { mounted, registered } = mount();

    expect(new Set(deniedOf(mounted, 's-1', 'workbench-diy'))).toEqual(new Set(['workbench_board_x_list', 'workbench_board_x_do']));
    await call(registered, TOOLBOX_CLOSE_TOOL, { targets: ['diy'] }, 's-1');
    expect(deniedOf(mounted, 's-1', 'workbench-diy')).toEqual([
      ...DIY_PACK_TOOLS,
      'workbench_board_x_list',
      'workbench_board_x_do',
    ]);
    expect(deniedOf(mounted, 's-1', 'workbench-diy')).not.toContain(MANAGE_TOOLS[0]);
  });

  it('★ 旧 dsh 没有会话 id：包全开，开包工具只回一句"不用开"', async () => {
    const { mounted, registered } = mount();

    expect(deniedOf(mounted, null)).toEqual([]);
    const result = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['manage'] });
    expect(String(result['text'])).toContain('全部可用');
  });

  it('未知 target：不开任何包，返回合法候选', async () => {
    const { mounted, registered } = mount();

    const result = await call(registered, TOOLBOX_OPEN_TOOL, { targets: ['unit:nope'] }, 's-1');

    expect(String(result['text'])).toContain('unit:board-x');
    expect(deniedOf(mounted, 's-1')).toContain(MANAGE_TOOLS[0]);
  });

  it('list 目录：外壳两个包 + 板子上的单元包，带工具数与读写数', async () => {
    const { registered } = mount();

    const listed = await call(registered, TOOLBOX_LIST_TOOL, {}, 's-1');
    const text = String(listed['text']);

    expect(text).toContain('manage');
    expect(text).toContain('diy');
    expect(text).toContain('unit:board-x');
    expect(text).toContain('工作台管理');
    expect(text).toContain('2 把：读 1 / 写 1');
  });
});

describe('开包审批：elevates 走同一套审批闸', () => {
  it('合法开包：ask，标题点名第一个包与数量；详情座那一份交给座位', async () => {
    const { mounted } = mount();
    const approvalCall = { name: TOOLBOX_OPEN_TOOL, arguments: { targets: ['manage', 'unit:board-x'] } };
    const policy = mounted.needsApproval;

    const decision = await approvalFor(approvalCall, {
      writes: false,
      elevates: true,
      ...(policy === undefined ? {} : { policy }),
    });

    expect(decision?.kind).toBe('ask');
    expect(decision?.kind === 'ask' ? decision.displayReason.zh : '').toContain('工作台管理');
    expect(decision?.kind === 'ask' ? decision.displayReason.zh : '').toContain('2 个工具包');
  });

  it('非法目标：审批之前就 blocked（不给用户看一个注定失败的按钮）', async () => {
    const { mounted } = mount();
    const approvalCall = { name: TOOLBOX_OPEN_TOOL, arguments: { targets: ['unit:nope', 'manage'] } };

    const decision = await approvalFor(approvalCall, {
      writes: false,
      elevates: true,
      ...(mounted.needsApproval === undefined ? {} : { policy: mounted.needsApproval }),
    });

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('unit:board-x');
  });

  it('没给 targets：审批前 blocked，提示要给 targets', async () => {
    const { mounted } = mount();
    const approvalCall = { name: TOOLBOX_OPEN_TOOL, arguments: { targets: [] } };

    const decision = await approvalFor(approvalCall, {
      writes: false,
      elevates: true,
      ...(mounted.needsApproval === undefined ? {} : { policy: mounted.needsApproval }),
    });

    expect(decision?.kind).toBe('deny');
  });

  it('全权限跳过 ask：skipAsk 对抬工具面同样生效', async () => {
    const { mounted } = mount();
    const approvalCall = { name: TOOLBOX_OPEN_TOOL, arguments: { targets: ['manage'] } };

    const decision = await approvalFor(approvalCall, {
      writes: false,
      elevates: true,
      skipAsk: true,
      ...(mounted.needsApproval === undefined ? {} : { policy: mounted.needsApproval }),
    });

    expect(decision).toBeUndefined();
  });
});
