import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, PACKAGES_DIR } from '../lib.mjs';

const TITLE =
  '迁移：v1 清单 → 当前代（apiVersion 3 / workbenchFaces 补默认）；--dry-run 不写；重复跑幂等';

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const probe = mkdtempSync(join(PACKAGES_DIR, '.migrate-'));
      const file = join(probe, 'package.json');
      const problems = [];
      const run = (args) => {
        try {
          const out = execFileSync(process.execPath, [BIN, ...args], {
            cwd: probe,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const manifest = () => JSON.parse(readFileSync(file, 'utf8'));
      try {
        const init = run(['init', 'demo', '--dir', probe]);
        if (init.failed) throw new Error(`init 起不来：${init.out}`);

        const before = manifest();
        delete before.dsh.workbench.apiVersion;
        delete before.dsh.workbenchFaces;
        writeFileSync(file, JSON.stringify(before, null, 2));

        const dry = run(['migrate', '--dry-run']);
        if (dry.failed) problems.push(`dry-run 起不来：${dry.out}`);
        if (manifest().dsh.workbench.apiVersion !== undefined) problems.push('--dry-run 竟然写了 apiVersion');
        if (!dry.out.includes('apiVersion')) problems.push('--dry-run 没列出要改的项');

        const first = run(['migrate']);
        if (first.failed) problems.push(`migrate 起不来：${first.out}`);
        if (manifest().dsh.workbench.apiVersion !== 3) problems.push('apiVersion 没迁到 3');
        const faces = manifest().dsh.workbenchFaces;
        if (faces?.host !== 'src/host.ts' || faces?.client !== 'src/client.tsx') {
          problems.push(`workbenchFaces 没补默认：${JSON.stringify(faces)}`);
        }

        const again = run(['migrate']);
        if (again.failed) problems.push(`第二次 migrate 起不来：${again.out}`);
        else if (!again.out.includes('已经是当前代')) problems.push('第二次 migrate 没报「已经是当前代」（不幂等）');
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
