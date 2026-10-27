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
