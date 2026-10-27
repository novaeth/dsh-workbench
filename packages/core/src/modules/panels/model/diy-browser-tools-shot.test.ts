import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fixtureOf } from '@/shared/api/host/__tests__/png-fixtures';
import { PAGE, createBrowserRig } from '../__tests__/browser-tools-harness';
import { BROWSER_TOOLS, clipNote, clipOf, defaultShotPath, deviceClipRect } from './diy-browser-tools';
import {
  DIY_CLICK_TOOL,
  DIY_DIALOG_TOOL,
  DIY_HTML_TOOL,
  DIY_KEYS_TOOL,
  DIY_SCREENSHOT_TOOL,
  DIY_STATE_TOOL,
} from '../unit';

const { browserRig, run } = createBrowserRig();

describe('clip 在本地裁：CSS px × dpr，越界就退回整屏', () => {
  it('★★ clipOf 只认完整的正矩形', () => {
    expect(clipOf({ x: 1, y: 2, width: 30, height: 40 })).toEqual({ x: 1, y: 2, width: 30, height: 40 });
    expect(clipOf({ x: -1, y: 2, width: 30, height: 40 })).toBeUndefined();
    expect(clipOf({ x: 1, y: 2, width: 0, height: 40 })).toBeUndefined();
    expect(clipOf({})).toBeUndefined();
    expect(clipOf('x')).toBeUndefined();
    expect(clipOf(undefined)).toBeUndefined();
  });

  it('★★ deviceClipRect：四舍五入并夹到 ≥0 / ≥1', () => {
    expect(deviceClipRect({ x: 1, y: 2, width: 30, height: 40 }, 2)).toEqual({
      x: 2,
      y: 4,
      width: 60,
      height: 80,
    });
    expect(deviceClipRect({ x: -2, y: 1.4, width: 0.4, height: 10.6 }, 2)).toEqual({
      x: 0,
      y: 3,
      width: 1,
      height: 21,
    });
    expect(deviceClipRect({ x: 1, y: 2, width: 30, height: 40 }, Number.NaN)).toEqual({
      x: 1,
      y: 2,
      width: 30,
      height: 40,
    });
  });

  it('★ 视口里没话说；越界一句"给的是整屏图"', () => {
    expect(clipNote({ x: 10, y: 10, width: 100, height: 100 }, { width: 1440, height: 900 })).toBe('');

    const note = clipNote({ x: 1400, y: 50, width: 391, height: 251 }, { width: 1440, height: 900 });
    expect(note).toContain('整屏图');
    expect(note).toContain('视口');
  });

  it('★★ 量视口那条 eval 没回来（0×0）⇒ 说"没读到视口尺寸、裁不了"，不误报"不在视口里"', () => {
    const note = clipNote({ x: 10, y: 10, width: 100, height: 100 }, { width: 0, height: 0 });

    expect(note).toContain('没读到视口尺寸');
    expect(note).toContain('裁不了');
    expect(note).not.toContain('不在视口里');
  });

  it('★ 路径就是给的那个目录（取证目录由外面算好传进来）', () => {
    expect(defaultShotPath('/w/artifacts/demo', 'demo', 123)).toBe(join('/w/artifacts/demo', 'demo-123.png'));
    expect(defaultShotPath('/w/artifacts/demo', '', 123)).toBe(join('/w/artifacts/demo', 'page-123.png'));
  });
});

