import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared/host';
import { UNITS_SERVICE } from '@dsh-workbench/shared/host';
import { diagHistoryOf, DIAG_HISTORY_LIMIT, registerDiagTools } from '../diag-tool';
import type { DiagHost, DiagReadResult, DiagRecord } from '@dsh-workbench/shared/host';

function recordOf(ts: number, code = 'MODULE_UNREADABLE', corrId = `c-${String(ts)}`): DiagRecord {
  return { ts, level: 'warn', code, class: 'user', area: 'market', corrId } as DiagRecord;
}

const DESKTOP: DiagHost = { profile: 'desktop', deployment: 'desktop', pid: 999 };

function withHost(record: DiagRecord, host: DiagHost): DiagRecord {
  return { ...record, host };
}

function writeShard(root: string, records: readonly DiagRecord[]): void {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(root, 'diagnostics', 'records');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `record-${day}-999-desktop.jsonl`), `${records.map((one) => JSON.stringify(one)).join('\n')}\n`);
}

describe('诊断工具：常驻且只读', () => {
  it('★ 历史：落盘的记录补在内存之后，重复的不重复算，最多留最近 20 条', () => {
    const memory = [recordOf(3)];
    const disk: DiagReadResult = {
      records: [recordOf(1), recordOf(2), recordOf(3)],
      read: 30,
      skipped: 1,
    };

    const history = diagHistoryOf(memory, disk);

    expect(history?.records.map((one) => one.ts)).toEqual([1, 2]);
    expect(history?.read).toBe(30);
    expect(history?.skipped).toBe(1);
    const many: DiagReadResult = {
      records: Array.from({ length: DIAG_HISTORY_LIMIT + 5 }, (_, index) => recordOf(index + 10)),
      read: DIAG_HISTORY_LIMIT + 5,
      skipped: 0,
    };
    expect(diagHistoryOf([], many)?.records).toHaveLength(DIAG_HISTORY_LIMIT);
    expect(diagHistoryOf([], undefined)).toBeUndefined();
    const desktopDisk: DiagReadResult = {
      records: [withHost(recordOf(1), DESKTOP), withHost(recordOf(2), DESKTOP)],
      read: 2,
      skipped: 0,
    };
    expect(diagHistoryOf([], desktopDisk, DIAG_HISTORY_LIMIT, 'desktop')?.records).toHaveLength(2);
    expect(diagHistoryOf([], desktopDisk, DIAG_HISTORY_LIMIT, 'web')?.records).toHaveLength(0);
    expect(diagHistoryOf([], desktopDisk, DIAG_HISTORY_LIMIT, '*')?.records).toHaveLength(2);
  });

  it('★ 默认当前工作台；host 指定另一份或 * 可读，others 报出别的来源', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-host-'));
    writeShard(root, [withHost(recordOf(1), DESKTOP), withHost(recordOf(2), DESKTOP)]);
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const ctx = { get: (name: string) => (name === 'tools' ? tools : undefined) } as unknown as DshHostContext;
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    registerDiagTools(ctx);

    const current = (await registered[0]?.execute({}, {} as never)) as Record<string, unknown>;
    expect(current['view']).toBe('current');
    expect(current['hosts']).toEqual(['desktop', 'unknown']);
    expect(current['others']).toEqual([{ host: 'desktop', count: 2, lastAt: 2 }]);
    expect((current['history'] as { records: unknown[] }).records).toHaveLength(0);

    const other = (await registered[0]?.execute({ host: 'desktop' }, {} as never)) as Record<string, unknown>;
    expect(other['view']).toBe('other');
    expect(other['records']).toBeUndefined();
    expect((other['history'] as { records: unknown[] }).records).toHaveLength(2);

    const all = (await registered[0]?.execute({ host: '*' }, {} as never)) as Record<string, unknown>;
    expect(all['view']).toBe('all');
    expect(all['countsByHost']).toEqual([{ host: 'desktop', count: 2, lastAt: 2 }]);
    expect((all['history'] as { records: unknown[] }).records).toHaveLength(2);

    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });
  });

  it('★ 注册出 workbench_diag，执行两次结果一致（不写记录）', async () => {
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const ctx = { get: (name: string) => (name === 'tools' ? tools : undefined) } as unknown as DshHostContext;

    registerDiagTools(ctx);

    expect(registered).toHaveLength(1);
    const tool = registered[0];
    expect(tool?.name).toBe('workbench_diag');
    const first = await tool?.execute({}, {} as never);
    const second = await tool?.execute({}, {} as never);
    expect(Array.isArray((first as { records: unknown[] }).records)).toBe(true);
    expect((first as { shown: number }).shown).toBe(0);
    expect(second).toEqual(first);
  });
});

