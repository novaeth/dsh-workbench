import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN } from '../lib.mjs';

function fakeBrowserDocument() {
  const nodes = [];
  return {
    nodes,
    head: { appendChild: (node) => nodes.push(node) },
    createElement: () => {
      const attrs = {};
      return {
        attrs,
        setAttribute: (name, value) => {
          attrs[name] = value;
        },
        getAttribute: (name) => attrs[name] ?? null,
        textContent: '',
      };
    },
    querySelector: (selector) => {
      const found = /data-dsh-wb-css="(.*)"\]$/.exec(selector);
      if (found === null) return null;
      return nodes.find((node) => node.getAttribute('data-dsh-wb-css') === found[1]) ?? null;
    },
  };
}

const PLACEMENT_TITLE = '依赖 CSS / 普通 CSS / *.module.css 都有落点（module 的类名哈希 + 交出映射）';
const UPDATE_TITLE = '模块样式是就地更新：热更新只改写那一份 <style>，不重复插、不丢新规则';

export const checks = [
  {
    title: PLACEMENT_TITLE,
    async run(_ctx, report) {

      const shop = mkdtempSync(join(tmpdir(), 'dsh-wb-css-'));
      const dir = join(shop, 'packages', 'css-module');
      const placement = [];
      const update = [];
      try {
        mkdirSync(join(dir, 'src'), { recursive: true });
        mkdirSync(join(dir, 'node_modules', '@neg', 'with-css'), { recursive: true });
        writeFileSync(
          join(dir, 'package.json'),
          JSON.stringify(
            {
              name: '@neg/module-css',
              version: '0.0.1',
              dsh: {
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: [] },
                workbench: { unit: 'css' },
                workbenchFaces: { host: 'src/plugin.host.ts', client: 'src/plugin.client.ts' },
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(join(dir, 'src/plugin.host.ts'), 'export const host = 1;\n');
        writeFileSync(join(dir, 'src/local.css'), '.localMarker { color: red; }\n');
        writeFileSync(
          join(dir, 'src/panel.module.css'),
          '.panelTitle { color: green; }\n.panelWrap:global(.wb-cardBody) { color: red; }\n',
        );
        writeFileSync(
          join(dir, 'src/plugin.client.ts'),
          "import { widget } from '@neg/with-css';\nimport './local.css';\nimport panel from '@/modules/css/panel.module.css';\nexport const client = [widget, panel];\n",
        );
        writeFileSync(
          join(dir, 'node_modules', '@neg', 'with-css', 'package.json'),
          JSON.stringify({ name: '@neg/with-css', version: '0.0.1', main: 'index.js' }, null, 2),
        );
        writeFileSync(
          join(dir, 'node_modules', '@neg', 'with-css', 'index.js'),
          "import './style.css';\nexport const widget = 1;\n",
        );
        writeFileSync(join(dir, 'node_modules', '@neg', 'with-css', 'style.css'), '.depMarker { color: blue; }\n');

        execFileSync(process.execPath, [BIN, 'build'], {
          cwd: dir,
          env: { ...process.env, DSH_WB_ROOT: shop },
          encoding: 'utf8',
          stdio: 'pipe',
        });
        const built = readFileSync(join(dir, 'client.js'), 'utf8');
        for (const needle of ['.localMarker', '.depMarker', 'data-dsh-wb-css', 'querySelector']) {
          if (!built.includes(needle)) placement.push(`产物里没有「${needle}」—— CSS 没被内联`);
        }
        if ((built.match(/\.depMarker/g) ?? []).length !== 1) placement.push('依赖 CSS 内联了不止一份');
        const scoped = built.match(/\.[_a-zA-Z][\w-]*_panelTitle/g) ?? [];
        if (scoped.length !== 1) placement.push(`*.module.css 的类名没有被哈希成一份：${scoped.length} 处`);

        const illegal = built.match(/\.[0-9][\w-]*_panelTitle/g) ?? [];
        if (illegal.length !== 0) placement.push(`哈希出来的类名以数字开头（非法选择器）：${illegal[0]}`);
        if (!/panelTitle["']?\s*:\s*["']/.test(built)) {
          placement.push('*.module.css 没有把类名映射交给调用点（styles.panelTitle 会是 undefined）');
        }
        if (built.includes('.panelTitle {')) placement.push('未哈希的类名还留在产物里');

        if (!built.includes('.wb-cardBody')) placement.push(':global(...) 里的类名被哈希了');
        if (built.includes(':global(')) placement.push('产物里还留着 :global( 外壳，浏览器不认');
        report(PLACEMENT_TITLE, placement.length === 0, placement.join(' · '));

        try {
          if (!built.includes('style.textContent !== css')) {
            throw new Error('注入还是"没有才插入"：热更新时新 CSS 写不进去，新增的类会掉样式');
          }
          const { cssInjectionCode } = await import('../../../src/css-injection.mjs');
          const fakeDocument = fakeBrowserDocument();
          const applyStyles = (text) =>
            new Function('document', cssInjectionCode('x.module.css:/w/x.module.css', text))(fakeDocument);
          applyStyles('.a{color:red}');
          applyStyles('.a{color:blue}.b{color:green}');
          if (fakeDocument.nodes.length !== 1) {
            throw new Error(`热更新插出了 ${fakeDocument.nodes.length} 份 <style>（应该始终 1 份）`);
          }
          if (fakeDocument.nodes[0].textContent !== '.a{color:blue}.b{color:green}') {
            throw new Error(`热更新后那份 <style> 还是旧内容：${fakeDocument.nodes[0].textContent}`);
          }
        } catch (error) {
          update.push(error.message);
        }
        report(UPDATE_TITLE, update.length === 0, update.join(' · '));
      } catch (error) {
        report(PLACEMENT_TITLE, false, `CSS 落点坏了：${error.message}`);
        report(UPDATE_TITLE, false, `同上：${error.message}`);
      } finally {
        rmSync(shop, { recursive: true, force: true });
      }
    },
  },
  {
    title: '外壳 kit 面的负例与正例都对（旧外壳上没有的成员、peer 下限比 devDep 旧都判红）',
    run(_ctx, report) {

      const title = '外壳 kit 面的负例与正例都对（旧外壳上没有的成员、peer 下限比 devDep 旧都判红）';
      const shop = mkdtempSync(join(tmpdir(), 'dsh-wb-kit-'));
      const dir = join(shop, 'packages', 'kit-module');
      const shell = join(shop, 'fake-shell', 'client.js');
      const kitManifest = (peer) =>
        JSON.stringify(
          {
            name: '@neg/module-kit',
            version: '0.0.1',
            dsh: { workbench: { unit: 'kit' }, workbenchFaces: { host: 'src/plugin.host.ts', client: 'src/plugin.client.ts' } },
            peerDependencies: { '@dsh-workbench/core': peer },
            devDependencies: { '@dsh-workbench/core': '^0.1.8' },
          },
          null,
          2,
        );
      const kitArtifact = (member, bucket = 'components') =>
        'window.__ModuleLoader__.load({ id: "@neg/module-kit", factory: (require) => {\n' +
        '  var import_client = require("@dsh-workbench/core/client");\n' +
        `  const { ${member} } = import_client.kit.${bucket};\n` +
        `  return { ${member} };\n} });\n`;
      try {
        mkdirSync(join(dir, 'src'), { recursive: true });
        mkdirSync(join(shop, 'fake-shell'), { recursive: true });
        writeFileSync(
          shell,
          'window.__ModuleLoader__.load({ id: "@dsh-workbench/core", factory: () => ({ kit: { hooks: { useUnitBoard: () => {} }, components: {}, api: {}, lib: {} } }) });\n',
        );
        writeFileSync(join(dir, 'src/plugin.host.ts'), 'export const host = 1;\n');
        writeFileSync(join(dir, 'package.json'), kitManifest('^0.1.0'));
        writeFileSync(join(dir, 'client.js'), kitArtifact('StateBlock'));

        const runKit = (withShell, json = false) => {
          const env = { ...process.env, DSH_WB_ROOT: shop };
          if (withShell) env.DSH_WB_CORE_CLIENT = shell;
          else delete env.DSH_WB_CORE_CLIENT;
          const args = [BIN, 'check', '--only', 'kit'];
          if (json) args.push('--json');
          try {
            const out = execFileSync(process.execPath, args, {
              cwd: dir,
              env,
              encoding: 'utf8',
              stdio: 'pipe',
            });
            return { failed: false, out: `${out}`, stdout: `${out}` };
          } catch (error) {
            return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}`, stdout: `${error.stdout ?? ''}` };
          }
        };

        const red = runKit(true);
        if (!red.failed) throw new Error('负例没被判红：产物取了假外壳里没有的 kit.components.StateBlock');
        if (!red.out.includes('kit.components.StateBlock')) throw new Error(`判红了但没说清缺哪个成员：\n${red.out}`);

        const redJson = runKit(true, true);
        if (!redJson.failed) throw new Error('--json 那一版没被判红（退出码该是 1）');
        let machine;
        try {
          machine = JSON.parse(redJson.stdout);
        } catch {
          throw new Error(`判据红时 --json 没打出机器档（清单被扣下了）：\n${redJson.stdout}`);
        }
        if (!Array.isArray(machine?.buckets?.hooks) || !machine.buckets.hooks.includes('useUnitBoard')) {
          throw new Error(`机器档里没带上 kit 面：${redJson.stdout}`);
        }
        if (!Array.isArray(machine?.problems) || !machine.problems.join('\n').includes('kit.components.StateBlock')) {
          throw new Error(`机器档里没带上"红在哪"：${redJson.stdout}`);
        }

        const redFloor = runKit(false);
        if (!redFloor.failed) throw new Error('负例没被判红：peer 下限 ^0.1.0 比 devDependency ^0.1.8 还旧');
        if (!redFloor.out.includes('比 devDependency')) throw new Error(`判红了但没说是 peer 下限的事：\n${redFloor.out}`);

        writeFileSync(join(dir, 'package.json'), kitManifest('^0.1.8'));

        writeFileSync(join(dir, 'client.js'), kitArtifact('useUnitBoard', 'hooks'));
        for (const [label, withShell] of [
          ['面够用 + peer 同档', true],
          ['没装外壳时不误报（面差跳过、下限自洽）', false],
        ]) {
          const green = runKit(withShell);
          if (green.failed) throw new Error(`修好之后还是红的（${label}）：\n${green.out}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, `外壳 kit 面夹具坏了：${error.message}`);
      } finally {
        rmSync(shop, { recursive: true, force: true });
      }
    },
  },
];
