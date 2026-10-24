import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { shellKitOf } from '../../../src/checks/shell-artifact.mjs';
import { memberFilesOf } from '../../../src/shell-type-files.mjs';
import { BIN, FACES, PACKAGES_DIR, declaration, read } from '../lib.mjs';

const PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives';
const PINNED = '7.7.7';
const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');

function writeProbe(probe, external) {
  mkdirSync(join(probe, 'src'), { recursive: true });
  writeFileSync(
    join(probe, 'package.json'),
    JSON.stringify(
      {
        name: '@dsh-workbench/module-demo-primface',
        version: '0.0.1',
        private: true,
        type: 'module',
        scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
        dsh: {
          bundle: { patch: './cordis.patch.yml' },
          client: { platform: 'web', inject: ['@dsh-workbench/core'], external },
          workbench: declaration('demo-primface'),
          workbenchFaces: FACES,
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
  writeFileSync(join(probe, 'src/client.tsx'), 'export const card = () => null;\n');
}

export const checks = [
  {
    title: '模板默认带 dsh 原语：init 盖上外壳 manifest 钉的那版，external 里也声明（两个模板各一遍）',
    run(_ctx, report) {

      const root = mkdtempSync(join(PACKAGES_DIR, '.primface-pin-'));
      try {
        const coreDir = join(root, 'node_modules', '@dsh-workbench', 'core');
        mkdirSync(coreDir, { recursive: true });
        writeFileSync(
          join(coreDir, 'package.json'),
          `${JSON.stringify({ name: '@dsh-workbench/core', version: '9.9.9', devDependencies: { [PRIMITIVES]: PINNED } }, null, 2)}\n`,
        );
        for (const template of ['minimal', 'diy']) {
          const target = join(root, `pkg-${template}`);
          execFileSync(process.execPath, [BIN, 'init', `demo${template === 'diy' ? 'd' : 'm'}`, '--dir', target, '--template', template], {
            cwd: root,
            stdio: 'pipe',
          });
          const manifest = JSON.parse(read(join(target, 'package.json')));
          const declared = manifest.devDependencies?.[PRIMITIVES];
          if (declared !== PINNED) {
            return report(
              '模板默认带 dsh 原语：init 盖上外壳 manifest 钉的那版，external 里也声明（两个模板各一遍）',
              false,
              `模板 ${template}：devDependencies 里是 ${JSON.stringify(declared)}，应该盖成外壳 manifest 钉的 ${PINNED}`,
            );
          }
          const external = manifest.dsh?.client?.external ?? [];
          if (!external.includes(PRIMITIVES)) {
            return report(
              '模板默认带 dsh 原语：init 盖上外壳 manifest 钉的那版，external 里也声明（两个模板各一遍）',
              false,
              `模板 ${template}：dsh.client.external 里没有 ${PRIMITIVES}（external=${JSON.stringify(external)}）`,
            );
          }
        }
        report('模板默认带 dsh 原语：init 盖上外壳 manifest 钉的那版，external 里也声明（两个模板各一遍）', true);
      } catch (error) {
        report(
          '模板默认带 dsh 原语：init 盖上外壳 manifest 钉的那版，external 里也声明（两个模板各一遍）',
          false,
          `${error.message}${tail(`${error.stdout ?? ''}${error.stderr ?? ''}`)}`,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    title: '模板两处都在：external 一行 + devDependencies 用 __DSH_UI_VERSION__ 精确版（不是 ^）',
    run(_ctx, report) {
      for (const template of ['template', 'template-diy']) {
        const text = read(join(PACKAGES_DIR, 'module-tools', template, 'package.json.tpl'));
        if (!text.includes(`"${PRIMITIVES}": "__DSH_UI_VERSION__"`)) {
          return report(
            '模板两处都在：external 一行 + devDependencies 用 __DSH_UI_VERSION__ 精确版（不是 ^）',
            false,
            `${template}/package.json.tpl 的 devDependencies 里没有精确版那一行（要 __DSH_UI_VERSION__，别写 ^）`,
          );
        }
        if (!text.includes(`"external": ["@dsh-workbench/core/client", "${PRIMITIVES}"]`)) {
          return report(
            '模板两处都在：external 一行 + devDependencies 用 __DSH_UI_VERSION__ 精确版（不是 ^）',
            false,
            `${template}/package.json.tpl 的 dsh.client.external 里没有 ${PRIMITIVES}`,
          );
        }
        if (text.includes(`^__DSH_UI_VERSION__`)) {
          return report(
            '模板两处都在：external 一行 + devDependencies 用 __DSH_UI_VERSION__ 精确版（不是 ^）',
            false,
            `${template}/package.json.tpl 把那份版本写成了范围（^）—— 类型面要对齐对账过的那一版，要精确`,
          );
        }
      }
      report('模板两处都在：external 一行 + devDependencies 用 __DSH_UI_VERSION__ 精确版（不是 ^）', true);
    },
  },
  {
    title: '只声明不 import ⇒ primitives 判据仍绿（模板的默认值不许把老判据弄红）',
    run(_ctx, report) {
      const probe = mkdtempSync(join(PACKAGES_DIR, '.primface-declare-'));
      try {
        writeProbe(probe, ['@dsh-workbench/core/client', PRIMITIVES]);
        let out = '';
        try {
          out = String(
            execFileSync(process.execPath, [BIN, 'check', '--only', 'primitives'], {
              cwd: probe,
              env: { ...process.env, DSH_WB_ROOT: probe },
              encoding: 'utf8',
              stdio: 'pipe',
            }),
          );
        } catch (error) {
          return report(
            '只声明不 import ⇒ primitives 判据仍绿（模板的默认值不许把老判据弄红）',
            false,
            `声明了 external 却没 import，判据红了：${tail(`${error.stdout ?? ''}${error.stderr ?? ''}`)}`,
          );
        }
        if (!out.includes('条判据')) {
          return report('只声明不 import ⇒ primitives 判据仍绿（模板的默认值不许把老判据弄红）', false, `没看到判据汇总行：${tail(out)}`);
        }
        report('只声明不 import ⇒ primitives 判据仍绿（模板的默认值不许把老判据弄红）', true);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: '查询口：check --only primitives 列出装机那份（Button / Icon*Regular / kit 求交 / 版本三连），--json 是合法 JSON',
    run(_ctx, report) {
      const title =
        '查询口：check --only primitives 列出装机那份（Button / Icon*Regular / kit 求交 / 版本三连），--json 是合法 JSON';

      const cwd = join(PACKAGES_DIR, 'core');
      const run = (args) =>
        String(
          execFileSync(process.execPath, [BIN, 'check', '--only', 'primitives', ...args], {
            cwd,
            encoding: 'utf8',
            stdio: 'pipe',
          }),
        );
      try {
        const human = run([]);
        for (const needle of ['装机：', '外壳钉的：', 'kit 里已有', 'Button']) {
          if (!human.includes(needle)) return report(title, false, `清单里没有 ${needle}：${tail(human)}`);
        }
        if (!/Icon[A-Za-z0-9_]+Regular/.test(human)) {
          return report(title, false, `清单里没有一枚 Icon*Regular：${tail(human)}`);
        }
        const payload = JSON.parse(run(['--json']));
        if (!Array.isArray(payload.onlyPrimitives?.components) || !payload.onlyPrimitives.components.includes('Button')) {
          return report(title, false, `--json 里只有原语有的那份没有 Button：${JSON.stringify(payload.onlyPrimitives?.components?.slice(0, 8))}`);
        }
        if ((payload.counts?.icons ?? 0) < 90) {
          return report(title, false, `--json 里 icons 只有 ${payload.counts?.icons} 个（≥90 才算真读到了图标那族）`);
        }
        if (payload.snippet?.devDependency?.name !== PRIMITIVES) {
          return report(title, false, `--json 里那段可粘贴的 devDependency 不对：${JSON.stringify(payload.snippet)}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, `${error.message}${tail(`${error.stdout ?? ''}${error.stderr ?? ''}`)}`);
      }
    },
  },
  {
    title: '查询口能落到类型文件：kit / primitives 的 --file 与 --json 给出的路径都存在（kit 全表零漏）',
    run(_ctx, report) {
      const title =
        '查询口能落到类型文件：kit / primitives 的 --file 与 --json 给出的路径都存在（kit 全表零漏）';

      const cwd = join(PACKAGES_DIR, 'core');
      const run = (args) =>
        String(
          execFileSync(process.execPath, [BIN, 'check', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }),
        );
      try {
        const primitives = run(['--only', 'primitives', '--file', 'Button']);
        const primitivesPath = /Button：(\S+\.d\.ts)/.exec(primitives)?.[1];
        if (primitivesPath === undefined || !existsSync(primitivesPath)) {
          return report(title, false, `primitives --file Button 没给出存在的路径：${tail(primitives)}`);
        }
        const kitLine = run(['--only', 'kit', '--file', 'Card']);
        const kitPath = /--file Card：(\S+\.d\.ts)/.exec(kitLine)?.[1];
        if (kitPath === undefined || !existsSync(kitPath)) {
          return report(title, false, `kit --file Card 没给出存在的路径：${tail(kitLine)}`);
        }
        const payload = JSON.parse(run(['--only', 'kit', '--json']));
        const missing = payload.missing ?? [];
        if (missing.length > 0) {
          return report(
            title,
            false,
            `kit --json 里有 ${missing.length} 个成员扫不到类型文件：${missing.slice(0, 6).join('、')}`,
          );
        }
        const card = payload.files?.Card;
        if (typeof card !== 'string' || !existsSync(card)) {
          return report(title, false, `kit --json 里 Card 的路径不对：${String(card)}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, `${error.message}${tail(`${error.stdout ?? ''}${error.stderr ?? ''}`)}`);
      }
    },
  },
  {
    title: '★ kit 面每个成员的 .d.ts 里都有 JSDoc（用法第一现场在声明里，不在指引里）',
    run(_ctx, report) {
      const title = '★ kit 面每个成员的 .d.ts 里都有 JSDoc（用法第一现场在声明里，不在指引里）';

      try {
        const shellDir = join(PACKAGES_DIR, 'core');
        const client = join(shellDir, 'client.js');
        if (!existsSync(client)) return report(title, false, `外壳产物不在：${client}`);
        const kit = shellKitOf(client);
        const names = [...new Set(['hooks', 'components', 'api', 'lib'].flatMap((face) => Object.keys(kit[face] ?? {})))].sort();
        if (names.length === 0) return report(title, false, '这份外壳的 kit 里没取出成员');
        const { files, missing } = memberFilesOf(client, names);
        const undocumented = [];
        const unresolved = [...missing];
        for (const name of names) {
          const file = files.get(name);
          if (file === undefined) continue;
          let verdict;
          try {
            verdict = documentedIn(read(file), name);
          } catch (error) {
            unresolved.push(`${name}（${error.message}）`);
            continue;
          }
          if (verdict === 'ok' || verdict === 're-export') continue;
          undocumented.push(`${name}（${verdict}：${relative(PACKAGES_DIR, file)}）`);
        }
        if (unresolved.length > 0) {
          return report(
            title,
            false,
            `${String(unresolved.length)} 个成员落不到类型文件（判据没法判）：${unresolved.slice(0, 6).join('、')}`,
          );
        }
        if (undocumented.length > 0) {
          return report(
            title,
            false,
            `${String(undocumented.length)}/${String(names.length)} 个成员的类型文件里没有贴着自己的 JSDoc：${undocumented
              .slice(0, 6)
              .join('、')}`,
          );
        }
        report(title, true, `${String(names.length)} 个 kit 成员都有 JSDoc`);
      } catch (error) {
        report(title, false, `${error.message}${tail(`${error.stdout ?? ''}${error.stderr ?? ''}`)}`);
      }
    },
  },
  {
    title: '★ kit JSDoc 判据自己有负例（没文档 / 非 JSDoc 块 / 空块 / 再导出 / 找不到声明，都认）',
    run(_ctx, report) {

      const title = '★ kit JSDoc 判据自己有负例（没文档 / 非 JSDoc 块 / 空块 / 再导出 / 找不到声明，都认）';
      const cases = [
        ['贴着 JSDoc', '/** 一张卡。 */\nexport declare function Card(props: CardProps): JSX.Element;\n', 'Card', 'ok'],
        ['没有文档', 'export declare function Card(props: CardProps): JSX.Element;\n', 'Card', 'no-jsdoc'],
        ['非 JSDoc 块', '/* 一张卡 */\nexport declare function Card(): void;\n', 'Card', 'no-jsdoc'],
        ['中间隔着别的声明', '/** 别人的 */\nexport declare const Other: 1;\nexport declare function Card(): void;\n', 'Card', 'no-jsdoc'],
        ['按名再导出', "export type { ReactNode } from 'react';\n", 'ReactNode', 're-export'],
        ['空 JSDoc 不算', '/** */\nexport declare function Card(): void;\n', 'Card', 'no-jsdoc'],
        ['只有一句也算', '/** 卡片。 */\nexport declare function Card(): void;\n', 'Card', 'ok'],
        ['一个字也算', '/** 值 */\nexport declare function Card(): void;\n', 'Card', 'ok'],
        ['文件里没有这个名字', 'export declare const Other: 1;\n', 'Nope', 'missing-decl'],
      ];
      const wrong = cases
        .map(([why, text, name, want]) => ({ why, got: documentedIn(text, name), want }))
        .filter((one) => one.got !== one.want);
      report(
        title,
        wrong.length === 0,
        wrong.length === 0
          ? `${String(cases.length)} 条负例都对`
          : wrong.map((one) => `${one.why}：期望 ${one.want}、判成 ${one.got}`).join('；'),
      );
    },
  },
];

export function documentedIn(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(
    `^export (?:declare )?(?:async )?(?:function|const|let|interface|type|class|enum) ${escaped}\\b`,
    'm',
  );
  const at = text.match(declaration)?.index;
  if (at === undefined) {
    return new RegExp(`^export (?:type )?\\{[^}]*\\b${escaped}\\b[^}]*\\}`, 'm').test(text) ? 're-export' : 'missing-decl';
  }
  const before = text.slice(0, at).replace(/\s+$/, '');
  const block = /\/\*\*([\s\S]*?)\*\/$/.exec(before);
  return block !== null && (block[1] ?? '').replace(/[*\s]/gu, '').length >= 1 ? 'ok' : 'no-jsdoc';
}
