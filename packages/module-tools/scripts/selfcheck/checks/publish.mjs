import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, PACKAGES_DIR, linkToolchain } from '../lib.mjs';

export const checks = [
  {
    title: 'publish：清单绿 / files 漏了产物就红（发货前最后一道）',
    run(ctx, report) {

      const title = 'publish：清单绿 / files 漏了产物就红（发货前最后一道）';
      const probe = mkdtempSync(join(PACKAGES_DIR, '.pub-'));

      const env = { ...process.env, DSH_WB_ROOT: probe };
      try {
        execFileSync(process.execPath, [BIN, 'init', 'demo', '--dir', probe, '--template', 'diy'], { stdio: 'pipe' });
        linkToolchain(ctx.toolchain, join(probe, 'node_modules'));
        symlinkSync(join(PACKAGES_DIR, 'shared'), join(probe, 'node_modules', '@dsh-workbench', 'shared'), 'dir');
        execFileSync(process.execPath, [BIN, 'publish', '--cwd', probe], { stdio: 'pipe', env });

        const manifest = JSON.parse(readFileSync(join(probe, 'package.json'), 'utf8'));
        manifest.files = manifest.files.filter((one) => one !== 'dist');
        writeFileSync(join(probe, 'package.json'), JSON.stringify(manifest, null, 2));

        let message = '';
        try {
          execFileSync(process.execPath, [BIN, 'publish', '--cwd', probe], { stdio: 'pipe', env });
        } catch (error) {
          message = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        }
        const named = message.includes('exports') || message.includes('dist');
        if (!named) throw new Error(`files 少了产物居然没报：${message.trim().split('\n').slice(-3).join(' | ')}`);
        report(title, true);
      } catch (error) {
        report(title, false, `${error.message}${error.stdout ? ` · ${String(error.stdout).trim()}` : ''}`.slice(0, 200));
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
];
