import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isolatedRoot,
  libsBinDir,
  npmCacheDir,
  pnpmStoreDir,
  storeDirFor,
  toolchainOpencliDir,
  vendorPluginsDir,
} from '../foundation/paths.js';

function readerOf(text: string | undefined): {
  readonly seen: string[];
  readonly read: (file: string) => string | undefined;
} {
  const seen: string[] = [];
  return {
    seen,
    read: (file) => {
      seen.push(file);
      return text;
    },
  };
}

describe('隔离运行时的路径（opencli 那套布局）', () => {
  it('★ 默认集合的根还是 <workbench>/opencli（老 profile 的插件、工具链、缓存都还找得到）', () => {
    expect(isolatedRoot().endsWith(join('workbench', 'opencli'))).toBe(true);
  });

  it('共用依赖的 bin 目录就在 libs 下面，插件在 plugins-npm 下面', () => {
    expect(libsBinDir().endsWith(join('opencli', 'libs', 'node_modules', '.bin'))).toBe(true);
    expect(npmCacheDir().endsWith(join('opencli', 'npm-cache'))).toBe(true);
    expect(pnpmStoreDir().endsWith(join('opencli', 'pnpm-store'))).toBe(true);
    expect(vendorPluginsDir().endsWith(join('opencli', 'plugins-npm', 'node_modules'))).toBe(true);
    expect(toolchainOpencliDir().endsWith(join('opencli', 'toolchain', 'node_modules', '@jackwener', 'opencli'))).toBe(true);
  });
});

describe('pnpm 的 store 跟随既有 node_modules（装好的那份不许翻面）', () => {
  const project = join(isolatedRoot(), 'toolchain');
  const modulesYaml = join(project, 'node_modules', '.modules.yaml');

  it('读的就是 <projectDir>/node_modules/.modules.yaml', () => {
    const { seen, read } = readerOf('storeDir: /opt/store\n');

    storeDirFor(project, read);

    expect(seen).toEqual([modulesYaml]);
  });

  it('★ 事故那一幕：既有记的是 pnpm-store → 命令里也还是 pnpm-store', () => {
    const { read } = readerOf(`storeDir: ${join(isolatedRoot(), 'pnpm-store')}\n`);

    expect(storeDirFor(project, read)).toBe(join(isolatedRoot(), 'pnpm-store'));
  });

  it('★ 既有记的是 npm-cache → 跟着 npm-cache（老安装留下的那份不翻面）', () => {
    const { read } = readerOf(`storeDir: ${join(isolatedRoot(), 'npm-cache')}\n`);

    expect(storeDirFor(project, read)).toBe(join(isolatedRoot(), 'npm-cache'));
  });

  it('值被单引号或双引号包住 → 去掉配对的那一对', () => {
    expect(storeDirFor(project, readerOf("storeDir: '/opt/store-a'\n").read)).toBe('/opt/store-a');
    expect(storeDirFor(project, readerOf('storeDir: "/opt/store-b"\n').read)).toBe('/opt/store-b');
  });

  it('值没配对引号 / 前后有空白 → 原样留下、空白裁掉', () => {
    expect(storeDirFor(project, readerOf("storeDir: '/opt/store-c\n").read)).toBe("'/opt/store-c");
    expect(storeDirFor(project, readerOf('storeDir:    /opt/store-d   \n').read)).toBe('/opt/store-d');
  });

  it('不止一行时取 storeDir 那一行（别的键不许干扰）', () => {
    const text = ['hoistPattern:', '  - "*"', 'storeDir: /opt/store-e', 'virtualStoreDir: .pnpm'].join('\n');

    expect(storeDirFor(project, readerOf(text).read)).toBe('/opt/store-e');
  });

  it('读不到文件 → 默认 pnpm-store', () => {
    expect(storeDirFor(project, readerOf(undefined).read)).toBe(join(isolatedRoot(), 'pnpm-store'));
  });

  it('没有 storeDir 那一行 / 值是空的 → 默认 pnpm-store', () => {
    expect(storeDirFor(project, readerOf('virtualStoreDir: .pnpm\n').read)).toBe(join(isolatedRoot(), 'pnpm-store'));
    expect(storeDirFor(project, readerOf('storeDir:\n').read)).toBe(join(isolatedRoot(), 'pnpm-store'));
  });
});

describe('真实的 .modules.yaml 是 JSON 数据（pnpm 10 写的就是这个）', () => {
  const project = join(isolatedRoot(), 'toolchain');
  const npmCache = join(isolatedRoot(), 'npm-cache');
  const realShape = [
    '{',
    '  "hoistedDependencies": {',
    '    "demo@1.0.0": {',
    '      "demo": "private"',
    '    }',
    '  },',
    `  "storeDir": "${npmCache}",`,
    '  "virtualStoreDir": "node_modules/.pnpm",',
    '  "packageManager": "pnpm@10.32.1"',
    '}',
    '',
  ].join('\n');

  it('★ 贴合真实文件：{ + hoistedDependencies + virtualStoreDir 的多行 JSON 里跟随 storeDir', () => {
    expect(storeDirFor(project, readerOf(realShape).read)).toBe(npmCache);
  });

  it('★ 事故那一幕（JSON 形态）：既有记 pnpm-store → 还是 pnpm-store', () => {
    const store = join(isolatedRoot(), 'pnpm-store');
    const text = JSON.stringify({ storeDir: store, virtualStoreDir: 'node_modules/.pnpm' }, null, 2);

    expect(storeDirFor(project, readerOf(text).read)).toBe(store);
  });

  it('★ Windows 的转义路径还原成单反斜杠（`C:\\\\Users\\\\x` → `C:\\Users\\x`）', () => {
    const store = 'C:\\Users\\you\\.dsh\\workbench\\opencli\\pnpm-store';
    const text = JSON.stringify({ hoistedDependencies: {}, storeDir: store }, null, 2);

    expect(text).toContain('\\\\');
    expect(storeDirFor(project, readerOf(text).read)).toBe(store);
    expect(storeDirFor(project, readerOf(text).read)).not.toContain('\\\\');
  });

  it('缩进 + 引号 + 尾逗号的写法也认（值不在行首 storeDir:）', () => {
    const text = '{\n  "storeDir": "/opt/store-json",\n  "virtualStoreDir": "node_modules/.pnpm"\n}';

    expect(storeDirFor(project, readerOf(text).read)).toBe('/opt/store-json');
  });

  it('JSON 里没有 storeDir / 是空串 / 全是空白 → 默认 pnpm-store', () => {
    expect(storeDirFor(project, readerOf('{"virtualStoreDir":"node_modules/.pnpm"}').read)).toBe(
      join(isolatedRoot(), 'pnpm-store'),
    );
    expect(storeDirFor(project, readerOf('{"storeDir":""}').read)).toBe(join(isolatedRoot(), 'pnpm-store'));
    expect(storeDirFor(project, readerOf('{"storeDir":"   "}').read)).toBe(join(isolatedRoot(), 'pnpm-store'));
  });

  it('坏 JSON → 不抛，回落到 YAML 行解析', () => {
    expect(storeDirFor(project, readerOf("{\nstoreDir: '/opt/store-broken'\n").read)).toBe('/opt/store-broken');
    expect(storeDirFor(project, readerOf('{"storeDir": "/opt/truncated"').read)).toBe(join(isolatedRoot(), 'pnpm-store'));
    expect(storeDirFor(project, readerOf('[').read)).toBe(join(isolatedRoot(), 'pnpm-store'));
  });
});
