import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { describe, expect, it } from 'vitest';
import { filesOf, findFileOf, installedVersionOf, queryCommandOf, renderNameText, runSurfaceQuery, toolchainBinAmong, toolchainBinOf } from '../diy-components';

const PACKAGES_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const MODULE_TOOL_BIN = join(PACKAGES_DIR, 'module-tools', 'bin', 'dsh-wb-module.mjs');
const PRIMITIVES_DIR = join(PACKAGES_DIR, 'workbench', 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives');

describe('workbench_diy_components · 工具链回话不对的时候', () => {
  it('★ 非零退出码：报错带上退出码与末尾三行（不假装拿到了清单）', async () => {
    const reply = () => ({ exitCode: 2, stdout: 'line-a\nline-b\nline-c\nline-d\n', stderr: 'boom\n' });

    await expect(
      runSurfaceQuery(createFakeShell(reply).shell, '/w/bin/dsh-wb-module', 'primitives', '/w/root'),
    ).rejects.toThrow(/没跑通（exit 2）/);
    await expect(
      runSurfaceQuery(createFakeShell(reply).shell, '/w/bin/dsh-wb-module', 'kit', '/w/root'),
    ).rejects.toThrow(/c \| line-d/);
  });

  it('★ 退出码 0 但 stdout 不是 JSON：报错带上最后两行，别把裸文本当清单', async () => {
    const reply = () => ({ stdout: 'Command failed\nplain text\n' });

    await expect(
      runSurfaceQuery(createFakeShell(reply).shell, '/w/bin/dsh-wb-module', 'primitives', '/w/root'),
    ).rejects.toThrow(/没回 JSON/);
    await expect(
      runSurfaceQuery(createFakeShell(reply).shell, '/w/bin/dsh-wb-module', 'kit', '/w/root'),
    ).rejects.toThrow(/plain text/);
  });

  it('★ 判据红（exit 1）但机器档还在：照常返回清单，且**诊断被丢掉**（这是清单工具）', async () => {
    const payload = { buckets: { components: ['Card'] }, problems: ['@neg/module-kit: 产物用了这份外壳里没有的 kit.components.StateBlock'] };
    const fake = createFakeShell(() => ({ exitCode: 1, stdout: `${JSON.stringify(payload)}\n`, stderr: '' }));

    const got = await runSurfaceQuery(fake.shell, '/w/bin/dsh-wb-module', 'kit', '/w/root');
    expect(got).toEqual({ buckets: { components: ['Card'] } });
    expect('problems' in got).toBe(false);
  });

  it('★ 判据红且没有机器档：报错要说清是"判据红"而不是工具链坏了，并把 findings 带上', async () => {
    const findings = '@neg/module-kit: 产物用了这份外壳里没有的 kit.components.StateBlock —— 卡片首帧会炸';
    const fake = createFakeShell(() => ({ exitCode: 1, stdout: `${findings}\n`, stderr: '' }));

    await expect(runSurfaceQuery(fake.shell, '/w/bin/dsh-wb-module', 'kit', '/w/root')).rejects.toThrow(
      /不是工具链坏了，是工作区里有模块过不了判据/,
    );
    await expect(runSurfaceQuery(fake.shell, '/w/bin/dsh-wb-module', 'kit', '/w/root')).rejects.toThrow(
      /kit.components.StateBlock/,
    );
  });

  it('合法 JSON 但不是对象（比如就一个 null）：当"没回 JSON"处理 —— 不假装是空表', async () => {
    await expect(
      runSurfaceQuery(createFakeShell(() => ({ stdout: 'null' })).shell, '/w/bin/dsh-wb-module', 'kit', '/w/root'),
    ).rejects.toThrow(/没回 JSON/);
  });

  it('★ 没回 JSON 又没给后备：报错点明"把 module-tools 升到 ^0.3.4"', async () => {
    const fake = createFakeShell(() => ({ stdout: '✔ 人话一行\n' }));

    await expect(runSurfaceQuery(fake.shell, '/w/old/dsh-wb-module', 'kit', '/w/root')).rejects.toThrow(
      /把 @dsh-workbench\/module-tools 升到 \^0\.3\.4/,
    );
    expect(fake.calls).toHaveLength(1);
  });

  it('★★ 本仓那份工具链太旧（没 --json）⇒ 退到跑着的那份外壳自带的工具链', async () => {
    const payload = { primitives: { files: { '/x/Button.d.ts': {} } } };
    const fake = createFakeShell((call) => ({
      stdout: String(call.command).includes('/w/old/') ? '✔ 人话一行\n' : `${JSON.stringify(payload)}\n`,
    }));

    const got = await runSurfaceQuery(fake.shell, '/w/old/dsh-wb-module', 'primitives', '/w/root', '/w/new/dsh-wb-module');

    expect(got).toEqual(payload);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]?.command).toContain('/w/new/dsh-wb-module');
    expect(fake.calls[1]?.workdir).toBe('/w/root');
  });

  it('★ 本仓那份就跑得通 ⇒ 不碰外壳自带那份（只发一条命令）', async () => {
    const fake = createFakeShell(() => ({ stdout: JSON.stringify({ kit: {} }) }));

    await runSurfaceQuery(fake.shell, '/w/old/dsh-wb-module', 'kit', '/w/root', '/w/new/dsh-wb-module');

    expect(fake.calls).toHaveLength(1);
  });

  it('★★ 两份都没回 JSON ⇒ 报错说清"连外壳自带那份也没回"（不指向本仓）', async () => {
    const fake = createFakeShell(() => ({ stdout: '✔ 人话一行\n' }));

    await expect(
      runSurfaceQuery(fake.shell, '/w/old/dsh-wb-module', 'kit', '/w/root', '/w/new/dsh-wb-module'),
    ).rejects.toThrow(/连跑着的那份外壳自带的工具链也没回 JSON/);
    expect(fake.calls).toHaveLength(2);
  });
});

