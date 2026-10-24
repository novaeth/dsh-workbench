import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const WEB_PATCH = `# 你的补丁层
- id: web
  config:
    searchProvider: exa

- insert:
    - id: web-search-exa
      name: '@deepseek-ai/dsh-web-search-exa'

- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      acme-llm:
        apiKeyEnv: DEMO_LLM_API_KEY
`;

export const OWN_PATCH = `# 工作台
- id: session-persistence-jsonl
  name: '@deepseek-ai/dsh-session-persistence-jsonl'
  config:
    root: !!js dshHomePath('workbench/sessions')

- id: ui-theme
  name: "@deepseek-ai/dsh-client-ui-theme"
  config:
    preference: dark
`;

export const ASSET_PATCH = `- insert:
    - id: usage-report
      name: ./plugins/report-usage.js
      config:
        label: usage
`;

export const DIR_PATCH = `- insert:
    - id: usage-dir
      name: ./plugins/usage-report
`;

export const OUTSIDE_PATCH = `- insert:
    - id: outside-plugin
      name: ../outside-plugin.js
`;

export function homeOf(): string {
  const home = mkdtempSync(join(tmpdir(), 'wb-sync-'));
  for (const name of ['web', 'workbench']) {
    mkdirSync(join(home, 'profiles', name, 'node_modules'), { recursive: true });
    writeFileSync(join(home, 'profiles', name, 'package.json'), JSON.stringify({ name }), 'utf8');
  }
  writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), WEB_PATCH, 'utf8');
  writeFileSync(join(home, 'profiles', 'workbench', 'cordis.patch.yml'), OWN_PATCH, 'utf8');
  writeFileSync(
    join(home, 'profiles', 'web', 'package.json'),
    JSON.stringify({ name: 'web', dependencies: { '@deepseek-ai/dsh-web-search-exa': '1.0.0' } }),
    'utf8',
  );
  return home;
}

export function homeWithAsset(content = 'export const usage = 1;\n'): string {
  const home = homeOf();
  const plugins = join(home, 'profiles', 'web', 'plugins');
  mkdirSync(plugins, { recursive: true });
  writeFileSync(join(plugins, 'report-usage.js'), content, 'utf8');
  writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), `${WEB_PATCH}\n${ASSET_PATCH}`, 'utf8');
  return home;
}

export function homeWithPluginDir(): string {
  const home = homeOf();
  const plugins = join(home, 'profiles', 'web', 'plugins', 'usage-report');
  mkdirSync(plugins, { recursive: true });
  writeFileSync(join(plugins, 'index.js'), 'export const index = 1;\n', 'utf8');
  writeFileSync(join(plugins, 'helper.js'), 'export const helper = 1;\n', 'utf8');
  writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), `${WEB_PATCH}\n${DIR_PATCH}`, 'utf8');
  return home;
}
