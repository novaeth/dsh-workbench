import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './BootGate.module.css';
import type { Translate } from '@dsh-workbench/shared';
import type { PreflightSnapshot, PreflightStep, PreflightStepId } from '@dsh-workbench/shared/host';
import { WAKE_BROWSER_ROUTE, type WakeBrowserReply } from '@/kernel/contract/preflight-wake';
import { apiGet } from '@dsh-workbench/shared';
import { LOCALE_NS } from '@dsh-workbench/shared';
import { devSurface } from '@/shared/dev-surface';
import { runtimeProfileValue } from '@/shared/hooks/use-runtime-capabilities';
import { bridgeAdviceLines, guidanceTextOf, stepDetailText } from './gate-text';
import type { RuntimeProfile } from '@dsh-workbench/shared';
import { readRuntimeCapabilities } from '@/shared/hooks/runtime-queries';
import { createGateDeadline } from './gate-deadline';
import { brandMarkIcon, el, spinnerIcon, svgIcon } from './gate-dom';
import { createForcePlan, retryTargetOf } from './force-plan';
import { logAtBottom } from './log-follow';

const POLL_MS = 400;

const GIVE_UP_MS = 300_000;

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
  const brandHead = el('div', styles.brandHead);
  brandHead.append(brandMarkIcon(), title);
  const bootHint = el('p', styles.hint, t('env.checking'));
  const list = el('ul', styles.steps);
  const actions = el('div', styles.actions);
  actions.hidden = true;
  const fixTitle = el('h2', styles.fixTitle, t('env.fix.title'));
  const fixWhy = el('p', styles.hint);
  const fixStep = el('p', styles.hint);
  const fixAdvice = el('p', styles.hint);
  const buttons = el('div', styles.buttons);
  const retry = el('button', styles.button, t('env.retry'));
  retry.setAttribute('type', 'button');
  const failedSkip = el('button', styles.button, t('env.failed.continue'));
  failedSkip.setAttribute('type', 'button');
  const fixCommand = commandRow(t);

  buttons.append(retry, failedSkip);
  actions.append(fixTitle, fixWhy, fixStep, fixCommand.row, fixAdvice, buttons);

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
bridge.append(bridgeTitle, bridgeWhy, bridgeLines, bridgeCommand.row, wakeNote, bridgeButtons);

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
diy.append(diyTitle, diyWhy, diyLines, diyStep, diyCommand.row, diyButtons);

  card.append(brandHead, bootHint, list, actions, bridge, diy);
  overlay.append(card);
  document.body.append(overlay);

  const previousInert = root?.inert ?? false;
  if (root !== null) root.inert = true;

  let bootHintShown = true;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const forcePlan = createForcePlan();
  let pinned: PreflightSnapshot | null = null;
  let lastSnapshot: PreflightSnapshot | null = null;
  let runtimeProfile: RuntimeProfile | undefined;

  function close(): void {
    if (closed) return;
    closed = true;
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    deadline.disarm();
    overlay.remove();
    if (root !== null) root.inert = previousInert;
  }

  let deadline = createGateDeadline(GIVE_UP_MS, close);

  function extend(): void {
    if (closed || held) return;
    deadline.disarm();
    deadline = createGateDeadline(GIVE_UP_MS, close);
  }

  let held = false;

  function holdOpen(): void {
    if (held) return;
    held = true;
    deadline.disarm();
  }

  overlay.addEventListener('pointerdown', extend, { passive: true });
  overlay.addEventListener('keydown', extend, { passive: true });
  overlay.addEventListener('wheel', extend, { passive: true });

  interface StepRow {
    readonly item: HTMLElement;
    readonly head: HTMLElement;
    readonly mark: HTMLElement;
    readonly detail: HTMLElement;
    readonly arrow: HTMLElement;
    readonly log: HTMLElement;
    status: string;
    expandable: boolean;
    expanded: boolean;
    follow: boolean;
  }

  const rows = new Map<PreflightStepId, StepRow>();
  let renderedOrder = '';

  function ensureRow(step: PreflightStep): StepRow {
    const existing = rows.get(step.id);
    if (existing !== undefined) return existing;
    const item = el('li', styles.step);
    const head = el('div', styles.head);
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', 'false');
    const mark = el('span', styles.mark);
    mark.setAttribute('aria-hidden', 'true');
    const row: StepRow = {
      item,
      head,
      mark,
      detail: el('span', styles.detail),
      arrow: el('span', styles.arrow, '›'),
      log: el('pre', styles.stepLog),
      status: '',
      expandable: false,
      expanded: false,
      follow: true,
    };
    row.arrow.setAttribute('aria-hidden', 'true');
    row.arrow.hidden = true;
    row.log.hidden = true;
    head.append(mark, el('span', styles.label, stepLabel(step, t)), row.detail, row.arrow);
    item.append(head, row.log);
    const toggle = (): void => {
      if (!row.expandable) return;
      row.expanded = !row.expanded;
      row.log.hidden = !row.expanded;
      head.setAttribute('aria-expanded', row.expanded ? 'true' : 'false');
      item.dataset.expanded = row.expanded ? 'true' : 'false';
      if (!row.expanded) return;
      row.follow = true;
      row.log.scrollTop = row.log.scrollHeight;
    };
    row.log.addEventListener('scroll', () => {
      row.follow = logAtBottom(row.log);
    });
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
    rows.set(step.id, row);
    return row;
  }

  function render(snapshot: PreflightSnapshot): void {
    lastSnapshot = snapshot;
    wakeNote.hidden = true;
    if (bootHintShown && (snapshot.phase !== 'idle' || snapshot.steps.length > 0)) {
      bootHintShown = false;
      bootHint.hidden = true;
    }

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
      const logText = step.log?.length
        ? step.log.join('\n')
        : (step.detail?.trim() ?? '');
      row.expandable = logText !== '';
      row.item.dataset.expandable = row.expandable ? 'true' : 'false';
      row.arrow.hidden = !row.expandable;
      if (row.log.textContent !== logText) row.log.textContent = logText;
      if (!row.expandable && row.expanded) {
        row.expanded = false;
        row.log.hidden = true;
        row.head.setAttribute('aria-expanded', 'false');
        row.item.dataset.expanded = 'false';
      }
      if (row.expanded && row.follow) row.log.scrollTop = row.log.scrollHeight;
      return row.item;
    });

    const order = snapshot.steps.map((step) => step.id).join(',');
    if (order !== renderedOrder) {
      renderedOrder = order;
      list.replaceChildren(...items);
    }

    const failed = snapshot.phase === 'failed';
    actions.hidden = !failed;
    retry.removeAttribute('disabled');
    bridgeRetry.removeAttribute('disabled');
    const fix = snapshot.steps.find((step) => step.status === 'failed' && step.command !== undefined);
    const commandText = fix?.command;

    const guidance = snapshot.guidance ?? 'install';
    const showCommand = guidance === 'install' && commandText !== undefined;
    const advice = guidanceTextOf(guidance, t, showCommand);
    fixWhy.textContent = advice.why;
    fixStep.textContent = advice.step;

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
      bridgeLines.replaceChildren(
        ...bridgeAdviceLines(
          bridgeIssues,
          t,
          runtimeProfile?.bridge ?? runtimeProfileValue()?.bridge,
          snapshot.extensionDir,
        ).map(
          (advice) => {
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
          },
        ),
      );
      bridgeCommand.set(bridgeStep?.command);
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
    }

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
    if (action === 'hold') {
      holdOpen();
      return;
    }
    timer = setTimeout(() => void poll(), POLL_MS);
  }

  function retryNow(): void {
    forcePlan.again(retryTargetOf(pinned ?? lastSnapshot));
    actions.hidden = true;
    bridge.hidden = true;
    wakeNote.hidden = true;
    diy.hidden = true;
    retry.setAttribute('disabled', '');
    bridgeRetry.setAttribute('disabled', '');
    diyRetry.setAttribute('disabled', '');
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
  failedSkip.addEventListener('click', close);
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

  void readRuntimeCapabilities()
    .then((answer) => {
      runtimeProfile = answer.ok ? (answer.runtimeProfile ?? undefined) : undefined;
      if (pinned !== null) render(pinned);
      else if (lastSnapshot !== null) render(lastSnapshot);
    })
    .catch(() => undefined);

  void poll();

  return { close };
}