describe('workbench_diy_components · 真跑一遍工具链', () => {
  it.skipIf(!existsSync(MODULE_TOOL_BIN) || !existsSync(PRIMITIVES_DIR))(
    '★ 一条龙：runShell（resolve → execute → result）跑真 CLI、解析 JSON、落到 Button 的声明',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'dsh-wb-run-'));
      try {
        mkdirSync(join(root, 'packages'), { recursive: true });
        const binDir = join(root, 'node_modules', '.bin');
        mkdirSync(binDir, { recursive: true });
        const wrapper = join(binDir, 'dsh-wb-module');
        writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${MODULE_TOOL_BIN}" "$@"\n`, { mode: 0o755 });
        const scope = join(root, 'node_modules', '@deepseek-ai');
        mkdirSync(scope, { recursive: true });
        symlinkSync(PRIMITIVES_DIR, join(scope, 'dsh-client-ui-primitives'));

        const bin = toolchainBinOf(root);
        expect(bin).toBe(wrapper);
        const fake = createFakeShell((call) => ({
          stdout: execFileSync('/bin/sh', ['-c', call.command], { cwd: call.workdir, encoding: 'utf8' }),
        }));

        const payload = await runSurfaceQuery(fake.shell, bin as string, 'primitives', root);

        expect(fake.calls[0]?.workdir).toBe(root);
        expect(installedVersionOf(payload)).toMatch(/^\d+\.\d+\.\d+/);
        expect(Object.keys(filesOf(payload)).length).toBeGreaterThan(90);
        const text = renderNameText('Button', findFileOf('Button', { primitives: payload }), { primitives: payload });
        expect(text).toContain('Render a button.');
        expect(text).toContain("@param props.variant - visual family (default 'ghost')");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

describe('workbench_diy_components · 工具链', () => {
  it('★ 先认工坊根 node_modules/.bin 里的那个，其次认包里的 bin 脚本（路径带引号后再进 shell）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-bin-'));
    try {
      expect(toolchainBinOf(dir)).toBeNull();
      const script = join(dir, 'node_modules', '@dsh-workbench', 'module-tools', 'bin');
      mkdirSync(script, { recursive: true });
      const file = join(script, 'dsh-wb-module.mjs');
      writeFileSync(file, '');
      expect(toolchainBinOf(dir)).toBe(file);
      const binDir = join(dir, 'node_modules', '.bin');
      mkdirSync(binDir, { recursive: true });
      const bin = join(binDir, 'dsh-wb-module');
      writeFileSync(bin, '');
      expect(toolchainBinOf(dir)).toBe(bin);
      expect(queryCommandOf(bin, 'primitives')).toBe(`'${bin}' check --only primitives --json`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('路径里有空格也要引起来（工坊可能住在「我的 文档」这种地方）', () => {
    expect(queryCommandOf('/w/my work/dsh-wb-module', 'kit')).toBe("'/w/my work/dsh-wb-module' check --only kit --json");
  });

  it('★★ 根上没有工具链就往模块包里找（modules-repo 那种「工具链只在各模块包 node_modules」的布局）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-wb-among-'));
    try {
      const moduleDir = join(root, 'packages', 'module-demo');
      mkdirSync(moduleDir, { recursive: true });

      expect(toolchainBinAmong(root, [moduleDir])).toBeNull();
      expect(toolchainBinAmong(root, [])).toBeNull();

      const inModule = join(moduleDir, 'node_modules', '.bin');
      mkdirSync(inModule, { recursive: true });
      const bin = join(inModule, 'dsh-wb-module');
      writeFileSync(bin, '');

      expect(toolchainBinAmong(root, [moduleDir])).toBe(bin);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('根上有就用根上的（模块包那份只是后备）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-wb-among-root-'));
    try {
      const moduleDir = join(root, 'packages', 'module-demo');
      const ownBin = join(root, 'node_modules', '.bin');
      mkdirSync(ownBin, { recursive: true });
      mkdirSync(join(moduleDir, 'node_modules', '.bin'), { recursive: true });
      writeFileSync(join(ownBin, 'dsh-wb-module'), '');
      writeFileSync(join(moduleDir, 'node_modules', '.bin', 'dsh-wb-module'), '');

      expect(toolchainBinAmong(root, [moduleDir])).toBe(join(ownBin, 'dsh-wb-module'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