describe('★★ 端到端：命令形状是 browser workbench <verb>，返回体是 opencli 原样', () => {
  const pageThen = (value: string) => (line: string) => (line.includes("'eval'") ? { stdout: PAGE } : { stdout: value });

  it('★★ 每条都钉死会话 workbench、带 --window background 与 OPENCLI_WINDOW=background', async () => {
    const rig = browserRig({ answer: pageThen('{"ok":true}') });
    const outcome = await run(rig, DIY_STATE_TOOL, { unit: 'demo', args: ['--source', 'ax'] });

    expect(outcome.ok).toBe(true);
    expect(outcome.unit).toBe('demo');
    expect(outcome.verb).toBe('state');
    expect([...outcome.argv]).toEqual(['--source', 'ax']);
    expect(rig.commands[1]).toContain(
      "'browser' 'workbench' 'state' '--source' 'ax' '--window' 'background'",
    );
    expect(rig.commands[1]).toContain('OPENCLI_WINDOW=background');
    expect(rig.commands[1]).not.toContain('--session');
  });

  it('★★ _html 是多词的 get html，scope=card 补 --selector', async () => {
    const rig = browserRig({ answer: pageThen('<div></div>') });
    const outcome = await run(rig, DIY_HTML_TOOL, { unit: 'demo', scope: 'card' });

    expect(rig.commands[1]).toContain(
      `'browser' 'workbench' 'get' 'html' '--selector' '#wb-card-demo .wb-card' '--window' 'background'`,
    );
    expect([...outcome.argv]).toEqual(['--selector', '#wb-card-demo .wb-card']);
  });

  it('★★ ok / exitCode / timedOut / truncated / stdout / stderr 一个都不加工', async () => {
    const rig = browserRig({
      answer: (line) =>
        line.includes("'eval'")
          ? { stdout: PAGE }
          : { stdout: 'out', stderr: 'boom', exitCode: 2, truncated: true },
    });
    const outcome = await run(rig, DIY_STATE_TOOL, { unit: 'demo', args: [] });

    expect(outcome.ok).toBe(false);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.timedOut).toBe(false);
    expect(outcome.truncated).toBe(true);
    expect(outcome.stdout).toBe('out');
    expect(outcome.stderr).toBe('boom');
  });

  it('★ 超时也照转：ok=false、timedOut=true', async () => {
    const rig = browserRig({
      answer: (line) => (line.includes("'eval'") ? { stdout: PAGE } : { timedOut: true, exitCode: null }),
    });
    const outcome = await run(rig, DIY_DIALOG_TOOL, { unit: 'demo', args: ['accept'] });

    expect(outcome.ok).toBe(false);
    expect(outcome.timedOut).toBe(true);
    expect(outcome.exitCode).toBeNull();
  });

  it('★ 不写 unit：工坊里只有一个模块就自动用它', async () => {
    const rig = browserRig({ answer: pageThen('{}') });
    const outcome = await run(rig, DIY_STATE_TOOL, { args: [] });

    expect(outcome.unit).toBe('demo');
  });

  it('★★ 要卡作用域却不给 unit ⇒ 当场拒，verb 一条命令都不发', async () => {
    const rig = browserRig({ scaffold: false, answer: () => ({ stdout: PAGE }) });

    await expect(run(rig, DIY_CLICK_TOOL, { args: ['.wb-cardOpen'], scope: 'card' })).rejects.toThrow(
      '要卡作用域',
    );
    expect(rig.commands.some((line) => line.includes("'click'"))).toBe(false);
  });

  it('★ timeoutMs 原样过给 shell；不给或 ≤0 都按 30000 算', async () => {
    const rig = browserRig({ answer: pageThen('{}') });
    const requests: { timeoutMs?: number }[] = [];
    const shell = rig.ctx.get('shell') as unknown as {
      resolve: (request: { command: string; timeoutMs?: number }) => unknown;
    };
    const original = shell.resolve.bind(shell);
    shell.resolve = (request: { command: string; timeoutMs?: number }) => {
      requests.push({ timeoutMs: request.timeoutMs });
      return original(request);
    };

    await run(rig, DIY_STATE_TOOL, { unit: 'demo', args: [], timeoutMs: 1234 });

    expect(requests[1]?.timeoutMs).toBe(1234);
    expect(requests[0]?.timeoutMs).toBe(30000);

    await run(rig, DIY_STATE_TOOL, { unit: 'demo', args: [], timeoutMs: 0 });
    expect(requests.at(-1)?.timeoutMs).toBe(30000);

    await run(rig, DIY_STATE_TOOL, { unit: 'demo', args: [], timeoutMs: -5 });
    expect(requests.at(-1)?.timeoutMs).toBe(30000);
  });
});

