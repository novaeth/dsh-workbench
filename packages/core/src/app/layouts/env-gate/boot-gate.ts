import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './BootGate.module.css';
import type { Translate } from '@dsh-workbench/shared';
import type { PreflightBridgeIssue, PreflightSnapshot, PreflightStep, PreflightStepId } from '@dsh-workbench/shared/host';
import { WAKE_BROWSER_ROUTE, type WakeBrowserReply } from '@/kernel/contract/preflight-wake';
import { apiGet } from '@dsh-workbench/shared';
import { LOCALE_NS } from '@dsh-workbench/shared';
import { devSurface } from '@/shared/dev-surface';
import { runtimeProfileValue } from '@/shared/hooks/use-runtime-capabilities';
import { bridgeAdvice, gateHintOf, showsRawAll, stepDetailText } from './gate-text';
import { createGateDeadline } from './gate-deadline';
import { el, spinnerIcon, svgIcon } from './gate-dom';

const POLL_MS = 400;

const GIVE_UP_MS = 120_000;

function stepLabel(step: PreflightStep, t: Translate): string {
  const id: PreflightStepId = step.id;
  if (id === 'toolchain') return t('env.step.toolchain');
  if (id === 'runtime') return step.label ?? t('env.step.adapter');
  if (id === 'cli') return t('env.step.runtime');
  if (id === 'warm') return t('env.step.warm');
  if (id === 'diy') return t('env.step.diy');
  return t('env.step.bridge');
}

function stepMark(step: PreflightStep): string {
  if (step.status === 'running') return '▸';
  if (step.status === 'ok') return '✓';
  if (step.status === 'warn') return '!';
  if (step.status === 'failed') return '×';
  return '-';
}

export function createForcePlan(): { next(): { hard?: 1 }; again(): void } {
  let hard = false;
  return {
    next() {
      const query = hard ? { hard: 1 as const } : {};
      hard = false;
      return query;
    },
    again() {
      hard = true;
    },
  };
}

export interface BootGate {
  close(): void;
}

export function gateActionOf(snapshot: PreflightSnapshot): 'close' | 'hold' | 'wait' {
  if (snapshot.phase === 'failed') return 'hold';
  if (snapshot.phase !== 'ready') return 'wait';
  if ((snapshot.bridgeIssues?.length ?? 0) > 0) return 'hold';
  return snapshot.diyGap === undefined ? 'close' : 'hold';
}

function commandRow(t: Translate): { row: HTMLElement; set(text: string | undefined): void } {
  const row = el('div', styles.commandRow);
  const code = el('code', styles.command);
  const copy = el('button', styles.copy);
  copy.setAttribute('type', 'button');
  copy.setAttribute('aria-label', t('env.copyCommand'));
  copy.title = t('env.copyCommand');
  copy.append(svgIcon('copy'));
  row.append(code, copy);

  let text: string | undefined;

  copy.addEventListener('click', () => {
    if (text === undefined) return;
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      copy.replaceChildren(svgIcon('check'));
      copy.title = t('env.copied');
      setTimeout(() => {
        copy.replaceChildren(svgIcon('copy'));
        copy.title = t('env.copyCommand');
      }, 1500);
    });
  });

  return {
    row,
    set(next) {
      text = next;
      code.textContent = next ?? '';
      row.hidden = next === undefined;
    },
  };
}

