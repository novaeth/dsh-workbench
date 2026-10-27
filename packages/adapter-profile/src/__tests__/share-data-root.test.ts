import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../../../../packages/core', 'scripts', 'share-data-root.mjs');

const LEGACY_ROWS = `# workbench profile 的会话/存储隔离层（片段）。

- id: session-persistence-jsonl
  name: '@deepseek-ai/dsh-session-persistence-jsonl'
  config:
    root: !!js (process.env.DSH_WORKBENCH_HOME ?? dshHomePath('workbench')) + '/sessions'

- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: !!js (process.env.DSH_WORKBENCH_HOME ?? dshHomePath('workbench')) + '/storages'

- id: attachment-local
  name: '@deepseek-ai/dsh-attachment-local'
  config:
    dshHome: !!js process.env.DSH_WORKBENCH_HOME ?? dshHomePath('workbench')
`;

function homeOf(rows: string): string {
  const home = mkdtempSync(join(tmpdir(), 'wb-share-'));
  mkdirSync(join(home, 'profiles', 'workbench'), { recursive: true });
  writeFileSync(join(home, 'profiles', 'workbench', 'package.json'), JSON.stringify({ name: 'workbench' }), 'utf8');
  const body = rows.trim() === '' ? '# banner\n[]\n' : `# banner\n\n${rows}`;
  writeFileSync(join(home, 'profiles', 'workbench', 'cordis.patch.yml'), body, 'utf8');
  return home;
}

function runResult(home: string, args: string[] = [], profile = 'workbench') {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DSH_HOME: home,
      WORKBENCH_PROFILE: profile,
      DSH_WORKBENCH_HOME: join(home, profile),
    },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function run(home: string, args: string[] = [], profile = 'workbench'): string {
  const result = runResult(home, args, profile);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function patchOf(home: string, profile = 'workbench'): string {
  return readFileSync(join(home, 'profiles', profile, 'cordis.patch.yml'), 'utf8');
}

type WorkspaceRecord = {
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
};

type WorkspaceDoc = {
  global: {
    initialized?: boolean;
    workspaceIds: string[];
    archivedSessionIds?: string[];
    defaultWorkspaceId?: string;
  };
  tables: { workspaces: Record<string, WorkspaceRecord> };
};

function workspaceRecord(path: string, ...sessionIds: string[]): WorkspaceRecord {
  return {
    path,
    title: path,
    sessionIds,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function workspaceDoc(order: string[], records: Record<string, WorkspaceRecord>): string {
  return JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: order },
    tables: { workspaces: records },
  });
}

function readWorkspace(home: string): WorkspaceDoc {
  return JSON.parse(readFileSync(join(home, 'storages', 'workspace.json'), 'utf8')) as WorkspaceDoc;
}

function writeSourceWorkspace(home: string, order: string[], records: Record<string, WorkspaceRecord>): void {
  mkdirSync(join(home, 'workbench', 'storages'), { recursive: true });
  writeFileSync(join(home, 'workbench', 'storages', 'workspace.json'), workspaceDoc(order, records), 'utf8');
}

function expectConsistent(doc: WorkspaceDoc): void {
  const table = doc.tables.workspaces;
  for (const id of doc.global.workspaceIds) expect(table[id], `order references missing '${id}'`).toBeDefined();
  if (doc.global.initialized === true) {
    expect(doc.global.workspaceIds).toHaveLength(Object.keys(table).length);
  }
  const paths = new Set<string>();
  const sessions = new Set<string>();
  for (const [id, record] of Object.entries(table)) {
    expect(paths.has(record.path), `path '${record.path}' claimed twice ('${id}')`).toBe(false);
    paths.add(record.path);
    for (const sessionId of record.sessionIds) {
      expect(sessions.has(sessionId), `session '${sessionId}' accounted twice ('${id}')`).toBe(false);
      sessions.add(sessionId);
    }
  }
}

