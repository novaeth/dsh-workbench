import path from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginPlanStep } from '@dsh-workbench/shared';
import { planLineOf, planStepText } from '@dsh-workbench/shared/host';
import { resolvePluginSource } from '../plugin-source.js';

const DSH_HOME = "/tmp/dshhome";
const ROOT = path.join(DSH_HOME, 'workbench', 'opencli');
const at = (...parts: string[]): string => path.join(ROOT, ...parts);
const REGISTRY = "https://npm.example.com/team/repo";
const ENV = "DSH_WB_TEST_REGISTRY";
const PEER_DIR = at('plugins-npm', 'node_modules', '@jackwener', 'opencli');
const PEER_PARENT = at('plugins-npm', 'node_modules', '@jackwener');
const PEER_TARGET = at('toolchain', 'node_modules', '@jackwener', 'opencli');
const INSTALLED_DIR = at('plugins-npm', 'node_modules', 'opencli-plugin-demo');

const POSIX_ONLY = ['rm -rf', 'mkdir -p', 'ln -s', 'cp -R', '|| true'];
const BARE_ENV_PREFIX = /(?<!\$env:)NPM_CONFIG_REGISTRY=/;

function runLineOf(step: PluginPlanStep | undefined): string {
  if (step?.kind !== 'run') throw new Error('这一步该是命令步');
  return step.line;
}

function kindOf(step: PluginPlanStep | undefined): string {
  return step?.kind ?? '';
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const tempRoots: string[] = [];

function tempHome(recordStore: string | undefined): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wb-plugin-'));
  tempRoots.push(dir);
  if (recordStore !== undefined) {
    const file = path.join(dir, 'workbench', 'opencli', 'plugins-npm', 'node_modules', '.modules.yaml');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `storeDir: ${recordStore}\n`, 'utf8');
  }
  return dir;
}

function npmAt(dshHome: string): string {
  vi.stubEnv('DSH_HOME', dshHome);
  vi.stubEnv(ENV, REGISTRY);
  const resolved = resolvePluginSource(
    { kind: 'npm', package: 'opencli-plugin-demo', registryEnv: ENV },
    process.env,
    { plugin: 'demo' },
  );
  if (!resolved.ok) throw new Error('应该解析得出');
  return runLineOf(resolved.steps[0]);
}

function npm(
  options: {
    version?: string;
    mode?: "install" | "update";
    command?: string;
    plugin?: string;
  } = {},
) {
  vi.stubEnv("DSH_HOME", DSH_HOME);
  vi.stubEnv(ENV, REGISTRY);
  return resolvePluginSource(
    { kind: "npm", package: "opencli-plugin-demo", registryEnv: ENV },
    process.env,
    {
      plugin: "demo",
      ...(options.plugin === undefined ? {} : { plugin: options.plugin }),
      ...(options.command === undefined ? {} : { command: options.command }),
      ...(options.version === undefined ? {} : { version: options.version }),
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    },
  );
}

describe("resolvePluginSource：git / local（一条 `plugin install`）", () => {
  it("git：直接用声明的地址", () => {
    expect(
      resolvePluginSource({ kind: "git", url: "git@x:demo.git" }, {}),
    ).toEqual({
      ok: true,
      steps: [{ kind: 'run', line: "'opencli' plugin install 'git@x:demo.git'" }],
      line: "'opencli' plugin install 'git@x:demo.git'",
    });
  });

  it("local：从环境变量读路径（清单里只放变量名）", () => {
    expect(
      resolvePluginSource(
        { kind: "local", env: "X_PLUGIN" },
        { X_PLUGIN: "/opt/plugin" },
      ),
    ).toEqual({
      ok: true,
      steps: [{ kind: 'run', line: "'opencli' plugin install '/opt/plugin'" }],
      line: "'opencli' plugin install '/opt/plugin'",
    });
  });

  it("没声明 → not-declared（不许猜地址）", () => {
    expect(resolvePluginSource(undefined, {})).toEqual({
      ok: false,
      problem: "not-declared",
    });
  });

  it("★ local 的变量**没设** → env-missing，并报出是哪个变量", () => {
    expect(resolvePluginSource({ kind: "local", env: "X_PLUGIN" }, {})).toEqual(
      {
        ok: false,
        problem: "env-missing",
        env: "X_PLUGIN",
      },
    );
  });

  it("★ 变量设了但是空的 → 同样当没设（空串不是路径）", () => {
    expect(
      resolvePluginSource(
        { kind: "local", env: "X_PLUGIN" },
        { X_PLUGIN: "   " },
      ),
    ).toEqual({
      ok: false,
      problem: "env-missing",
      env: "X_PLUGIN",
    });
  });

  it("git 地址是空的 → malformed（等于没声明）", () => {
    expect(resolvePluginSource({ kind: "git", url: "  " }, {})).toEqual({
      ok: false,
      problem: "malformed",
    });
  });

  it("两边的空白都裁掉（照抄路径时最容易带上空格）", () => {
    expect(
      resolvePluginSource({ kind: "local", env: "X" }, { X: " /opt/p " }),
    ).toMatchObject({
      ok: true,
      line: "'opencli' plugin install '/opt/p'",
    });
    expect(
      resolvePluginSource({ kind: "git", url: " git@x:y.git " }, {}),
    ).toMatchObject({
      ok: true,
      line: "'opencli' plugin install 'git@x:y.git'",
    });
  });
});