describe('★★ _screenshot：clip 在本地裁，越界退回整屏', () => {
  const pathIn = (line: string): string => {
    const found = /'([^']*\.png)'/.exec(line);
    if (found === null) throw new Error(`截图命令里没有路径：${line}`);
    return found[1] ?? '';
  };

  function shotRig() {
    const rig = browserRig({
      answer: (line) => {
        if (line.includes('devicePixelRatio')) {
          return { stdout: JSON.stringify({ dpr: 1, width: 1440, height: 900 }) };
        }
        if (line.includes("'screenshot'")) {
          const file = pathIn(line);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, fixtureOf({ width: 900, height: 600, color: 2 }));
          return { stdout: `Screenshot saved to: ${file}` };
        }
        return { stdout: PAGE };
      },
    });
    return rig;
  }

  it('★★ clip 在视口里 ⇒ 本地裁掉那一块，文件真的变了', async () => {
    const rig = shotRig();
    const file = join(rig.root, 'shot.png');
    const original = fixtureOf({ width: 900, height: 600, color: 2 });
    const outcome = await run(rig, DIY_SCREENSHOT_TOOL, {
      unit: 'demo',
      args: [file],
      clip: { x: 0, y: 0, width: 10, height: 6 },
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.cropped).toBe(true);
    expect(outcome.file).toBe(file);
    expect(rig.commands.some((line) => line.includes('devicePixelRatio'))).toBe(true);
    expect(readFileSync(file).equals(original)).toBe(false);
  });

  it('★★ clip 在视口外 ⇒ 退回整屏图并说明，文件一个字节没动', async () => {
    const rig = shotRig();
    const file = join(rig.root, 'shot.png');
    const original = fixtureOf({ width: 900, height: 600, color: 2 });
    const outcome = await run(rig, DIY_SCREENSHOT_TOOL, {
      unit: 'demo',
      args: [file],
      clip: { x: 1400, y: 50, width: 391, height: 251 },
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.cropped).toBe(false);
    expect(outcome.cropReason).toContain('整屏图');
    expect(readFileSync(file).equals(original)).toBe(true);
  });

  it('★ 不给 clip 就不取 dpr、不裁', async () => {
    const rig = shotRig();
    const file = join(rig.root, 'shot.png');
    const outcome = await run(rig, DIY_SCREENSHOT_TOOL, { unit: 'demo', args: [file] });

    expect(outcome.ok).toBe(true);
    expect(outcome.file).toBe(file);
    expect(outcome.cropped).toBeUndefined();
    expect(outcome.cropReason).toBeUndefined();
    expect(rig.commands.some((line) => line.includes('devicePixelRatio'))).toBe(false);
  });

  it('★★ clip 是坏矩形 ⇒ cropped:false + 一句说明，不裁也不静默', async () => {
    for (const bad of [
      { x: 0, y: 0, width: 0, height: 6 },
      { x: -1, y: 0, width: 10, height: 6 },
    ]) {
      const rig = shotRig();
      const file = join(rig.root, 'shot.png');
      const original = fixtureOf({ width: 900, height: 600, color: 2 });
      const outcome = await run(rig, DIY_SCREENSHOT_TOOL, { unit: 'demo', args: [file], clip: bad });

      expect(outcome.ok, JSON.stringify(bad)).toBe(true);
      expect(outcome.cropped, JSON.stringify(bad)).toBe(false);
      expect(outcome.cropReason, JSON.stringify(bad)).toContain('不是完整矩形');
      expect(rig.commands.some((line) => line.includes('devicePixelRatio')), JSON.stringify(bad)).toBe(false);
      expect(readFileSync(file).equals(original), JSON.stringify(bad)).toBe(true);
    }
  });

  it('★★ 量视口那条 eval 没回来 ⇒ 退回整屏图 + "裁不了"，文件一个字节没动', async () => {
    const rig = browserRig({
      answer: (line) => {
        if (line.includes('devicePixelRatio')) return { stdout: '{}' };
        if (line.includes("'screenshot'")) {
          const file = pathIn(line);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, fixtureOf({ width: 900, height: 600, color: 2 }));
          return { stdout: 'saved' };
        }
        return { stdout: PAGE };
      },
    });
    const file = join(rig.root, 'shot.png');
    const original = fixtureOf({ width: 900, height: 600, color: 2 });
    const outcome = await run(rig, DIY_SCREENSHOT_TOOL, {
      unit: 'demo',
      args: [file],
      clip: { x: 0, y: 0, width: 10, height: 6 },
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.cropped).toBe(false);
    expect(outcome.cropReason).toContain('没读到视口尺寸');
    expect(outcome.cropReason).toContain('裁不了');
    expect(readFileSync(file).equals(original)).toBe(true);
  });

  it('★ 不给路径：自己落在工坊同级的 shots/ 下，并先建目录', async () => {
    const rig = shotRig();
    const outcome = await run(rig, DIY_SCREENSHOT_TOOL, { unit: 'demo', args: [] });

    expect(outcome.file).toContain(join(rig.root, 'workbench', 'artifacts'));
    expect(outcome.file).toContain('demo-');
    expect(rig.commands.some((line) => line.includes("'mkdir'"))).toBe(false);
  });
});

describe('★★ 前置照旧：没约定 / 板不对 ⇒ 一条 verb 命令都不发', () => {
  it('★★ 没有调试约定：14 把全拒，零命令', async () => {
    const rig = browserRig({ pact: false, answer: () => ({}) });

    for (const row of BROWSER_TOOLS) {
      await expect(run(rig, row.tool, { unit: 'demo', args: [] })).rejects.toThrow('没有调试约定');
    }
    expect(rig.commands).toEqual([]);
  });

  it('★★ 这一页画的是别的板：只发了握手，verb 一个都不发', async () => {
    const other = JSON.stringify({
      plugin: '@dsh-workbench/core',
      pid: 1,
      url: 'u',
      open: true,
      shown: true,
      title: 't',
      board: '/w/project',
    });
    const rig = browserRig({ answer: () => ({ stdout: other }) });

    await expect(run(rig, DIY_CLICK_TOOL, { unit: 'demo', args: ['.wb-cardOpen'], scope: 'card' })).rejects.toThrow(
      '不拿别的板当目标',
    );
    expect(rig.commands.some((line) => line.includes("'click'"))).toBe(false);
    expect(rig.commands).toHaveLength(1);
  });

  it('★★ 面板收着走同一道闸（说的是"收着"），也没发 verb', async () => {
    const closed = JSON.stringify({
      plugin: '@dsh-workbench/core',
      pid: 1,
      url: 'u',
      open: true,
      shown: false,
      title: 't',
    });
    const rig = browserRig({ answer: () => ({ stdout: closed }) });

    await expect(run(rig, DIY_KEYS_TOOL, { unit: 'demo', args: ['Escape'] })).rejects.toThrow('右栏收着');
    expect(rig.commands.some((line) => line.includes("'keys'"))).toBe(false);
  });
});
