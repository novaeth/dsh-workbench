import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN, linkToolchain } from '../lib.mjs';

function runCheck(probe, workshop, only) {
  try {
    const out = execFileSync(process.execPath, [BIN, 'check', '--only', only], {
      cwd: probe,
      env: { ...process.env, DSH_WB_ROOT: workshop },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { failed: false, out: String(out) };
  } catch (error) {
    return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

export const checks = [
  {
    title:
      '第十二条判据（arch）：带 arch.config.mjs 的模块 ✔；表外目录 / 巨文件 / 跨运行时 / 模型层没测试逐条判红；测试文件与 sync 生成物不吃 S16 / 不撞 S01；拿走配置是「不适用」不是红',
    run(ctx, report) {
      const workshop = mkdtempSync(join(tmpdir(), 'dsh-wb-arch-'));
      const probe = join(workshop, 'packages', 'module-demo');
      try {
        execFileSync(process.execPath, [BIN, 'init', 'demo', '--dir', probe, '--template', 'diy'], {
          stdio: 'pipe',
        });
        linkToolchain(ctx.toolchain, join(probe, 'node_modules'));

        const expectGreen = (what) => {
          const result = runCheck(probe, workshop, 'arch');
          if (result.failed) throw new Error(`${what}：该绿却红了\n${result.out}`);
          if (!result.out.includes('✔ 模块架构')) throw new Error(`${what}：没有 ✔ 那一行\n${result.out}`);
        };
        const expectRed = (what, needles) => {
          const result = runCheck(probe, workshop, 'arch');
          if (!result.failed) throw new Error(`${what}：该红却绿了\n${result.out}`);
          for (const needle of needles) {
            if (!result.out.includes(needle)) throw new Error(`${what}：判红了但没说清「${needle}」\n${result.out}`);
          }
        };

        expectGreen('模板骨架的架构');

        const manifestFile = join(probe, 'package.json');
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
        const seedProbe = join(probe, 'src', 'components', 'SeedProbe.tsx');
        writeFileSync(seedProbe, "import { Button } from '@deepseek-ai/dsh-client-ui-primitives';\nexport const probe = Button;\n");
        manifest.dependencies = { '@deepseek-ai/dsh-client-ui-primitives': '0.2.1-rc.2' };
        writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        expectGreen('平台种子词进 dependencies');

        manifest.dependencies = { 'left-pad': '1.3.0' };
        writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        expectRed('非种子的第三方运行时依赖', ['P01', 'left-pad']);

        manifest.dependencies = { 'shell-quote': '1.8.3' };
        writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        expectRed('deny 的第三方库', ['P02', 'shell-quote']);
        delete manifest.dependencies;
        writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        rmSync(seedProbe, { force: true });

        mkdirSync(join(probe, 'src', 'utils'), { recursive: true });
        writeFileSync(join(probe, 'src', 'utils', 'x.ts'), 'export const x = 1;\n');
        expectRed('表外目录', ['S01']);
        rmSync(join(probe, 'src', 'utils'), { recursive: true, force: true });

        const declared = join(probe, 'src', 'declared-tools.ts');
        writeFileSync(declared, "export const DECLARED_TOOLS = { rebuild: { name: 'workbench_demo_rebuild', writes: true } } as const;\n");
        expectGreen('sync 生成的 declared-tools.ts');
        rmSync(declared, { force: true });

        mkdirSync(join(probe, 'src', 'components'), { recursive: true });
        const big = join(probe, 'src', 'components', 'Big.tsx');
        writeFileSync(big, `${Array.from({ length: 260 }, (_unused, index) => `export const v${String(index)} = ${String(index)};`).join('\n')}\n`);
        expectRed('巨文件', ['S16']);
        rmSync(big, { force: true });

        const bulky = `${Array.from({ length: 260 }, (_unused, index) => `export const t${String(index)} = ${String(index)};`).join('\n')}\n`;
        const bigTest = join(probe, 'src', 'components', 'Big.test.ts');
        writeFileSync(bigTest, bulky);
        expectGreen('301 行的后缀式测试文件');
        rmSync(bigTest, { force: true });

        const renamed = join(probe, 'src', 'components', 'Big2.ts');
        writeFileSync(renamed, bulky);
        expectRed('同一份内容改名成产品代码', ['S16']);
        rmSync(renamed, { force: true });

        mkdirSync(join(probe, 'src', '__tests__'), { recursive: true });
        writeFileSync(join(probe, 'src', '__tests__', 'helper.ts'), bulky);
        expectGreen('__tests__/ 下的测试脚手架');
        rmSync(join(probe, 'src', '__tests__'), { recursive: true, force: true });

        const probeComponent = join(probe, 'src', 'components', 'Probe.tsx');
        writeFileSync(probeComponent, 'export const probe = 1;\n');
        const hostFile = join(probe, 'src', 'host.ts');
        const hostOriginal = readFileSync(hostFile, 'utf8');
        writeFileSync(hostFile, `import { probe } from './components/Probe';\n${hostOriginal}probe;\n`);
        expectRed('宿主侧拖进组件', ['S23', '跨运行时']);
        rmSync(probeComponent, { force: true });
        writeFileSync(hostFile, hostOriginal);

        mkdirSync(join(probe, 'src', 'model'), { recursive: true });
        writeFileSync(join(probe, 'src', 'model', 'probe.ts'), 'export const doubling = (n: number): number => n * 2;\n');
        expectRed('模型层没有测试', ['M08']);
        rmSync(join(probe, 'src', 'model', 'probe.ts'), { force: true });

        rmSync(join(probe, 'arch.config.mjs'), { force: true });
        const skipped = runCheck(probe, workshop, 'arch');
        if (skipped.failed) throw new Error(`没有配置的模块不该红：\n${skipped.out}`);
        for (const needle of ['○ 模块架构', '不适用', 'moduleArch']) {
          if (!skipped.out.includes(needle)) {
            throw new Error(`没有配置时那句「怎么加」没说出来（缺「${needle}」）：\n${skipped.out}`);
          }
        }

        report(
          '第十二条判据（arch）的正负例都对',
          true,
          '正例 5（模板骨架 / sync 生成的 declared-tools.ts / 后缀式测试文件 / __tests__ 下的脚手架 / 平台种子词进 dependencies）' +
            '+ 负例 7（S01 / S16 / 改名成产品代码仍 S16 / S23 / M08 / 非种子第三方依赖 P01 / deny 库 P02）+ 无配置的「不适用」都对',
        );
      } finally {
        rmSync(workshop, { recursive: true, force: true });
      }
    },
  },
];