describe("resolvePluginSource：npm（装进工作台自己的隔离运行时）", () => {
  it("★ 首次安装：一条命令 + 三条文件操作 + 兜底 + 收尾，**第一步不是 `-g`**", () => {
    const resolved = npm();

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.steps.map((step) => step.kind)).toEqual([
      'run',
      'remove',
      'mkdir',
      'link',
      'run',
      'run',
    ]);
    expect(resolved.steps[0]).toEqual({
      kind: 'run',
      line:
        `pnpm add --dir '${at('plugins-npm')}' 'opencli-plugin-demo@latest' ` +
        `--registry '${REGISTRY}' --store-dir '${at('pnpm-store')}' --config.cache-dir='${at('pnpm-cache')}' --config.state-dir='${at('pnpm-state')}' --allow-build='opencli-plugin-demo'`,
    });
    expect(resolved.steps[1]).toEqual({ kind: 'remove', path: PEER_DIR });
    expect(resolved.steps[2]).toEqual({ kind: 'mkdir', path: PEER_PARENT });
    expect(resolved.steps[3]).toEqual({
      kind: 'link',
      target: PEER_TARGET,
      path: PEER_DIR,
    });
    expect(resolved.steps[4]).toEqual({
      kind: 'run',
      line: "'opencli' plugin uninstall 'demo'",
      optional: true,
    });
    expect(resolved.steps[5]).toEqual({
      kind: 'run',
      line: `'opencli' plugin install '${INSTALLED_DIR}'`,
      env: { NPM_CONFIG_REGISTRY: REGISTRY },
    });
  });

  it("★ peer 链接必须「先删再链」（那份副本会让结构化错误降级成 UNKNOWN，界面就没有「去登录」）", () => {
    const resolved = npm();

    if (!resolved.ok) throw new Error("应该解析得出");
    const kinds = resolved.steps.map((step) => step.kind);

    expect(kinds.indexOf('remove')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('remove')).toBeLessThan(kinds.indexOf('link'));
    expect(JSON.stringify(resolved.steps)).not.toContain('ln -sfn');
  });

  it("★ 注册表走 `env` 字段，不拼 `NAME=` 前缀（命令行里只有命令本身）", () => {
    const resolved = npm();

    if (!resolved.ok) throw new Error("应该解析得出");
    const env = resolved.steps.at(-1);

    expect(env).toEqual({
      kind: 'run',
      line: `'opencli' plugin install '${INSTALLED_DIR}'`,
      env: { NPM_CONFIG_REGISTRY: REGISTRY },
    });
    expect(JSON.stringify(resolved.steps.filter((step) => step.kind === 'run'))).not.toContain('NPM_CONFIG_REGISTRY=');
    expect(resolved.line).toContain(`NPM_CONFIG_REGISTRY='${REGISTRY}'`);
  });

  it("★ win32 下每一步都渲染得出来，且没有 POSIX-only 编排", () => {
    const resolved = npm();

    if (!resolved.ok) throw new Error("应该解析得出");
    for (const step of resolved.steps) {
      const text = planStepText(step, 'win32');
      for (const token of POSIX_ONLY) {
        expect(text, `${step.kind}: ${text}`).not.toContain(token);
      }
      expect(text).not.toMatch(BARE_ENV_PREFIX);
    }
    const line = planLineOf(resolved.steps, 'win32');
    for (const token of POSIX_ONLY) expect(line).not.toContain(token);
    expect(line).not.toMatch(BARE_ENV_PREFIX);
    expect(line).toContain("$env:NPM_CONFIG_REGISTRY=");
    const link = resolved.steps.find((step) => step.kind === 'link');
    if (link === undefined) throw new Error('计划里该有一条链接步');
    expect(planStepText(link, 'win32')).toContain('-ItemType Junction');
  });

  it("★ 人可照做的一行 = 把步骤按顺序连起来（没有 `|| true` 那种 shell 包装）", () => {
    const resolved = npm();

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.line).toBe(
      [
        `pnpm add --dir '${at('plugins-npm')}' 'opencli-plugin-demo@latest' ` +
          `--registry '${REGISTRY}' --store-dir '${at('pnpm-store')}' --config.cache-dir='${at('pnpm-cache')}' --config.state-dir='${at('pnpm-state')}' --allow-build='opencli-plugin-demo'`,
        `rm -rf '${PEER_DIR}'`,
        `mkdir -p '${PEER_PARENT}'`,
        `ln -s '${PEER_TARGET}' '${PEER_DIR}'`,
        "'opencli' plugin uninstall 'demo'",
        `NPM_CONFIG_REGISTRY='${REGISTRY}' 'opencli' plugin install '${INSTALLED_DIR}'`,
      ].join(" && "),
    );
  });

  it("版本号可以是具体的（升级时传源上那一版）", () => {
    const resolved = npm({ version: "1.0.40" });

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(runLineOf(resolved.steps[0])).toContain(
      "'opencli-plugin-demo@1.0.40'",
    );
  });

  it("★ 升级（mode: update）只重装 prefix + peer 链接：那两步即生效，不必再 plugin install", () => {
    const resolved = npm({ version: "1.0.40", mode: "update" });

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.steps.map((step) => step.kind)).toEqual([
      'run',
      'remove',
      'mkdir',
      'link',
    ]);
    expect(runLineOf(resolved.steps[0])).toContain(
      "'opencli-plugin-demo@1.0.40'",
    );
    expect(resolved.line).not.toContain("plugin install");
    expect(resolved.line).not.toContain("plugin uninstall");
  });

  it("用同一条 opencli 命令（探测与装不能各用一条 —— 否则装到别处去了）", () => {
    const resolved = npm({ command: "/opt/wb/bin/opencli" });

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(kindOf(resolved.steps.at(-1))).toBe('run');
    expect(runLineOf(resolved.steps.at(-1))).toContain(
      `'/opt/wb/bin/opencli' plugin install`,
    );
  });

  it('★ 变量没设、清单也没给缺省地址 → env-missing，并报出是哪个变量（界面据此说"先设它"）', () => {
    vi.stubEnv("DSH_HOME", DSH_HOME);
    vi.stubEnv(ENV, "");

    expect(
      resolvePluginSource(
        { kind: "npm", package: "opencli-plugin-demo", registryEnv: ENV },
        process.env,
      ),
    ).toEqual({ ok: false, problem: "env-missing", env: ENV });
  });

  it("★ 变量没设、清单给了缺省地址 → 用它（别再让用户去终端 export）", () => {
    vi.stubEnv("DSH_HOME", DSH_HOME);
    vi.stubEnv(ENV, "");

    const resolved = resolvePluginSource(
      {
        kind: "npm",
        package: "opencli-plugin-demo",
        registryEnv: ENV,
        registryDefault: "https://npm.example.com/module-own",
      },
      process.env,
    );

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.line).toContain(
      "--registry 'https://npm.example.com/module-own'",
    );
    expect(resolved.steps.at(-1)).toMatchObject({
      env: { NPM_CONFIG_REGISTRY: "https://npm.example.com/module-own" },
    });
  });

  it("★ 环境变量设了 → **它压过**缺省地址（换环境的机器只改这一处）", () => {
    vi.stubEnv("DSH_HOME", DSH_HOME);
    vi.stubEnv(ENV, REGISTRY);

    const resolved = resolvePluginSource(
      {
        kind: "npm",
        package: "opencli-plugin-demo",
        registryEnv: ENV,
        registryDefault: "https://npm.example.com/module-own",
      },
      process.env,
    );

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.line).toContain(`--registry '${REGISTRY}'`);
    expect(resolved.steps.at(-1)).toMatchObject({
      env: { NPM_CONFIG_REGISTRY: REGISTRY },
    });
    expect(resolved.line).not.toContain("module-own");
    expect(JSON.stringify(resolved.steps)).not.toContain("module-own");
  });

  it("包名是空的 → malformed（等于没声明）", () => {
    vi.stubEnv("DSH_HOME", DSH_HOME);
    vi.stubEnv(ENV, REGISTRY);

    expect(
      resolvePluginSource(
        { kind: "npm", package: "  ", registryEnv: ENV },
        process.env,
      ),
    ).toEqual({
      ok: false,
      problem: "malformed",
    });
  });

  it("没给插件名时不编一个兜底卸载（名字不许猜）", () => {
    const resolved = npm({ plugin: "" });

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.steps).toHaveLength(5);
    expect(resolved.line).not.toContain("plugin uninstall");
  });
});

describe("pnpm 的 store 跟随既有 node_modules（vendor 那一处）", () => {
  function atHome(home: string, ...parts: string[]): string {
    return path.join(home, 'workbench', 'opencli', ...parts);
  }

  it("★ 事故那一幕：既有 plugins-npm/node_modules 记 pnpm-store → 命令里就是 pnpm-store", () => {
    const home = tempHome(atHome('/tmp/other-home', 'pnpm-store'));

    expect(npmAt(home)).toContain(`--store-dir '${atHome('/tmp/other-home', 'pnpm-store')}'`);
  });

  it("★ 既有记的是 npm-cache → 跟着 npm-cache（装好的那份 store 不翻面）", () => {
    const home = tempHome(atHome('/tmp/other-home', 'npm-cache'));
    const line = npmAt(home);

    expect(line).toContain(`--store-dir '${atHome('/tmp/other-home', 'npm-cache')}'`);
    expect(line).not.toContain(`--store-dir '${atHome(home, 'pnpm-store')}'`);
  });

  it("没有既有 node_modules → 默认 pnpm-store", () => {
    const home = tempHome(undefined);

    expect(npmAt(home)).toContain(`--store-dir '${atHome(home, 'pnpm-store')}'`);
  });
});
