import type { DshShell } from '@dsh-workbench/shared';
import { actBrowser } from './diy-browser-act';
import { runBrowserStep } from './diy-browser';
import { OPEN_TIMEOUT_MS, SETTLE_MS, releaseQuietly } from './diy-record';

const PAGE_HREF_SCRIPT = 'JSON.stringify({ href: location.href })';

export function samePageOf(here: string, want: string): boolean {
  const norm = (one: string): string => one.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return here !== '' && norm(here) === norm(want);
}

async function whereAtOf(input: {
  readonly shell: DshShell;
  readonly command: string;
  readonly session: string;
}): Promise<string> {
  const step = await actBrowser(input.shell, input.command, input.session, ['eval', PAGE_HREF_SCRIPT]);
  const href = step.payload === undefined ? '' : step.payload['href'];
  return typeof href === 'string' ? href : '';
}

async function settleOf(input: { readonly shell: DshShell; readonly command: string; readonly session: string }): Promise<void> {
  await runBrowserStep(
    input.shell,
    input.command,
    ['browser', input.session, 'wait', 'time', String(SETTLE_MS / 1000)],
    OPEN_TIMEOUT_MS,
  );
}

export async function openRecordPage(input: {
  readonly shell: DshShell;
  readonly command: string;
  readonly session: string;
  readonly url: string;
  readonly captureFile: string;
}): Promise<{ readonly ok: boolean; readonly at: string; readonly why: string }> {
  await releaseQuietly(input);
  const opened = await runBrowserStep(
    input.shell,
    input.command,
    ['browser', input.session, 'tab', 'new', input.url, '--window', 'foreground'],
    OPEN_TIMEOUT_MS,
  );
  if (!opened.ok) {
    return {
      ok: false,
      at: '',
      why:
        `开不了录制窗：${opened.stderr || opened.stdout || '运行时那边报了个错'}。` +
        '先让用户把工作台那一页切到前台（第一次要这样），或跑一次运行时自检（doctor）看扩展连没连上。',
    };
  }
  await settleOf(input);
  let at = await whereAtOf(input);
  if (!samePageOf(at, input.url)) {
    await runBrowserStep(
      input.shell,
      input.command,
      ['browser', input.session, 'open', input.url],
      OPEN_TIMEOUT_MS,
    );
    await settleOf(input);
    at = await whereAtOf(input);
  }
  if (!samePageOf(at, input.url)) {
    return {
      ok: false,
      at,
      why:
        `那一页没开起来（现在开的是 ${at === '' ? '一张空白页' : at}）—— 再看一眼 Chrome 里那扇录制窗，` +
        '或跑一次运行时自检（doctor）看扩展连没连上。',
    };
  }
  return { ok: true, at, why: '' };
}
