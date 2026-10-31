import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverPackages, workspaceRootOf } from '../../../src/discover.mjs';

const TITLE =
  '模块发现：按 pnpm-workspace / package.json workspaces 的 glob 找包（块列表含无缩进、行内数组、* 与 **、! 排除、符号链接、嵌套工作区；没有声明才退回 packages/*；不支持的 glob 明确报错）';

function makePkg(dir, name) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name, version: '0.0.0' }, null, 2)}\n`);
}

function writeYaml(root, lines) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'pnpm-workspace.yaml'), `${lines.join('\n')}\n`);
}

function namesOf(root) {
  return discoverPackages({ root })
    .map((pkg) => pkg.manifest.name)
    .sort();
}

function expectThrows(run, label, problems) {
  try {
    run();
    problems.push(`${label}：没有报错`);
  } catch {
    return;
  }
}

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const saved = process.env.DSH_WB_ROOT;
      const base = mkdtempSync(join(tmpdir(), 'dsh-wb-discover-'));
      const problems = [];
      try {
        delete process.env.DSH_WB_ROOT;
        const custom = join(base, 'custom');
        writeYaml(custom, ['packages:', '  - "modules/*"', '  - "apps/*"', '  - "!apps/skip"', '', 'onlyBuiltDependencies:', '  - esbuild']);
        makePkg(join(custom, 'modules', 'mod-a'), '@demo/mod-a');
        makePkg(join(custom, 'apps', 'app-b'), '@demo/app-b');
        makePkg(join(custom, 'apps', 'skip'), '@demo/skip');
        makePkg(join(custom, 'packages', 'legacy'), '@demo/legacy');

        const fromModule = namesOf(join(custom, 'modules', 'mod-a'));
        for (const want of ['@demo/mod-a', '@demo/app-b']) {
          if (!fromModule.includes(want)) problems.push(`自定义布局里没找到 ${want}：${fromModule.join(', ')}`);
        }
        for (const unwanted of ['@demo/skip', '@demo/legacy']) {
          if (fromModule.includes(unwanted)) problems.push(`不该被发现却出现了 ${unwanted}：${fromModule.join(', ')}`);
        }
        if (workspaceRootOf(join(custom, 'modules', 'mod-a')) !== custom) {
          problems.push(`工作区根找错了：${workspaceRootOf(join(custom, 'modules', 'mod-a'))} ≠ ${custom}`);
        }

        const indentless = join(base, 'indentless');
        writeYaml(indentless, ['packages:', '- "libs/*"']);
        makePkg(join(indentless, 'libs', 'x'), '@demo/indentless');
        if (!namesOf(join(indentless, 'libs', 'x')).includes('@demo/indentless')) {
          problems.push('无缩进的块列表没解析出来');
        }

        const flow = join(base, 'flow');
        writeYaml(flow, ['packages: ["libs/*", "apps/*"]']);
        makePkg(join(flow, 'apps', 'y'), '@demo/flow');
        if (!namesOf(join(flow, 'apps', 'y')).includes('@demo/flow')) problems.push('行内数组写法没解析出来');

        const deep = join(base, 'deep');
        writeYaml(deep, ['packages:', '  - "modules/**"']);
        makePkg(join(deep, 'modules', 'one'), '@demo/one');
        makePkg(join(deep, 'modules', 'one', 'nested'), '@demo/nested');
        const deepNames = namesOf(join(deep, 'modules', 'one'));
        for (const want of ['@demo/one', '@demo/nested']) {
          if (!deepNames.includes(want)) problems.push(`** 没发现 ${want}：${deepNames.join(', ')}`);
        }

        const linked = join(base, 'linked');
        writeYaml(linked, ['packages:', '  - "apps/*"']);
        makePkg(join(linked, 'real', 'pkg'), '@demo/linked');
        mkdirSync(join(linked, 'apps'), { recursive: true });
        symlinkSync(join(linked, 'real', 'pkg'), join(linked, 'apps', 'alias'));
        if (!namesOf(join(linked, 'apps', 'alias')).includes('@demo/linked')) problems.push('符号链接包目录被跳过了');

        const outer = join(base, 'outer');
        writeYaml(outer, ['packages:', '  - "outer/*"']);
        makePkg(join(outer, 'outer', 'pkg'), '@demo/outer');
        const inner = join(outer, 'inner');
        writeYaml(inner, ['packages:', '  - "inner/*"']);
        makePkg(join(inner, 'inner', 'pkg'), '@demo/inner');
        if (workspaceRootOf(join(inner, 'inner', 'pkg')) !== inner) problems.push('嵌套工作区没就近认内层');

        const legacy = join(base, 'legacy');
        makePkg(join(legacy, 'packages', 'one'), '@demo/one');
        if (!namesOf(join(legacy, 'packages', 'one')).includes('@demo/one')) {
          problems.push('没有 workspace 声明时没退回 packages/*');
        }

        const byManifest = join(base, 'by-manifest');
        mkdirSync(byManifest, { recursive: true });
        writeFileSync(
          join(byManifest, 'package.json'),
          `${JSON.stringify({ name: 'root', private: true, workspaces: { packages: ['libs/*'] } }, null, 2)}\n`,
        );
        makePkg(join(byManifest, 'libs', 'x'), '@demo/x');
        if (!namesOf(join(byManifest, 'libs', 'x')).includes('@demo/x')) {
          problems.push('没读 package.json workspaces 的对象形式');
        }

        const unsupported = join(base, 'unsupported');
        writeYaml(unsupported, ['packages:', '  - "{libs,apps}/*"']);
        expectThrows(() => discoverPackages({ root: unsupported }), '花括号 glob', problems);

        process.env.DSH_WB_ROOT = join(base, 'isolated');
        if (namesOf(join(custom, 'modules', 'mod-a')).length !== 0) {
          problems.push('DSH_WB_ROOT 指向空目录时仍发现了包');
        }
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        if (saved === undefined) delete process.env.DSH_WB_ROOT;
        else process.env.DSH_WB_ROOT = saved;
        rmSync(base, { recursive: true, force: true });
      }
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