describe('share-data-root：旧数据由用户显式迁移', () => {
  it('没有旧数据时，启动只切配置、不写标记', () => {
    const home = homeOf(`${LEGACY_ROWS}
- id: llm-deepseek
  config:
    model: x
`);

    const output = run(home);
    expect(output).toContain('数据根改回共用');
    const patch = patchOf(home);
    expect(patch).not.toContain('session-persistence-jsonl');
    expect(patch).not.toContain('会话/存储隔离层');
    expect(patch).not.toContain('storage-json');
    expect(patch).not.toContain('attachment-local');
    expect(patch).toContain('id: llm-deepseek');
    expect(patch.match(/id: sandbox-policy/g)).toHaveLength(1);
    expect(existsSync(join(home, 'workbench', '.data-root-shared'))).toBe(false);
  });

  it('有旧数据时，启动保持隔离、不并数据，只提示 migrate', () => {
    const home = homeOf(LEGACY_ROWS);
    mkdirSync(join(home, 'workbench', 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(home, 'workbench', 'sessions', 'w1', 's1.jsonl'), 'old\n', 'utf8');
    writeSourceWorkspace(home, ['w1'], { w1: workspaceRecord('/x', 's1') });

    const result = runResult(home);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('dsh-workbench migrate');
    expect(patchOf(home)).toContain('id: session-persistence-jsonl');
    expect(existsSync(join(home, 'sessions'))).toBe(false);
    expect(existsSync(join(home, 'storages', 'workspace.json'))).toBe(false);
    expect(existsSync(join(home, 'workbench', '.data-root-shared'))).toBe(false);
  });

  it('migrate 显式合并会话 / 项目 / 附件，并写标记', () => {
    const home = homeOf(`${LEGACY_ROWS}
- id: llm-deepseek
  config:
    model: x
`);
    mkdirSync(join(home, 'workbench', 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(home, 'workbench', 'sessions', 'w1', 's1.jsonl'), 'old\n', 'utf8');
    mkdirSync(join(home, 'workbench', 'attachments', 'v1', 'objects', 'aa'), { recursive: true });
    writeFileSync(join(home, 'workbench', 'attachments', 'v1', 'objects', 'aa', 'o'), 'obj\n', 'utf8');
    writeSourceWorkspace(home, ['w1'], { w1: workspaceRecord('/x', 's1') });
    mkdirSync(join(home, 'storages'), { recursive: true });
    writeFileSync(join(home, 'storages', 'workspace.json'), workspaceDoc(['w2'], { w2: workspaceRecord('/x', 's2') }), 'utf8');
    mkdirSync(join(home, 'storages', 'kept'), { recursive: true });
    writeFileSync(join(home, 'storages', 'kept', 'k'), 'keep\n', 'utf8');

    const output = run(home, ['--migrate']);
    expect(output).toContain('迁移完成');
    const patch = patchOf(home);
    expect(patch).not.toContain('session-persistence-jsonl');
    expect(patch).toContain('id: llm-deepseek');
    expect(patch.match(/id: sandbox-policy/g)).toHaveLength(1);
    expect(existsSync(join(home, 'workbench', '.data-root-shared'))).toBe(true);
    expect(readFileSync(join(home, 'sessions', 'w1', 's1.jsonl'), 'utf8')).toBe('old\n');
    expect(readFileSync(join(home, 'attachments', 'v1', 'objects', 'aa', 'o'), 'utf8')).toBe('obj\n');
    expect(readFileSync(join(home, 'storages', 'kept', 'k'), 'utf8')).toBe('keep\n');
    const merged = readWorkspace(home);
    expect(merged.global.workspaceIds).toEqual(['w2']);
    expect(merged.tables.workspaces['w2']?.sessionIds).toEqual(['s2', 's1']);
    expectConsistent(merged);
  });

  it('migrate 不同 path 的项目补进顺序，同 path 的旧 id 不留', () => {
    const home = homeOf(LEGACY_ROWS);
    writeSourceWorkspace(home, ['w1', 'w2', 'w3'], {
      w1: workspaceRecord('/a', 'w1s'),
      w2: workspaceRecord('/same', 'w2s'),
      w3: workspaceRecord('/c', 'w3s'),
    });
    mkdirSync(join(home, 'storages'), { recursive: true });
    writeFileSync(
      join(home, 'storages', 'workspace.json'),
      workspaceDoc(['t1', 't2'], {
        t1: workspaceRecord('/same', 't1s'),
        t2: workspaceRecord('/b', 't2s'),
      }),
      'utf8',
    );

    run(home, ['--migrate']);
    const merged = readWorkspace(home);
    expect(merged.global.workspaceIds).toEqual(['t1', 't2', 'w1', 'w3']);
    expect(merged.global.workspaceIds).not.toContain('w2');
    expect(merged.tables.workspaces['t1']?.sessionIds).toEqual(['t1s', 'w2s']);
    expect(merged.tables.workspaces['w1']?.sessionIds).toEqual(['w1s']);
    expect(merged.tables.workspaces['w3']?.sessionIds).toEqual(['w3s']);
    expectConsistent(merged);
  });

  it('migrate 时同一个会话只记在一个项目里', () => {
    const home = homeOf(LEGACY_ROWS);
    writeSourceWorkspace(home, ['w1'], { w1: workspaceRecord('/moved', 'shared') });
    mkdirSync(join(home, 'storages'), { recursive: true });
    writeFileSync(join(home, 'storages', 'workspace.json'), workspaceDoc(['t1'], { t1: workspaceRecord('/old', 'shared') }), 'utf8');

    run(home, ['--migrate']);
    const merged = readWorkspace(home);
    expect(merged.tables.workspaces['t1']?.sessionIds).toEqual(['shared']);
    expect(merged.tables.workspaces['w1']?.sessionIds).toEqual([]);
    expectConsistent(merged);
  });

  it('同名文件不覆盖共用根里已有的那份', () => {
    const home = homeOf(LEGACY_ROWS);
    mkdirSync(join(home, 'workbench', 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(home, 'workbench', 'sessions', 'w1', 's1.jsonl'), 'workbench\n', 'utf8');
    mkdirSync(join(home, 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(home, 'sessions', 'w1', 's1.jsonl'), 'web\n', 'utf8');

    run(home, ['--migrate']);
    expect(readFileSync(join(home, 'sessions', 'w1', 's1.jsonl'), 'utf8')).toBe('web\n');
  });

  it('迁移过一次后不重跑，--force 才补并漏掉的项目', () => {
    const home = homeOf(LEGACY_ROWS);
    writeSourceWorkspace(home, ['w1'], { w1: workspaceRecord('/a', 's1') });
    run(home, ['--migrate']);
    writeSourceWorkspace(home, ['w1', 'w9'], { w1: workspaceRecord('/a', 's1'), w9: workspaceRecord('/new', 's9') });

    const second = runResult(home, ['--migrate']);
    expect(second.stdout).toContain('不在共用根');
    expect(readWorkspace(home).tables.workspaces['w9']).toBeUndefined();

    run(home, ['--migrate', '--force']);
    const forced = readWorkspace(home);
    expect(forced.tables.workspaces['w9']?.sessionIds).toEqual(['s9']);
    expectConsistent(forced);
  });

  it('有一次没做完的项目操作时 migrate 中止，不写标记也不切配置', () => {
    const home = homeOf(LEGACY_ROWS);
    writeSourceWorkspace(home, ['w2'], { w2: workspaceRecord('/b', 's2') });
    mkdirSync(join(home, 'storages'), { recursive: true });
    const pending = {
      unit: { name: 'workspace', version: 2 },
      global: {
        initialized: true,
        workspaceIds: [],
        pendingMutation: { operation: 'delete', workspaceId: 'w1' },
      },
      tables: { workspaces: { w1: workspaceRecord('/a', 's1') } },
    };
    const before = JSON.stringify(pending);
    writeFileSync(join(home, 'storages', 'workspace.json'), before, 'utf8');

    const result = runResult(home, ['--migrate']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('没有迁移');
    expect(readFileSync(join(home, 'storages', 'workspace.json'), 'utf8')).toBe(before);
    expect(patchOf(home)).toContain('id: session-persistence-jsonl');
    expect(existsSync(join(home, 'workbench', '.data-root-shared'))).toBe(false);
  });

  it('旧版本留下的坏项目顺序在启动时修好', () => {
    const home = homeOf(LEGACY_ROWS);
    mkdirSync(join(home, 'storages'), { recursive: true });
    writeFileSync(
      join(home, 'storages', 'workspace.json'),
      workspaceDoc(['w1', 'w2'], { w1: workspaceRecord('/a', 's1'), w2: workspaceRecord('/b', 's2') }),
      'utf8',
    );
    run(home);
    const broken = readWorkspace(home);
    broken.global.workspaceIds = ['w1', 'ghost'];
    writeFileSync(join(home, 'storages', 'workspace.json'), JSON.stringify(broken), 'utf8');

    run(home);
    const fixed = readWorkspace(home);
    expect(fixed.global.workspaceIds).toEqual(['w1', 'w2']);
    expectConsistent(fixed);
  });

  it('第二次跑一个字节都不写', () => {
    const home = homeOf(LEGACY_ROWS);
    run(home);
    const before = patchOf(home);
    const second = run(home);
    expect(second).toBe('');
    expect(patchOf(home)).toBe(before);
  });

  it('自己改过的数据根不动，也不并数据', () => {
    const home = homeOf(`- id: session-persistence-jsonl
  config:
    root: /mnt/custom/sessions
`);
    mkdirSync(join(home, 'workbench', 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(home, 'workbench', 'sessions', 'w1', 's1.jsonl'), 'old\n', 'utf8');

    const result = runResult(home);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('自己改过');
    expect(patchOf(home)).toContain('id: session-persistence-jsonl');
    expect(existsSync(join(home, 'sessions'))).toBe(false);

    const migrated = runResult(home, ['--migrate']);
    expect(migrated.status).toBe(1);
    expect(patchOf(home)).toContain('id: session-persistence-jsonl');
  });

  it('profile 还没建时不写任何东西', () => {
    const home = mkdtempSync(join(tmpdir(), 'wb-share-'));
    expect(run(home)).toBe('');
    expect(existsSync(join(home, 'profiles'))).toBe(false);
  });
});
