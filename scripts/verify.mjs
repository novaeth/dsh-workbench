#!/usr/bin/env node
import { execaSync } from 'execa';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify.sh', import.meta.url));

if (process.platform === 'win32') {
  process.stderr.write(
    'verify：这份验收脚本要 bash（里面有 diff 与 shasum），Windows 上请在 Git Bash 或 WSL 里跑：\n' +
      '  bash scripts/verify.sh\n',
  );
  process.exit(1);
}

const result = execaSync(script, process.argv.slice(2), { stdio: 'inherit', reject: false });
process.exit(result.exitCode ?? 1);
