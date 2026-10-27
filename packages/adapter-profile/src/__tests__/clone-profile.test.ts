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

- id: session-persistence-jsonl
  config:
    root: !!js dshHomePath('workbench/sessions')

- insert:
    - id: web-search-exa
      name: '@deepseek-ai/dsh-web-search-exa'

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
    `- id: sandbox-policy
  config:
    workspaceRoot: !!js dshHomePath('workbench')
`,
    'utf8',
  );
  return home;
}

function run(home: string, settings: boolean): string {
  return execFileSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DSH_HOME: home,
      DSH_WORKBENCH_HOME: join(home, 'wb2'),
      WB_SOURCE_PROFILE: 'web',
      WB_TARGET_PROFILE: 'wb2',
      WB_COPY_SETTINGS: settings ? '1' : '0',
    },
  });
}

describe('clone-profile：从已有 profile 初始化新工作台', () => {
  it('只同步改已有插件的设置行、重写 workbench 路径；插件行与隔离行都不同步', () => {
    const home = homeOf();
    const output = run(home, true);
    expect(output).toContain('设置行：复制 2');
    expect(output).toContain('挂新插件的 2 行不同步');
    const patch = readFileSync(join(home, 'profiles', 'wb2', 'cordis.patch.yml'), 'utf8');
    expect(patch).toContain('searchProvider: exa');
    expect(patch).toContain("dshHomePath('wb2/custom')");
    expect(patch).not.toContain("dshHomePath('workbench/custom')");
    expect(patch).not.toContain('- insert:');
    expect(patch).not.toContain('plugins/usage.js');
    expect(patch).not.toContain('dsh-web-search-exa');
    expect(patch).not.toContain('session-persistence-jsonl');
    expect(patch.match(/id: sandbox-policy/g)).toHaveLength(1);
    expect(existsSync(join(home, 'profiles', 'wb2', 'plugins'))).toBe(false);
  });

  it('不复制会话 / 项目 / 附件（跟 web 共用一份数据根）', () => {
    const home = homeOf();
    mkdirSync(join(home, 'web', 'sessions', 's1'), { recursive: true });
    mkdirSync(join(home, 'web', 'storages'), { recursive: true });
    writeFileSync(join(home, 'web', 'sessions', 's1', 'a.jsonl'), 'hello\n', 'utf8');
    writeFileSync(join(home, 'web', 'storages', 'workspace.json'), '{}', 'utf8');
    run(home, true);
    expect(existsSync(join(home, 'wb2', 'sessions'))).toBe(false);
    expect(existsSync(join(home, 'wb2', 'storages'))).toBe(false);
    expect(existsSync(join(home, 'wb2', 'attachments'))).toBe(false);
  });

  it('不并来源依赖（插件行都不同步，装了也没人挂载）', () => {
    const home = homeOf();
    run(home, true);
    const manifest = JSON.parse(readFileSync(join(home, 'profiles', 'wb2', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies).toEqual({ '@dsh-workbench/core': '^0.3.11' });
  });

  it('设置也能不同步（--no-settings）', () => {
    const home = homeOf();
    run(home, false);
    const patch = readFileSync(join(home, 'profiles', 'wb2', 'cordis.patch.yml'), 'utf8');
    expect(patch).not.toContain('searchProvider: exa');
  });
});
