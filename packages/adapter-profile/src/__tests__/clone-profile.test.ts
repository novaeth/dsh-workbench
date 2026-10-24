import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../../../../packages/core', 'scripts', 'clone-profile.mjs');

function homeOf(): string {
  const home = mkdtempSync(join(tmpdir(), 'wb-clone-'));
  for (const name of ['web', 'wb2']) mkdirSync(join(home, 'profiles', name), { recursive: true });
  writeFileSync(
    join(home, 'profiles', 'web', 'package.json'),
    JSON.stringify({ name: 'web', dependencies: { '@deepseek-ai/dsh-web-search-exa': '1.0.0' } }),
    'utf8',
  );
  writeFileSync(
    join(home, 'profiles', 'web', 'cordis.patch.yml'),
    `- id: web
  config:
    searchProvider: exa

- id: custom
  config:
    root: !!js dshHomePath('workbench/custom')

- insert:
    - id: usage
      name: ./plugins/usage.js
`,
    'utf8',
  );
  mkdirSync(join(home, 'profiles', 'web', 'plugins'), { recursive: true });
  writeFileSync(join(home, 'profiles', 'web', 'plugins', 'usage.js'), 'export const usage = 1;\n', 'utf8');
  writeFileSync(join(home, 'profiles', 'wb2', 'package.json'), JSON.stringify({ name: 'wb2', dependencies: { '@dsh-workbench/core': '^0.3.11' } }), 'utf8');
  writeFileSync(
    join(home, 'profiles', 'wb2', 'cordis.patch.yml'),
    `- id: session-persistence-jsonl
  config:
    root: !!js process.env.DSH_WORKBENCH_HOME ? process.env.DSH_WORKBENCH_HOME + '/sessions' : dshHomePath('workbench/sessions')
`,
    'utf8',
  );
  mkdirSync(join(home, 'web', 'storages'), { recursive: true });
  mkdirSync(join(home, 'web', 'sessions', 's1'), { recursive: true });
  writeFileSync(join(home, 'web', 'storages', 'workspace.json'), JSON.stringify({ global: { workspaceIds: [] } }), 'utf8');
  writeFileSync(join(home, 'web', 'sessions', 's1', 'a.jsonl'), 'hello\n', 'utf8');
  return home;
}

function run(home: string, copy: { settings: boolean; plugins: boolean; projects: boolean; sessions: boolean }): string {
  return execFileSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DSH_HOME: home,
      DSH_WORKBENCH_HOME: join(home, 'wb2'),
      WB_SOURCE_PROFILE: 'web',
      WB_TARGET_PROFILE: 'wb2',
      WB_SOURCE_HOME: join(home, 'web'),
      WB_COPY_SETTINGS: copy.settings ? '1' : '0',
      WB_COPY_PLUGINS: copy.plugins ? '1' : '0',
      WB_COPY_PROJECTS: copy.projects ? '1' : '0',
      WB_COPY_SESSIONS: copy.sessions ? '1' : '0',
    },
  });
}

describe('clone-profile：从已有 profile 初始化新工作台', () => {
  it('复制非隔离设置行、重写 workbench 路径、搬本地文件与依赖', () => {
    const home = homeOf();
    const output = run(home, { settings: true, plugins: true, projects: false, sessions: false });
    expect(output).toContain('设置行：复制 3');
    const patch = readFileSync(join(home, 'profiles', 'wb2', 'cordis.patch.yml'), 'utf8');
    expect(patch).toContain('searchProvider: exa');
    expect(patch).toContain("dshHomePath('wb2/custom')");
    expect(patch).not.toContain("dshHomePath('workbench/custom')");
    expect(patch.match(/id: session-persistence-jsonl/g)).toHaveLength(1);
    expect(patch).toContain('process.env.DSH_WORKBENCH_HOME');
    expect(readFileSync(join(home, 'profiles', 'wb2', 'plugins', 'usage.js'), 'utf8')).toBe('export const usage = 1;\n');
    const manifest = JSON.parse(readFileSync(join(home, 'profiles', 'wb2', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.['@deepseek-ai/dsh-web-search-exa']).toBe('1.0.0');
  });

  it('只复制设置、不复制本地插件时拒绝（配置会指向不存在的文件）', () => {
    const home = homeOf();
    expect(() => run(home, { settings: true, plugins: false, projects: false, sessions: false })).toThrow(
      /不能只复制设置/,
    );
  });

  it('来源是 web 时从 $DSH_HOME 根取项目和会话（web 的数据根不是 profiles/web）', () => {
    const home = homeOf();
    mkdirSync(join(home, 'storages'), { recursive: true });
    mkdirSync(join(home, 'sessions', 's9'), { recursive: true });
    writeFileSync(join(home, 'storages', 'workspace.json'), JSON.stringify({ global: { workspaceIds: ['w'] } }), 'utf8');
    writeFileSync(join(home, 'sessions', 's9', 'b.jsonl'), 'web\n', 'utf8');
    execFileSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DSH_HOME: home,
        DSH_WORKBENCH_HOME: join(home, 'wb2'),
        WB_SOURCE_PROFILE: 'web',
        WB_TARGET_PROFILE: 'wb2',
        WB_COPY_SETTINGS: '0',
        WB_COPY_PLUGINS: '0',
        WB_COPY_PROJECTS: '1',
        WB_COPY_SESSIONS: '1',
      },
    });
    expect(existsSync(join(home, 'wb2', 'storages', 'workspace.json'))).toBe(true);
    expect(readFileSync(join(home, 'wb2', 'sessions', 's9', 'b.jsonl'), 'utf8')).toBe('web\n');
  });

  it('项目列表与会话按开关复制', () => {
    const home = homeOf();
    run(home, { settings: false, plugins: false, projects: true, sessions: true });
    expect(existsSync(join(home, 'wb2', 'storages', 'workspace.json'))).toBe(true);
    expect(readFileSync(join(home, 'wb2', 'sessions', 's1', 'a.jsonl'), 'utf8')).toBe('hello\n');
  });
});
