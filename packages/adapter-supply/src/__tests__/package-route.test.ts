import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DshShell, PluginPlanStep } from '@dsh-workbench/shared';
import type { LibNeed } from '@dsh-workbench/shared/host';
import { createSeam } from '@dsh-workbench/shared/host';
import { isolatedInstallCommand, libInstallCommand } from '@dsh-workbench/adapter-runtime';
import { OPENCLI_MANIFEST_FILE } from '../index.js';
import { LOCAL_PLUGIN_ENV, packageRouteOf, pluginInstallPlan, resetPackageRouteCache } from '../index.js';

const DSH_HOME = '/tmp/dshhome';
const PREFIX = path.join(DSH_HOME, 'workbench', 'opencli', 'plugins-npm');
const REGISTRY = 'https://npm.example.com/team/';
const roots: string[] = [];

function runLineOf(step: PluginPlanStep | undefined): string {
  if (step?.kind !== 'run') throw new Error('这一步该是命令步');
  return step.line;
}

function runLines(steps: readonly PluginPlanStep[]): string[] {
  return steps.flatMap((step) => (step.kind === 'run' ? [step.line] : []));
}

function dirOf(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-route-'));
  roots.push(root);
  const at = path.join(root, name);
  fs.mkdirSync(at, { recursive: true });
  return at;
}