export function createBootGate(
  ctx: { locale: { bind(namespace: string): Translate } },
  options: { request?: typeof apiGet } = {},
): BootGate {
  const t = ctx.locale.bind(LOCALE_NS);
  const request = options.request ?? apiGet;
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || document.body === undefined) {
    return { close: () => {} };
  }
  const root = document.getElementById('root');

  const overlay = el('div', styles.gate);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('env.title'));
  const card = el('div', styles.card);
  const title = el('h1', styles.title, t('env.title'));
  const hint = el('p', styles.hint, t('env.checking'));
  const list = el('ul', styles.steps);
  const progressRow = el('div', styles.progress);
  progressRow.hidden = true;
  const elapsed = el('span', styles.elapsed);
  progressRow.append(elapsed);
  const rawAll = el('details', styles.raw);
  const rawAllBody = el('pre', styles.error);
  rawAll.append(el('summary', styles.rawSummary, t('env.fix.details')), rawAllBody);
  rawAll.hidden = true;
  const actions = el('div', styles.actions);
  actions.hidden = true;
  const fixTitle = el('h2', styles.fixTitle, t('env.fix.title'));
  const fixWhy = el('p', styles.hint);
  const fixStep = el('p', styles.hint);
  const fixAdvice = el('p', styles.hint);
  const raw = el('details', styles.raw);
  const rawSummary = el('summary', styles.rawSummary, t('env.fix.details'));
  const errorBox = el('pre', styles.error);
  raw.append(rawSummary, errorBox);
  const buttons = el('div', styles.buttons);
  const retry = el('button', styles.button, t('env.retry'));
  retry.setAttribute('type', 'button');
  const fixCommand = commandRow(t);

  buttons.append(retry);
  actions.append(fixTitle, fixWhy, fixStep, fixCommand.row, fixAdvice, buttons, raw);

  const bridge = el('div', styles.bridge);
  bridge.hidden = true;
  const bridgeTitle = el('h2', styles.fixTitle, t('env.fix.title'));
  const bridgeWhy = el('p', styles.hint, t('env.bridge.why'));
  const bridgeLines = el('ul', styles.bridgeLines);
  const bridgeCommand = commandRow(t);
  const wakeNote = el('p', styles.hint);
  wakeNote.hidden = true;
  const bridgeWake = el('button', styles.button, t('env.wake'));
  bridgeWake.setAttribute('type', 'button');
  const bridgeRetry = el('button', styles.button, t('env.retry'));
  bridgeRetry.setAttribute('type', 'button');
  const bridgeSkip = el('button', styles.button, t('env.bridge.continue'));
  bridgeSkip.setAttribute('type', 'button');
  const bridgeButtons = el('div', styles.buttons);
  bridgeButtons.append(bridgeWake, bridgeRetry, bridgeSkip);
  const bridgeRaw = el('details', styles.raw);
  const bridgeRawText = el('pre', styles.error);
  bridgeRaw.append(el('summary', styles.rawSummary, t('env.fix.details')), bridgeRawText);
  bridge.append(bridgeTitle, bridgeWhy, bridgeLines, bridgeCommand.row, wakeNote, bridgeButtons, bridgeRaw);

  const diy = el('div', styles.bridge);
  diy.hidden = true;
  const diyTitle = el('h2', styles.fixTitle, t('env.fix.title'));
  const diyWhy = el('p', styles.hint, t('env.diy.why'));
  const diyLines = el('ul', styles.bridgeLines);
  const diyStep = el('p', styles.hint, t('env.diy.step'));
  const diyCommand = commandRow(t);
  const diyRetry = el('button', styles.button, t('env.retry'));
  diyRetry.setAttribute('type', 'button');
  const diySkip = el('button', styles.button, t('env.diy.continue'));
  diySkip.setAttribute('type', 'button');
  const diyButtons = el('div', styles.buttons);
  diyButtons.append(diyRetry, diySkip);
  const diyRaw = el('details', styles.raw);
  const diyRawText = el('pre', styles.error);
  diyRaw.append(el('summary', styles.rawSummary, t('env.fix.details')), diyRawText);
  diy.append(diyTitle, diyWhy, diyLines, diyStep, diyCommand.row, diyButtons, diyRaw);

  card.append(title, hint, list, progressRow, actions, bridge, diy, rawAll);
  overlay.append(card);
  document.body.append(overlay);

  const previousInert = root?.inert ?? false;
  if (root !== null) root.inert = true;

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waitingSince: number | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;

  function startElapsed(): void {
    if (waitingSince === null) waitingSince = Date.now();
    if (ticker !== undefined) return;
    const paint = (): void => {
      const seconds = Math.max(0, Math.floor((Date.now() - (waitingSince ?? Date.now())) / 1000));
      elapsed.textContent = t('env.elapsed', { seconds });
      progressRow.hidden = seconds < 1;
    };
    paint();
    ticker = setInterval(paint, 500);
  }

  function stopElapsed(): void {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
    waitingSince = null;
    elapsed.textContent = '';
    progressRow.hidden = true;
  }
  let cancelled = false;
  const forcePlan = createForcePlan();
  let pinned: PreflightSnapshot | null = null;

  function close(): void {
    if (closed) return;
    closed = true;
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    if (ticker !== undefined) clearInterval(ticker);
    deadline.disarm();
    overlay.remove();
    if (root !== null) root.inert = previousInert;
  }

  const deadline = createGateDeadline(GIVE_UP_MS, close);

  interface StepRow {
    readonly item: HTMLElement;
    readonly mark: HTMLElement;
    readonly detail: HTMLElement;
    status: string;
  }

  const rows = new Map<PreflightStepId, StepRow>();
  let renderedOrder = '';

  function ensureRow(step: PreflightStep): StepRow {
    const existing = rows.get(step.id);
    if (existing !== undefined) return existing;
    const item = el('li', styles.step);
    const mark = el('span', styles.mark);
    mark.setAttribute('aria-hidden', 'true');
    const row: StepRow = { item, mark, detail: el('span', styles.detail), status: '' };
    item.append(mark, el('span', styles.label, stepLabel(step, t)), row.detail);
    rows.set(step.id, row);
    return row;
  }

  function render(snapshot: PreflightSnapshot): void {
    wakeNote.hidden = true;
    hint.textContent = gateHintOf(snapshot, t);

    const items = snapshot.steps.map((step) => {
      const row = ensureRow(step);
      row.item.dataset.status = step.status;
      if (row.status !== step.status) {
        row.status = step.status;
        row.mark.replaceChildren();
        if (step.status === 'running') {
          row.mark.append(spinnerIcon(14));
        } else {
          row.mark.textContent = stepMark(step);
        }
      }
      row.detail.textContent = stepDetailText(step, snapshot, t);
      return row.item;
    });

    const order = snapshot.steps.map((step) => step.id).join(',');
    if (order !== renderedOrder) {
      renderedOrder = order;
      list.replaceChildren(...items);
    }

    const rawLines = snapshot.steps.flatMap((step) => {
      const detail = step.detail ?? '';
      return detail === '' ? [] : [`${stepLabel(step, t)}: ${detail}`];
    });
    rawAllBody.textContent = rawLines.join('\n');

    const waiting = snapshot.phase !== 'ready' && snapshot.phase !== 'failed';
    if (waiting) startElapsed();
    else stopElapsed();

    const failed = snapshot.phase === 'failed';
    actions.hidden = !failed;
    retry.removeAttribute('disabled');
    bridgeRetry.removeAttribute('disabled');
    errorBox.textContent = snapshot.error ?? '';
    errorBox.hidden = snapshot.error === undefined;

    const fix = snapshot.steps.find((step) => step.status === 'failed' && step.command !== undefined);
    const commandText = fix?.command;

    const guidance = snapshot.guidance ?? 'install';
    const why = guidance === 'path' ? t('env.fix.whyPath') : guidance === 'shell' ? t('env.fix.whyShell') : t('env.fix.why');
    const step = guidance === 'path' ? t('env.fix.stepPath') : guidance === 'shell' ? t('env.fix.stepShell') : t('env.fix.step');
    fixWhy.textContent = why;
    fixStep.textContent = step;

    const showCommand = guidance === 'install' && commandText !== undefined;
    fixCommand.set(showCommand ? commandText : undefined);

    fixAdvice.textContent = !showCommand
      ? ''
      : snapshot.failure === 'permission'
        ? t('env.fix.permission')
        : snapshot.failure === 'network'
          ? t('env.fix.network')
          : '';
    const bridgeStep = snapshot.steps.find((step) => step.id === 'bridge');
    const bridgeIssues = snapshot.bridgeIssues ?? [];
    const bridgeBroken =
      bridgeIssues.length > 0 ||
      (bridgeStep !== undefined && (bridgeStep.status === 'warn' || bridgeStep.status === 'failed'));
    bridge.hidden = !bridgeBroken;
    if (bridgeBroken) {
      const listed: readonly PreflightBridgeIssue[] =
        bridgeIssues.length === 0 ? ['unknown'] : bridgeIssues;
      bridgeLines.replaceChildren(
        ...listed.map((issue) => {
          const advice = bridgeAdvice(issue, t, runtimeProfileValue()?.bridge);
          const item = el('li', styles.bridgeLine, advice.text);
          if (advice.link !== undefined) {
            const link = document.createElement('a');
            link.className = styles.link;
            link.textContent = advice.link.label;
            link.href = advice.link.href;
            link.target = '_blank';
            link.rel = 'noreferrer noopener';
            item.append(link);
          }
          return item;
        }),
      );
      bridgeCommand.set(bridgeStep?.command);
      bridgeRawText.textContent = bridgeStep?.detail ?? '';
      bridgeRaw.hidden = (bridgeStep?.detail ?? '') === '';
      const canWake =
        snapshot.canWakeBrowser === true && bridgeIssues.includes('extension');
      bridgeWake.hidden = !canWake;
      if (!canWake) wakeNote.hidden = true;
    }

    const gap = snapshot.diyGap;
    diy.hidden = gap === undefined;
    if (gap !== undefined) {
      const lines =
        gap.rows.length === 0 ? [t('env.diy.noRow')] : [t('env.diy.rows', { rows: gap.rows.join('、') })];
      diyLines.replaceChildren(...lines.map((text) => el('li', styles.bridgeLine, text)));
      diyCommand.set(gap.command);
      diyRawText.textContent = gap.detail;
      diyRaw.hidden = gap.detail === '';
    }

    const panelShown = !actions.hidden || !bridge.hidden || !diy.hidden;
    rawAll.hidden = !showsRawAll(snapshot, panelShown) || rawLines.length === 0;
  }

  async function poll(): Promise<void> {
    if (cancelled) return;
    if (pinned !== null) return;
    const response = await request<PreflightSnapshot>('preflight', forcePlan.next()).catch(
      () => null,
    );
    if (cancelled) return;

    if (response === null || !response.ok) {
      close();
      return;
    }

    render(response);
    const action = gateActionOf(response);
    if (action === 'close') {
      close();
      return;
    }
    if (action === 'hold') return;
    timer = setTimeout(() => void poll(), POLL_MS);
  }

  function retryNow(): void {
    forcePlan.again();
    actions.hidden = true;
    bridge.hidden = true;
    wakeNote.hidden = true;
    diy.hidden = true;
    retry.setAttribute('disabled', '');
    bridgeRetry.setAttribute('disabled', '');
    diyRetry.setAttribute('disabled', '');
    hint.textContent = t('env.checking');
    if (pinned !== null) {
      render(pinned);
      return;
    }
    void poll();
  }

  async function wakeBrowserNow(): Promise<void> {
    bridgeWake.setAttribute('disabled', '');
    bridgeWake.textContent = t('env.wake.opening');
    wakeNote.hidden = true;
    const reply = await request<WakeBrowserReply>(WAKE_BROWSER_ROUTE).catch(() => null);
    bridgeWake.removeAttribute('disabled');
    bridgeWake.textContent = t('env.wake');
    if (reply === null || !reply.ok) {
      wakeNote.textContent = t('env.wake.failed');
      wakeNote.hidden = false;
      return;
    }
    if (reply.status === 'connected') {
      wakeNote.textContent = t('env.checking');
      wakeNote.hidden = false;
      forcePlan.again();
      void poll();
      return;
    }
    wakeNote.textContent =
      reply.status === 'browser-open'
        ? t('env.wake.browserOpen')
        : reply.status === 'no-browser'
          ? t('env.wake.noBrowser')
          : t('env.wake.failed');
    wakeNote.hidden = false;
  }

  retry.addEventListener('click', retryNow);
  bridgeWake.addEventListener('click', () => void wakeBrowserNow());
  bridgeRetry.addEventListener('click', retryNow);
  bridgeSkip.addEventListener('click', close);
  diyRetry.addEventListener('click', retryNow);
  diySkip.addEventListener('click', close);

  const search = typeof window === 'undefined' ? '' : (window.location?.search ?? '');
  if (devSurface.on(search)) {
    const strip = devSurface.gateStrip({
      onPick: (snapshot) => {
        pinned = snapshot;
        if (snapshot !== null) {
          render(snapshot);
          return;
        }
        void poll();
      },
    });
    if (strip !== null) overlay.append(strip);
  }

  void poll();

  return { close };
}
