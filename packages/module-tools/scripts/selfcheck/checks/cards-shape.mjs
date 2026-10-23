import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR } from '../lib.mjs';

const DESIGN_SHAPE =
  'design：填好的绿 / 挖空一格红（点名叫哪一格）/ README 落后也红 / accept 逐条打勾 / ' +
  'na 与"没能力时 agentCan 留空"都绿，既不 na 又不填仍红';

const RECONCILE =
  '底稿 ↔ 清单：能力名不重不漏（底稿多一条 / 清单多一把都点名判红）；对齐 → 绿；没有 design.json → 不查';

const WRITES_SHAPE =
  'writes：没有写不红也不渲染 / 填好绿（README 有写表、排在验收之前）/ 缺格点名叫 write.<格>（单条）' +
  '或 writes[i].<格>（多条）/ 多条各占一节（#### 写 N）/ 单条写认 write{} / 配对撤销必填（可写"没有配对"）' +
  '/ params 写了"必填"必须带来源（无来源点名叫 write.params.source、补一个来源括号即绿；' +
  '不带"必填"二字的行不触发；"非必填" / "不必填"每处"必填"都被否掉才豁免，有一处裸的照旧咬）';

export const checks = [
  {
    title: DESIGN_SHAPE,
    run(_ctx, report) {

      const problems = [];
      const probe = mkdtempSync(join(PACKAGES_DIR, '.design-'));
      try {
        execFileSync(process.execPath, [BIN, 'init', 'demo', '--dir', probe, '--template', 'diy'], { stdio: 'pipe' });
        const design = join(probe, 'design.json');
        const run = (action) => execFileSync(process.execPath, [BIN, 'design', action, '--cwd', probe], { stdio: 'pipe' });

        run('check');

        const parsed = JSON.parse(readFileSync(design, 'utf8'));
        parsed.panel[0].conclusion = '';
        writeFileSync(design, JSON.stringify(parsed, null, 2));

        let message = '';
        try {
          run('check');
        } catch (error) {
          message = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        }
        if (message === '') throw new Error('挖空一格之后 design check 还是绿的');
        if (!message.includes('panel[0].conclusion')) {
          throw new Error(`报错里没点名那一格：${message.trim().split('\n').slice(-3).join(' | ')}`);
        }
        if (!message.includes('落后于 design.json')) {
          throw new Error('design.json 改了、README 没跟，居然没报');
        }

        run('accept');
        const accepted = JSON.parse(readFileSync(design, 'utf8'));
        if (!accepted.acceptance.every((one) => one.checked === true)) {
          throw new Error('design accept 没把验收逐条打勾');
        }

        const relaxed = JSON.parse(readFileSync(design, 'utf8'));
        relaxed.panel[0].conclusion = '该不该清、谁在占';
        relaxed.capabilities = [];
        relaxed.states[0] = { key: 'idle', na: '读的是账号，不随项目变：没选项目时这张卡压根不渲染' };
        for (const state of relaxed.states) delete state.agentCan;
        writeFileSync(design, JSON.stringify(relaxed, null, 2));
        run('render');
        run('check');

        const blank = JSON.parse(readFileSync(design, 'utf8'));
        blank.states[1] = { key: 'loading' };
        writeFileSync(design, JSON.stringify(blank, null, 2));
        let blankMessage = '';
        try {
          run('check');
        } catch (error) {
          blankMessage = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        }
        if (!blankMessage.includes('states.loading.sees')) {
          throw new Error(`既不写 na 又不填的态没被点出来：${blankMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(DESIGN_SHAPE, problems.length === 0, problems.join(' · '));
    },
  },
  {
    title: RECONCILE,
    run(_ctx, report) {
      const problems = [];
      const probe = mkdtempSync(join(PACKAGES_DIR, '.reconcile-'));
      const designFile = join(probe, 'design.json');
      const manifestFile = join(probe, 'package.json');
      const hostFile = join(probe, 'dist/host.js');
      const face = (names) => `export const name = '@dsh-workbench/module-demo-reconcile';
export const inject = ['workbenchUnits'];
const mount = ({ ctx }) => ({
  routes: {},
  registerTools: () => [${names.map((name) => `ctx.get('tools').register({ name: '${name}' })`).join(', ')}],
});
const face = { unit: 'demo-reconcile', mount };
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-reconcile');
}
`;
      const designOf = (names) => ({
        unit: 'demo-reconcile',
        name: 'x',
        oneLine: 'x',
        panel: [],
        config: [],
        capabilities: names.map((name) => ({ name, oneLine: 'x', shape: '只读', approval: '不用点头' })),
        linkage: [],
        acceptance: [],
        reads: [{ read: 'r', params: 'p', credentials: 'c', notLoggedIn: 'n', timeout: 't' }],
      });
      const manifestOf = (names) => ({
        name: '@dsh-workbench/module-demo-reconcile',
        version: '0.0.1',
        private: true,
        type: 'module',
        peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
        scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
        dsh: {
          bundle: { patch: './cordis.patch.yml' },
          client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
          workbench: {
            apiVersion: 1,
            unit: 'demo-reconcile',
            card: null,
            tools: names.map((name) => ({ name, writes: false })),
            host: { inject: [] },
          },
          workbenchFaces: FACES,
        },
      });
      const run = (args) => {
        try {
          const out = execFileSync(process.execPath, [BIN, ...args], { cwd: probe, encoding: 'utf8', stdio: 'pipe' });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };

      const state = (designNames, declarationNames) => {
        if (designNames === null) rmSync(designFile, { force: true });
        else writeFileSync(designFile, JSON.stringify(designOf(designNames), null, 2));
        writeFileSync(manifestFile, JSON.stringify(manifestOf(declarationNames), null, 2));
        writeFileSync(hostFile, face(declarationNames));
      };
      const tail = (out) => out.trim().split('\n').slice(-6).join(' | ');
      try {
        mkdirSync(join(probe, 'dist'), { recursive: true });
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(join(probe, 'src/client.tsx'), 'export const card = null;\n');

        state(['demo_tool'], ['demo_tool']);
        const aligned = run(['check', '--only', 'contracts']);
        if (aligned.failed) throw new Error(`底稿与清单对齐了还是红的：${tail(aligned.out)}`);

        state(['demo_tool', 'demo_ghost'], ['demo_tool']);
        const ghost = run(['check', '--only', 'contracts']);
        if (!ghost.failed) throw new Error('底稿里多一条能力（清单的 tools[] 里没有），居然没红');
        if (!ghost.out.includes('design.json 的能力行里有「demo_ghost」')) {
          throw new Error(`判红了但没点名那条能力：${tail(ghost.out)}`);
        }

        state(['demo_tool'], ['demo_tool', 'demo_extra']);
        const extra = run(['check', '--only', 'contracts']);
        if (!extra.failed) throw new Error('清单里多一把工具（底稿的能力行里没有），居然没红');
        if (!extra.out.includes('清单的 tools[] 里声明了「demo_extra」')) {
          throw new Error(`判红了但没点名那把工具：${tail(extra.out)}`);
        }

        state(null, ['demo_tool']);
        const noDesign = run(['check', '--only', 'contracts']);
        if (noDesign.failed) throw new Error(`没有 design.json 的模块不该因为这条判据变红：${tail(noDesign.out)}`);
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(RECONCILE, problems.length === 0, problems.join(' · '));
    },
  },
  {
    title: WRITES_SHAPE,
    run(_ctx, report) {
      const problems = [];
      const probe = mkdtempSync(join(PACKAGES_DIR, '.writes-'));
      try {
        execFileSync(process.execPath, [BIN, 'init', 'demo', '--dir', probe, '--template', 'diy'], { stdio: 'pipe' });
        const design = join(probe, 'design.json');
        const readmeFile = join(probe, 'README.md');
        const run = (action) => execFileSync(process.execPath, [BIN, 'design', action, '--cwd', probe], { stdio: 'pipe' });
        const parsed = () => JSON.parse(readFileSync(design, 'utf8'));
        const save = (value) => writeFileSync(design, JSON.stringify(value, null, 2));
        const fails = (action) => {
          try {
            run(action);
            return '';
          } catch (error) {
            return `${error.stdout ?? ''}${error.stderr ?? ''}`;
          }
        };

        const write = (over = {}) => ({
          command: 'POST /api/x（一次就是真的）',
          params: 'id 必填（前端已证）；mode 枚举 one|two',
          credentials: '工作区里那份 token',
          preview: '没有，一次就是真的',
          readback: '再读一次 x/overview，看 status 字段',
          undo: 'DELETE /api/x/:id —— 发布后 24h 内可撤（配对撤销）',
          failure: 'HTTP 500：可能已经写了，别重试',
          probeCommand: 'curl -X POST …',
          ...over,
        });

        run('check');
        if (readFileSync(readmeFile, 'utf8').includes('### 写通道探明记录')) {
          throw new Error('没有 writes 的骨架，README 里却长出了写通道那一节');
        }

        const one = parsed();
        one.writes = [write()];
        save(one);
        run('render');
        run('check');
        const single = readFileSync(readmeFile, 'utf8');
        if (!single.includes('### 写通道探明记录')) throw new Error('填了 writes，README 里却没有写通道那一节');
        if (single.indexOf('### 写通道探明记录') > single.indexOf('### 验收')) {
          throw new Error('写表没排在验收之前');
        }
        if (single.includes('#### 写 1')) throw new Error('只有一条写，却多起了一个 `#### 写 1`');

        const oneBlank = parsed();
        oneBlank.writes[0].failure = '';
        save(oneBlank);
        const oneMessage = fails('check');
        if (oneMessage === '') throw new Error('writes 挖空一格，design check 还是绿的');
        if (!oneMessage.includes('write.failure')) {
          throw new Error(`单条写没点名 write.failure：${oneMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }

        const undoBlank = parsed();
        undoBlank.writes[0] = write({ undo: '' });
        save(undoBlank);
        const undoMessage = fails('check');
        if (!undoMessage.includes('write.undo')) {
          throw new Error(`配对撤销那一格没点名：${undoMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }
        const undoNone = parsed();
        undoNone.writes[0] = write({ undo: '没有配对，一次就是真的' });
        save(undoNone);
        run('render');
        run('check');
        if (!readFileSync(readmeFile, 'utf8').includes('配对的那个撤销 / 删除')) {
          throw new Error('写了 undo，README 的写表里却没有那一行');
        }

        const noSource = parsed();
        noSource.writes[0] = write({ params: 'id 必填；mode 枚举 one|two' });
        save(noSource);
        const sourceMessage = fails('check');
        if (!sourceMessage.includes('write.params.source')) {
          throw new Error(`params 写了必填却没有来源，没点名 write.params.source：${sourceMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }
        const sourced = parsed();
        sourced.writes[0] = write();
        save(sourced);
        run('render');
        run('check');
        if (!readFileSync(readmeFile, 'utf8').includes('| 参数（必填 / 取值枚举 / 上限） |')) {
          throw new Error('写表里没有「参数（必填 / 取值枚举 / 上限）」那一行');
        }
        const undetermined = parsed();
        undetermined.writes[0] = write({ params: 'title 未定' });
        save(undetermined);
        run('render');
        run('check');
        const bareRequired = parsed();
        bareRequired.writes[0] = write({ params: 'title 必填' });
        save(bareRequired);
        const bareMessage = fails('check');
        if (!bareMessage.includes('write.params.source')) {
          throw new Error(`params 只写"必填"没来源，没点名 write.params.source：${bareMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }

        const negated = parsed();
        negated.writes[0] = write({ params: 'tags 非必填' });
        save(negated);
        run('render');
        run('check');
        const mixedNegated = parsed();
        mixedNegated.writes[0] = write({ params: 'id 必填；tag 非必填' });
        save(mixedNegated);
        const mixedMessage = fails('check');
        if (!mixedMessage.includes('write.params.source')) {
          throw new Error(`既有一处裸的"必填"、别处写"非必填"，却没点名：${mixedMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }

        const mixedSourced = parsed();
        mixedSourced.writes[0] = write({ params: 'id 必填（前端已证）；tag 非必填' });
        save(mixedSourced);
        run('render');
        run('check');

        const many = parsed();
        many.writes = [write(), write({ command: 'PATCH /api/x/2', preview: '有：?dry=1 只回会发生什么' })];
        save(many);
        run('render');
        run('check');
        const multi = readFileSync(readmeFile, 'utf8');
        if (!multi.includes('#### 写 1') || !multi.includes('#### 写 2')) {
          throw new Error('两条写没在 README 里各占一节');
        }
        const manyBlank = parsed();
        manyBlank.writes[1].readback = '';
        save(manyBlank);
        const manyMessage = fails('check');
        if (!manyMessage.includes('writes[1].readback')) {
          throw new Error(`报错里没点名第几条写的哪一格：${manyMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }

        const writeOnly = parsed();
        writeOnly.write = write({ credentials: '' });
        delete writeOnly.writes;
        save(writeOnly);
        const writeMessage = fails('check');
        if (!writeMessage.includes('write.credentials')) {
          throw new Error(`单条写（write{}）没被认 / 没点名：${writeMessage.trim().split('\n').slice(-3).join(' | ')}`);
        }
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(WRITES_SHAPE, problems.length === 0, problems.join(' · '));
    },
  },
];