function put(at: string, file: string, body: unknown): void {
  const target = path.join(at, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
}

function shellWith(options: { readonly view?: string; readonly files?: Readonly<Record<string, string>> }): {
  shell: DshShell;
  seam: ReturnType<typeof createSeam>;
  commands: string[];
} {
  const commands: string[] = [];
  const shell = {
    resolve: (request: { readonly command: string }) => {
      commands.push(request.command);
      return request;
    },
    execute: async (spec: { readonly command?: string }) => {
      const command = String(spec?.command ?? '');
      let exitCode = 0;
      let stdout = '';
      if (command.startsWith('npm view')) {
        stdout = options.view ?? '';
        exitCode = options.view === undefined ? 1 : 0;
      } else {
        const packTo = /--pack-destination '([^']+)'/.exec(command)?.[1];
        const unpackTo = /-C '([^']+)'/.exec(command)?.[1];
        if (packTo !== undefined) {
          fs.writeFileSync(path.join(packTo, 'demo-1.0.0.tgz'), 'tgz');
          stdout = '[{"filename":"demo-1.0.0.tgz"}]';
        } else if (unpackTo !== undefined) {
          for (const [name, body] of Object.entries(options.files ?? {})) {
            const target = path.join(unpackTo, 'package', name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, body, 'utf8');
          }
        } else {
          exitCode = 1;
        }
      }
      return {
        result: async () => ({
          exitCode,
          timedOut: false,
          aborted: false,
          stdout: { text: stdout, truncated: false },
          stderr: { text: '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
  return { shell, seam: createSeam({ shell, runtimeRoot: '/tmp/wb-seam-test' }), commands };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('按内容决定走哪条路', () => {
  beforeEach(() => {
    resetPackageRouteCache();
  });

  it('本地目录：插件清单 + 命令文件 → 我们的路', () => {
    const at = dirOf('plugin-a');
    put(at, 'package.json', { name: '@t/plugin-a', version: '1.0.0' });
    put(at, OPENCLI_MANIFEST_FILE, { name: 'plugina' });
    put(at, 'list.js', 'x');

    return expect(packageRouteOf({ spec: at })).resolves.toEqual({
      kind: 'runtime-plugin',
      pkg: '@t/plugin-a',
      pluginName: 'plugina',
    });
  });

  it('★ 两样都有 → 按 dsh 走（一条路一个结果，不装两遍）', async () => {
    const at = dirOf('both-a');
    put(at, 'package.json', { name: '@t/both-a', dsh: { bundle: {} } });
    put(at, OPENCLI_MANIFEST_FILE, { name: 'botha' });
    put(at, 'list.js', 'x');

    await expect(packageRouteOf({ spec: at })).resolves.toEqual({ kind: 'dsh-bundle' });
  });

  it('本地目录读不动 → 判不了（fail-open：交给 dsh，绝不因此拒人）', async () => {
    const at = dirOf('no-package-json');
    put(at, OPENCLI_MANIFEST_FILE, { name: 'x' });

    await expect(packageRouteOf({ spec: at })).resolves.toBeUndefined();
  });

  it('★ 源上的包：只看元数据就够的（写了 dsh）不下载内容', async () => {
    const { seam, commands } = shellWith({ view: '{"bundle":{}}' });

    await expect(packageRouteOf({ seam, spec: '@t/mod@1.2.3', registry: REGISTRY })).resolves.toEqual({
      kind: 'dsh-bundle',
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("npm view '@t/mod@1.2.3' dsh --json");
    expect(commands.some((line) => line.includes('npm pack'))).toBe(false);
  });

  it('★ 源上的包：元数据里没有那个信号 → 把包拉下来看内容', async () => {
    const { seam, commands } = shellWith({
      view: '{}',
      files: { 'package.json': '{"name":"@t/demo"}', 'opencli-plugin.json': '{"name":"demo"}', 'list.js': 'x' },
    });

    await expect(packageRouteOf({ seam, spec: '@t/demo@1.0.0', registry: REGISTRY })).resolves.toEqual({
      kind: 'runtime-plugin',
      pkg: '@t/demo',
      pluginName: 'demo',
    });
    expect(commands.some((line) => line.includes('npm pack'))).toBe(true);
  });

  it('★ 源上的包：内容里两样都没有 → neither（这才是该拒的那一类）', async () => {
    const { seam } = shellWith({ view: '{}', files: { 'package.json': '{"name":"@t/demo"}' } });

    await expect(packageRouteOf({ seam, spec: '@t/demo', registry: REGISTRY })).resolves.toEqual({
      kind: 'neither',
      pkg: '@t/demo',
    });
  });

  it('★ 看过的结论短期记住：同一个 spec + 同一个源不再问第二遍（先判定再装 = 只下一次）', async () => {
    const { seam, commands } = shellWith({
      view: '{}',
      files: { 'package.json': '{"name":"@t/demo"}', 'opencli-plugin.json': '{"name":"demo"}', 'list.js': 'x' },
    });

    await packageRouteOf({ seam, spec: '@t/demo', registry: REGISTRY });
    const first = commands.length;
    await packageRouteOf({ seam, spec: '@t/demo', registry: REGISTRY });

    expect(first).toBeGreaterThan(1);
    expect(commands).toHaveLength(first);
  });

  it('★ 没有源 / 没有执行缝 → 不去猜，交给 dsh（猜错比不判更坏）', async () => {
    const { seam, commands } = shellWith({ view: '{}' });

    await expect(packageRouteOf({ seam, spec: '@t/demo' })).resolves.toBeUndefined();
    await expect(packageRouteOf({ spec: '@t/demo', registry: REGISTRY })).resolves.toBeUndefined();
    expect(commands).toEqual([]);
  });

  it('★ git / tarball 的 spec 不判（不发明下载预检，口径同 ADR-0038）', async () => {
    const { seam, commands } = shellWith({ view: '{}' });

    for (const spec of ['github:o/r', 'https://example.test/a.tgz']) {
      await expect(packageRouteOf({ seam, spec, registry: REGISTRY }), spec).resolves.toBeUndefined();
    }
    expect(commands).toEqual([]);
  });
});

describe('插件的安装命令（复用 plugin-source 那两条既有分支）', () => {
  it('★ 本地目录 → 一条 `plugin install <目录>`（与模块声明的 local 来源同形）', () => {
    const plan = pluginInstallPlan({ spec: '/opt/plugin', command: 'opencli' });

    expect(plan).toEqual({
      ok: true,
      steps: [{ kind: 'run', line: "'opencli' plugin install '/opt/plugin'", host: true }],
      line: "'opencli' plugin install '/opt/plugin'",
    });
    expect(LOCAL_PLUGIN_ENV).toBe('DSH_WB_OPENCLI_PLUGIN_PATH');
  });

  it('★ 源上的包 → plugin-source 的 npm 分支（装进我们的 plugins-npm，再让 opencli 认它）', () => {
    vi.stubEnv('DSH_HOME', DSH_HOME);
    const plan = pluginInstallPlan({
      spec: 'opencli-plugin-demo@1.2.3',
      command: 'opencli',
      registry: REGISTRY,
      pluginName: 'demo',
    });

    if (!plan.ok) throw new Error('这条该装得上');
    expect(plan.steps[0]).toEqual({ kind: 'mkdir', path: PREFIX });
    expect(runLineOf(plan.steps[1])).toBe(
      `pnpm add --dir '${PREFIX}' 'opencli-plugin-demo@1.2.3' --registry '${REGISTRY}' --store-dir '${path.join(DSH_HOME, 'workbench', 'opencli', 'pnpm-store')}' --config.cache-dir='${path.join(DSH_HOME, 'workbench', 'opencli', 'pnpm-cache')}' --config.state-dir='${path.join(DSH_HOME, 'workbench', 'opencli', 'pnpm-state')}' --allow-build='opencli-plugin-demo'`,
    );
    expect(plan.steps.map((step) => step.kind)).toEqual(['mkdir', 'run', 'remove', 'mkdir', 'link', 'run', 'run']);
    expect(runLines(plan.steps).some((line) => line.includes("'opencli' plugin uninstall 'demo'"))).toBe(true);
    expect(runLineOf(plan.steps.at(-1))).toContain(
      `'opencli' plugin install '${path.join(PREFIX, 'node_modules', 'opencli-plugin-demo')}'`,
    );
    expect(plan.steps.at(-1)).toMatchObject({ env: { NPM_CONFIG_REGISTRY: REGISTRY } });
    expect(JSON.stringify(plan.steps.filter((step) => step.kind === 'run'))).not.toContain('NPM_CONFIG_REGISTRY=');
    expect(plan.line).toContain(`NPM_CONFIG_REGISTRY='${REGISTRY}'`);
  });

  it('★ 干净机器上 plugins-npm 还不存在：`pnpm add --dir` 前先 mkdir，别让它 ENOENT', () => {
    vi.stubEnv('DSH_HOME', DSH_HOME);
    const plan = pluginInstallPlan({ spec: 'opencli-plugin-demo', command: 'opencli', registry: REGISTRY });

    if (!plan.ok) throw new Error('这条该装得上');
    expect(plan.steps[0]).toEqual({ kind: 'mkdir', path: PREFIX });
    expect(plan.line.startsWith(`mkdir -p '${PREFIX}' && pnpm add --dir '${PREFIX}'`)).toBe(true);
  });

  it('★ 用户挑的源说了算：进程环境里那个 npm_config_registry 不许把它顶掉', () => {
    vi.stubEnv('DSH_HOME', DSH_HOME);
    vi.stubEnv('npm_config_registry', 'https://registry.npmmirror.com/');
    const plan = pluginInstallPlan({ spec: 'opencli-plugin-demo', command: 'opencli', registry: REGISTRY });

    if (!plan.ok) throw new Error('这条该装得上');
    expect(runLineOf(plan.steps[1])).toContain(`--registry '${REGISTRY}'`);
  });

  it('★ 不带版本就是 latest（源决定），插件名只在"先卸旧的"那一步用', () => {
    vi.stubEnv('DSH_HOME', DSH_HOME);
    const plan = pluginInstallPlan({ spec: 'opencli-plugin-demo', command: 'opencli', registry: REGISTRY });

    if (!plan.ok) throw new Error('这条该装得上');
    expect(runLineOf(plan.steps[1])).toContain("'opencli-plugin-demo@latest'");
    expect(runLines(plan.steps).some((line) => line.includes('plugin uninstall'))).toBe(false);
  });

  it('不是 npm 包名也不是本地目录 → malformed（不猜地址）', () => {
    expect(pluginInstallPlan({ spec: 'github:o/r', command: 'opencli' })).toEqual({
      ok: false,
      problem: 'malformed',
    });
  });

  it('★ 既有 plugins-npm/node_modules 记的 store 说了算（装好的那份不翻面）', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-route-'));
    roots.push(home);
    vi.stubEnv('DSH_HOME', home);
    const store = path.join(home, 'workbench', 'opencli', 'npm-cache');
    const file = path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', '.modules.yaml');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `storeDir: ${store}\n`, 'utf8');

    const plan = pluginInstallPlan({ spec: 'opencli-plugin-demo', command: 'opencli', registry: REGISTRY });

    if (!plan.ok) throw new Error('这条该装得上');
    expect(plan.steps[0]).toEqual({ kind: 'mkdir', path: path.join(home, 'workbench', 'opencli', 'plugins-npm') });
    expect(runLineOf(plan.steps[1])).toContain(`--store-dir '${store}'`);
  });

  it('★ toolchain / vendor / libs 三处的 `--store-dir` 同源（都读既有 node_modules）', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-route-'));
    roots.push(home);
    vi.stubEnv('DSH_HOME', home);
    const runtime = path.join(home, 'workbench', 'opencli');
    const store = path.join(runtime, 'npm-cache');
    for (const project of ['toolchain', 'libs', 'plugins-npm']) {
      const file = path.join(runtime, project, 'node_modules', '.modules.yaml');
      const manifest = { hoistedDependencies: {}, storeDir: store, virtualStoreDir: 'node_modules/.pnpm' };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
    const need: LibNeed = { kind: 'lib', name: 'demo-lib', purpose: '测试' };
    const plan = pluginInstallPlan({ spec: 'opencli-plugin-demo', command: 'opencli', registry: REGISTRY });

    if (!plan.ok) throw new Error('这条该装得上');
    const lines = [
      isolatedInstallCommand(),
      libInstallCommand({ need, source: { kind: 'npm', package: 'demo-lib' } }),
      runLineOf(plan.steps[1]),
    ];

    for (const line of lines) expect(line).toContain(`--store-dir '${store}'`);
  });
});