describe('诊断工具：带上启动检查快照', () => {
  function executeWith(root: string): Promise<Record<string, unknown>> {
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const ctx = { get: (name: string) => (name === 'tools' ? tools : undefined) } as unknown as DshHostContext;
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    registerDiagTools(ctx);
    return Promise.resolve(registered[0]?.execute({}, {} as never) as Promise<Record<string, unknown>>);
  }

  it('★ preflight.json 在 → 带回症状摘要（带证据文件路径），不把日志塞给 agent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-preflight-'));
    writeFileSync(
      join(root, 'preflight.json'),
      JSON.stringify({
        phase: 'ready',
        at: 1,
        steps: [
          { id: 'cli', status: 'ok', detail: '2.0.3', log: ['> opencli --version', '2.0.3'] },
          { id: 'diy', status: 'warn', detail: 'tool-schedule: never started', log: ['x', 'y'] },
        ],
        diyGap: { kind: 'broken-row', rows: ['tool-schedule'], detail: 'tool-schedule: never started' },
      }),
    );
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    const preflight = result['preflight'] as Record<string, unknown>;
    expect(preflight['phase']).toBe('ready');
    expect(preflight['diy']).toMatchObject({ kind: 'broken-row', rows: ['tool-schedule'] });
    expect(preflight['evidence']).toContain('preflight.json');
    expect(preflight['steps']).toEqual([
      { id: 'cli', status: 'ok', detail: '2.0.3' },
      { id: 'diy', status: 'warn', detail: 'tool-schedule: never started' },
    ]);
    expect(JSON.stringify(preflight)).not.toContain('opencli --version');
  });

  it('★ 快照里的来源不是当前工作台时标出来，不冒充当前', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-preflight-host-'));
    writeFileSync(
      join(root, 'preflight.json'),
      JSON.stringify({
        phase: 'ready',
        at: 5,
        steps: [],
        hostFacts: { profileDir: '/Users/me/.dsh/profiles/desktop' },
      }),
    );
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['preflight']).toMatchObject({ from: 'desktop', at: 5 });
  });

  it('★ 返回值能原样过一遍 JSON：没有 undefined 属性（线上工具面按这个判据收结果）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-json-'));
    writeFileSync(
      join(root, 'preflight.json'),
      JSON.stringify({
        phase: 'ready',
        at: 1,
        steps: [
          { id: 'host', status: 'ok', detail: null },
          { id: 'warm', status: 'warn' },
        ],
      }),
    );
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    const steps = (result['preflight'] as Record<string, unknown>)['steps'] as Array<Record<string, unknown>>;
    expect(steps.map((step) => Object.keys(step).sort())).toEqual([
      ['detail', 'id', 'status'],
      ['id', 'status'],
    ]);
  });

  it('★ 快照坏了 → null（一个坏文件不该让诊断工具失败）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-preflight-bad-'));
    writeFileSync(join(root, 'preflight.json'), '{not json');
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['preflight']).toBeNull();
  });

  it('★ 还没有快照 → null（不抛、不冒充空对象）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-preflight-empty-'));
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['preflight']).toBeNull();
  });

  it('★ 带上工作台拒绝的模块清单：被拒的模块在诊断里一眼看见', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-refusals-'));
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const units = {
      refusals: () => [
        { unit: 'jj-news', pkg: '@pkg/module-jj-news', reasons: ['dsh.workbench.apiVersion 是 1，这里只认 3'] },
        { unit: 'ghost', reasons: ['没装进这份 profile'] },
      ],
    };
    const ctx = {
      get: (name: string) =>
        name === 'tools' ? tools : name === UNITS_SERVICE ? units : undefined,
    } as unknown as DshHostContext;
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    registerDiagTools(ctx);
    const result = await registered[0]?.execute({}, {} as never);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect((result as { refusals: unknown }).refusals).toEqual([
      { unit: 'jj-news', pkg: '@pkg/module-jj-news', reasons: ['dsh.workbench.apiVersion 是 1，这里只认 3'] },
      { unit: 'ghost', reasons: ['没装进这份 profile'] },
    ]);
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });
});

