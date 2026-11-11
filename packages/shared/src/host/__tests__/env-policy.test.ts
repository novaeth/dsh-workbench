import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapEnvOf,
  envTextOf,
  inheritedEnvOf,
  overlayEnvOf,
  pathWithBinsOf,
  productEnvOf,
  productHomeEnv,
  promptlessGitEnvOf,
  promptlessProcessEnvOf,
  unitEnvOf,
} from '../env-policy.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-env-policy-'));
const REAL_HOME = join(ROOT, 'real-home');
const RUNTIME = join(ROOT, 'workbench');
const DSH_HOME = process.env.DSH_HOME;

beforeAll(() => {
  mkdirSync(REAL_HOME, { recursive: true });
  writeFileSync(join(REAL_HOME, '.npmrc'), 'registry=https://example.test\n');
  writeFileSync(join(REAL_HOME, '.gitconfig'), '[user]\n');
  process.env.DSH_HOME = join(ROOT, 'dsh');
});

afterEach(() => {
  if (DSH_HOME === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = DSH_HOME;
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe('受控 env 入口', () => {
  it('product：HOME / 缓存全钉在运行时根，真 npmrc/gitconfig 只读指过去', () => {
    const env = productEnvOf({ runtimeRoot: RUNTIME, realHome: REAL_HOME });
    expect(env['HOME']).toBe(join(RUNTIME, 'home'));
    expect(env['DSH_WORKBENCH_HOME']).toBe(RUNTIME);
    expect(env['DSH_HOME']).toBe(join(ROOT, 'dsh'));
    expect(env['npm_config_cache']).toBe(join(RUNTIME, 'npm-cache'));
    expect(env['NPM_CONFIG_CACHE']).toBe(join(RUNTIME, 'npm-cache'));
    expect(env['npm_config_store_dir']).toBe(join(RUNTIME, 'pnpm-store'));
    expect(env['NPM_CONFIG_USERCONFIG']).toBe(join(REAL_HOME, '.npmrc'));
    expect(env['GIT_CONFIG_GLOBAL']).toBe(join(REAL_HOME, '.gitconfig'));
    expect(env['NO_UPDATE_NOTIFIER']).toBe('1');
  });

  it('product：没有真配置时不指过去', () => {
    const emptyHome = join(ROOT, 'empty-home');
    mkdirSync(emptyHome, { recursive: true });
    const env = productEnvOf({ runtimeRoot: RUNTIME, realHome: emptyHome });
    expect(env['NPM_CONFIG_USERCONFIG']).toBeUndefined();
    expect(env['GIT_CONFIG_GLOBAL']).toBeUndefined();
  });

  it('unit：HOME 与 npm/pnpm 目录钉到单元数据目录', () => {
    const unitRoot = join(RUNTIME, 'units', 'demo');
    const env = unitEnvOf({ runtimeRoot: RUNTIME, unitRoot, realHome: REAL_HOME });
    expect(env['HOME']).toBe(join(unitRoot, 'home'));
    expect(env['npm_config_cache']).toBe(join(unitRoot, 'npm-cache'));
    expect(env['npm_config_store_dir']).toBe(join(unitRoot, 'pnpm-store'));
    expect(env['DSH_WORKBENCH_HOME']).toBe(RUNTIME);
  });

  it('★ product/unit：USERPROFILE 也钉在隔离 home（Windows 上 os.homedir() 读它）', () => {
    const product = productEnvOf({ runtimeRoot: RUNTIME, realHome: REAL_HOME });
    expect(product['USERPROFILE']).toBe(join(RUNTIME, 'home'));
    const unitRoot = join(RUNTIME, 'units', 'demo');
    const unit = unitEnvOf({ runtimeRoot: RUNTIME, unitRoot, realHome: REAL_HOME });
    expect(unit['USERPROFILE']).toBe(join(unitRoot, 'home'));
    const explicit = productEnvOf({ runtimeRoot: RUNTIME, home: '/custom/home', realHome: REAL_HOME });
    expect(explicit['USERPROFILE']).toBe('/custom/home');
    expect(explicit['HOME']).toBe('/custom/home');
  });

  it('★ win32 形态的隔离 home 一并给 HOMEDRIVE/HOMEPATH', () => {
    const env = productEnvOf({ runtimeRoot: RUNTIME, home: 'C:\\rt\\home', realHome: REAL_HOME });
    expect(env['USERPROFILE']).toBe('C:\\rt\\home');
    expect(env['HOME']).toBe('C:\\rt\\home');
    expect(env['HOMEDRIVE']).toBe('C:');
    expect(env['HOMEPATH']).toBe('\\rt\\home');
    const posix = productEnvOf({ runtimeRoot: RUNTIME, realHome: REAL_HOME });
    expect(posix['HOMEDRIVE']).toBeUndefined();
    expect(posix['HOMEPATH']).toBeUndefined();
  });

  it('★ productHomeEnv 就是要给 launcher 的那一层：HOME + 平台对应的那套', () => {
    expect(productHomeEnv('/rt/home')).toEqual({ USERPROFILE: '/rt/home', HOME: '/rt/home' });
    const windowsHome = 'C:\\Users\\runner\\.dsh\\workbench\\opencli\\home';
    expect(productHomeEnv(windowsHome)).toEqual({
      USERPROFILE: windowsHome,
      HOMEDRIVE: 'C:',
      HOMEPATH: '\\Users\\runner\\.dsh\\workbench\\opencli\\home',
      HOME: windowsHome,
    });
    const product = productEnvOf({ runtimeRoot: RUNTIME, home: windowsHome, realHome: REAL_HOME });
    for (const [key, value] of Object.entries(productHomeEnv(windowsHome))) expect(product[key]).toBe(value);
  });

  it('bootstrap：继承父环境、HOME/缓存钉住、PATH 可替换、pwsh 加 USERPROFILE', () => {
    const parent = { PATH: '/usr/bin', KEEP: 'yes' };
    const env = bootstrapEnvOf({
      root: join(RUNTIME, 'opencli'),
      realHome: REAL_HOME,
      shellKind: 'posix',
      parent,
      path: '/desktop/bin' + delimiter + '/usr/bin',
    });
    expect(env['KEEP']).toBe('yes');
    expect(env['PATH']).toBe('/desktop/bin' + delimiter + '/usr/bin');
    expect(env['HOME']).toBe(join(RUNTIME, 'opencli', 'home'));
    expect(env['npm_config_cache']).toBe(join(RUNTIME, 'opencli', 'npm-cache'));
    expect(env['NPM_CONFIG_USERCONFIG']).toBe(join(REAL_HOME, '.npmrc'));
    expect(env['NO_COLOR']).toBe('1');
    expect(env['TERM']).toBe('dumb');
    expect(env['USERPROFILE']).toBeUndefined();
    const pwsh = bootstrapEnvOf({ root: join(RUNTIME, 'opencli'), realHome: REAL_HOME, shellKind: 'pwsh', parent });
    expect(pwsh['USERPROFILE']).toBe(join(RUNTIME, 'opencli', 'home'));
  });

  it('promptless：posix 关 askpass 指向 false，win32 删掉父进程的 askpass', () => {
    const posix = promptlessGitEnvOf('darwin');
    expect(posix['GIT_TERMINAL_PROMPT']).toBe('0');
    expect(posix['GIT_ASKPASS']).toBe('/usr/bin/false');
    const win = promptlessGitEnvOf('win32');
    expect(win).not.toHaveProperty('GIT_ASKPASS');
    const parent = { GIT_ASKPASS: 'C:/evil.exe', KEEP: '1' };
    const merged = promptlessProcessEnvOf(parent, 'win32');
    expect(merged['GIT_ASKPASS']).toBeUndefined();
    expect(merged['KEEP']).toBe('1');
    expect(merged['GIT_TERMINAL_PROMPT']).toBe('0');
  });

  it('叠层：undefined 删键，envTextOf 丢掉非字符串', () => {
    const merged = overlayEnvOf({ A: '1', B: '2' }, { B: undefined, C: '3' });
    expect(merged).toEqual({ A: '1', C: '3' });
    expect(inheritedEnvOf({ A: '1' })).toEqual({ A: '1' });
    expect(envTextOf({ A: '1', B: undefined })).toEqual({ A: '1' });
  });

  it('PATH 前插去重', () => {
    expect(pathWithBinsOf(['/a', '/b'].join(delimiter), ['/a', '/c'])).toBe(['/a', '/c', '/b'].join(delimiter));
    expect(pathWithBinsOf(undefined, ['/x'])).toBe('/x');
  });
});
