import path from 'node:path';
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePluginSource } from '../plugin-source.js';

const DSH_HOME = "/tmp/dshhome";
const ROOT = path.join(DSH_HOME, 'workbench', 'opencli');
const at = (...parts: string[]): string => path.join(ROOT, ...parts);
const REGISTRY = "https://npm.example.com/team/repo";
const ENV = "DSH_WB_TEST_REGISTRY";

afterEach(() => {
  vi.unstubAllEnvs();
});

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
      commands: [{ line: "'opencli' plugin install 'git@x:demo.git'" }],
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
      commands: [{ line: "'opencli' plugin install '/opt/plugin'" }],
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
  it("★ 首次安装：三步 + 一步兜底，**第一步不是 `-g`**", () => {
    const resolved = npm();

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.commands).toHaveLength(4);
    expect(resolved.commands[0]?.line).toBe(
      `npm i --prefix '${at('plugins-npm')}' 'opencli-plugin-demo@latest' ` +
        `--registry '${REGISTRY}' --cache '${at('npm-cache')}'`,
    );
    expect(resolved.commands[1]?.line).toBe(
      `rm -rf '${at('plugins-npm', 'node_modules', '@jackwener', 'opencli')}' && ` +
        `mkdir -p '${at('plugins-npm', 'node_modules', '@jackwener')}' && ` +
        `ln -s '${at('toolchain', 'node_modules', '@jackwener', 'opencli')}' ` +
        `'${at('plugins-npm', 'node_modules', '@jackwener', 'opencli')}'`,
    );
    expect(resolved.commands[2]).toEqual({
      line: "'opencli' plugin uninstall 'demo'",
      optional: true,
    });
    expect(resolved.commands[3]?.line).toBe(
      `NPM_CONFIG_REGISTRY='${REGISTRY}' 'opencli' plugin install ` +
        `'${at('plugins-npm', 'node_modules', 'opencli-plugin-demo')}'`,
    );
  });

  it("★ peer 链接必须「先删再链」（那份副本会让结构化错误降级成 UNKNOWN，界面就没有「去登录」）", () => {
    const resolved = npm();

    if (!resolved.ok) throw new Error("应该解析得出");
    const link = resolved.commands[1]?.line ?? "";

    expect(link.indexOf("rm -rf")).toBeGreaterThanOrEqual(0);
    expect(link.indexOf("rm -rf")).toBeLessThan(link.indexOf("ln -s"));
    expect(link).not.toContain("ln -sfn");
  });

  it("★ 人可照做的一行 = 把命令连起来；兜底那条包成 `(… || true)`（照抄也不会被它卡住）", () => {
    const resolved = npm();

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.line).toBe(
      [
        `npm i --prefix '${at('plugins-npm')}' 'opencli-plugin-demo@latest' ` +
          `--registry '${REGISTRY}' --cache '${at('npm-cache')}'`,
        `rm -rf '${at('plugins-npm', 'node_modules', '@jackwener', 'opencli')}' && ` +
          `mkdir -p '${at('plugins-npm', 'node_modules', '@jackwener')}' && ` +
          `ln -s '${at('toolchain', 'node_modules', '@jackwener', 'opencli')}' ` +
          `'${at('plugins-npm', 'node_modules', '@jackwener', 'opencli')}'`,
        "('opencli' plugin uninstall 'demo' || true)",
        `NPM_CONFIG_REGISTRY='${REGISTRY}' 'opencli' plugin install ` +
          `'${at('plugins-npm', 'node_modules', 'opencli-plugin-demo')}'`,
      ].join(" && "),
    );
  });

  it("版本号可以是具体的（升级时传源上那一版）", () => {
    const resolved = npm({ version: "1.0.40" });

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.commands[0]?.line).toContain(
      "'opencli-plugin-demo@1.0.40'",
    );
  });

  it("★ 升级（mode: update）只重装 prefix + peer 链接：那两步即生效，不必再 plugin install", () => {
    const resolved = npm({ version: "1.0.40", mode: "update" });

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.commands).toHaveLength(2);
    expect(resolved.commands[0]?.line).toContain(
      "'opencli-plugin-demo@1.0.40'",
    );
    expect(resolved.line).not.toContain("plugin install");
    expect(resolved.line).not.toContain("plugin uninstall");
  });

  it("用同一条 opencli 命令（探测与装不能各用一条 —— 否则装到别处去了）", () => {
    const resolved = npm({ command: "/opt/wb/bin/opencli" });

    if (!resolved.ok) throw new Error("应该解析得出");
    expect(resolved.commands[3]?.line).toContain(
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
    expect(resolved.line).toContain(
      "NPM_CONFIG_REGISTRY='https://npm.example.com/module-own'",
    );
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
    expect(resolved.line).not.toContain("module-own");
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
    expect(resolved.commands).toHaveLength(3);
    expect(resolved.line).not.toContain("plugin uninstall");
  });
});