describe('诊断工具：按关联号与最近窗口取', () => {
  function toolWith(root: string, units?: unknown): DshToolDefinition {
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const ctx = {
      get: (name: string) => (name === 'tools' ? tools : name === UNITS_SERVICE ? units : undefined),
    } as unknown as DshHostContext;
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    registerDiagTools(ctx);
    return registered[0] as DshToolDefinition;
  }


  function writeOwn(root: string, records: readonly DiagRecord[]): void {
    const day = new Date().toISOString().slice(0, 10);
    const dir = join(root, 'diagnostics', 'records');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `record-${day}-999.jsonl`), `${records.map((one) => JSON.stringify(one)).join('\n')}\n`);
  }

  it('★★ 关联号能从磁盘历史里精确取回一条，headline 同一条', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-corr-'));
    writeOwn(root, [recordOf(1, 'READ_FAILED', 'c-hit')]);
    const tool = toolWith(root);
    const result = (await tool.execute({ corrId: 'c-hit' }, {} as never)) as Record<string, unknown>;
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    const records = result['records'] as Array<{ corrId: string }>;
    expect(records.map((one) => one.corrId)).toEqual(['c-hit']);
    expect((result['headline'] as { corrId: string }).corrId).toBe('c-hit');
  });

  it('★ headline 取最新的一条失败，recent 只回看窗口内', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-headline-'));
    const now = Date.now();
    writeOwn(root, [
      recordOf(now - 60 * 60 * 1000, 'READ_FAILED', 'c-old'),
      recordOf(now - 1000, 'ACTION_FAILED', 'c-new'),
    ]);
    const tool = toolWith(root);
    const result = (await tool.execute({}, {} as never)) as Record<string, unknown>;
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect((result['headline'] as { corrId: string }).corrId).toBe('c-new');
    expect((result['recent'] as Array<{ corrId: string }>).map((one) => one.corrId)).toEqual(['c-new']);
  });

  it('★ 历史超过上限时带 truncated，不再静默丢', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-trunc-'));
    writeOwn(root, Array.from({ length: 25 }, (_, index) => recordOf(1000 + index, 'READ_FAILED', 'c-' + String(index))));
    const tool = toolWith(root);
    const result = (await tool.execute({}, {} as never)) as Record<string, unknown>;
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    const history = result['history'] as { records: unknown[]; truncated: boolean };
    expect(history.records).toHaveLength(20);
    expect(history.truncated).toBe(true);
    expect(result['truncated']).toEqual({ memory: false, history: true });
  });

  it('★ 磁盘读不了：说 unavailable 并带上原因，不冒充没有记录', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-eacces-'));
    writeShard(root, [recordOf(1, 'READ_FAILED', 'c-locked')]);
    const dir = join(root, 'diagnostics', 'records');
    const file = join(dir, readdirSync(dir)[0] as string);
    chmodSync(file, 0o000);
    const tool = toolWith(root);
    const result = (await tool.execute({}, {} as never)) as Record<string, unknown>;
    chmodSync(file, 0o644);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['disk']).toBe('unavailable');
    expect(String(result['diskError'])).toContain('EACCES');
  });

  it('★ 模块拒收读取抛错：工具不整体失败，给出 refusalsError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-refusals-error-'));
    const tool = toolWith(root, {
      refusals: () => {
        throw new Error('registry down');
      },
    });
    const result = (await tool.execute({}, {} as never)) as Record<string, unknown>;
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['refusalsError']).toBe('registry down');
    expect(result['refusals']).toBeUndefined();
  });

  it('★ 自更新那种带来源的记录：默认视图的 headline 能看到，不再被 unknown 过滤', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-self-update-'));
    const day = new Date().toISOString().slice(0, 10);
    const dir = join(root, 'diagnostics', 'records');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `record-${day}-9-workbench.jsonl`),
      `${JSON.stringify({ ...recordOf(1, 'SELF_UPDATE_FAILED', 'c-self'), host: { profile: 'workbench', deployment: 'web', pid: 9 } })}\n`,
    );
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const ctx = {
      get: (name: string) =>
        name === 'tools' ? tools : name === 'profileContext' ? { dir: '/tmp/workbench' } : undefined,
    } as unknown as DshHostContext;
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    registerDiagTools(ctx);
    const result = (await registered[0]?.execute({}, {} as never)) as Record<string, unknown>;
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['host']).toBe('workbench');
    expect((result['headline'] as { code: string }).code).toBe('SELF_UPDATE_FAILED');
    expect((result['history'] as { records: unknown[] }).records).toHaveLength(1);
  });
});

