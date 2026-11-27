import type { Translate } from '@dsh-workbench/shared';
import type { PreflightSnapshot, PreflightStep, PreflightStepId } from '@dsh-workbench/shared/host';
import styles from './BootGate.module.css';
import { WAKE_BROWSER_ROUTE, type WakeBrowserReply } from '@/kernel/contract/preflight-wake';
import { apiGet } from '@dsh-workbench/shared';
import { LOCALE_NS } from '@dsh-workbench/shared';
import { hostSurfaceValue, runtimeProfileValue } from '@/shared/hooks/use-runtime-capabilities';
import { stepDetailText } from './gate-text';
import type { RuntimeProfile } from '@dsh-workbench/shared';
import { readRuntimeCapabilities } from '@/shared/hooks/runtime-queries';
import { brandMarkIcon, el, spinnerIcon } from './gate-dom';
import { createForcePlan, retryTargetOf } from './force-plan';
import { logAtBottom } from './log-follow';
import { hostLabel } from '@/app/layouts/host-requirement';
import { bridgeFallbackOf, type GateDeployment } from './fault-card';
import { bridgeFixOf, createFixCard, diyFixOf, failureFixOf, fallbackFixOf, hostFixOf, type FixCardView } from './fix-card';

const POLL_MS = 400;

function nullOnFailure<T>(promise: Promise<T>): Promise<T | null> {
  return promise.catch(() => null);
}

function stepLabel(step: PreflightStep, t: Translate): string {
  const id: PreflightStepId = step.id;
  if (id === 'toolchain') return t('env.step.toolchain');
  if (id === 'runtime') return step.label ?? t('env.step.adapter');
  if (id === 'cli') return t('env.step.runtime');
  if (id === 'warm') return t('env.step.warm');
  if (id === 'diy') return t('env.step.diy');
  if (id === 'host') return t('env.step.hostVersion', { host: hostLabel() });
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
  if (snapshot.hostGap !== undefined) return 'hold';
  return snapshot.diyGap === undefined ? 'close' : 'hold';
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

  let openExtensionsAllowed = false;

  const wiring = {
    retry: () => retryNow(),
    skip: () => close(),
    wake: () => void wakeBrowserNow(),
    openExtensions: () => void openExtensionsNow(),
    canOpenExtensions: () => openExtensionsAllowed,
  };
  const failureCard = createFixCard(t, wiring);
  const bridgeCard = createFixCard(t, wiring);
  const diyCard = createFixCard(t, wiring);
  const hostCard = createFixCard(t, wiring);
  const cards: readonly FixCardView[] = [failureCard, bridgeCard, diyCard, hostCard];

  card.append(brandHead, bootHint, list, failureCard.root, bridgeCard.root, diyCard.root, hostCard.root);
  overlay.append(card);
  document.body.append(overlay);

  const previousInert = root?.inert ?? false;
  if (root !== null) root.inert = true;

  let bootHintShown = true;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const forcePlan = createForcePlan();
  let lastSnapshot: PreflightSnapshot | null = null;
  let runtimeProfile: RuntimeProfile | undefined;
  let retried = 0;
  const deploymentOf = (): GateDeployment =>
    hostSurfaceValue()?.deployment === 'desktop' ? 'desktop' : 'web';

  function close(): void {
    if (closed) return;
    closed = true;
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    overlay.remove();
    if (root !== null) root.inert = previousInert;
  }

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
    bridgeCard.status(undefined);
    bridgeCard.openStatus(undefined);
    if (bootHintShown && (snapshot.phase !== 'idle' || snapshot.steps.length > 0)) {
      bootHintShown = false;
      bootHint.hidden = true;
    }

    const items = snapshot.steps.map((step) => {
      const row = ensureRow(step);
      const wasStatus = row.status;
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
      if (step.status === 'failed' && wasStatus !== 'failed' && row.expandable) {
        row.expanded = true;
        row.follow = false;
        row.log.hidden = false;
        row.head.setAttribute('aria-expanded', 'true');
        row.item.dataset.expanded = 'true';
        row.log.scrollTop = 0;
      }
      if (row.expanded && row.follow) row.log.scrollTop = row.log.scrollHeight;
      return row.item;
    });

    const order = snapshot.steps.map((step) => step.id).join(',');
    if (order !== renderedOrder) {
      renderedOrder = order;
      list.replaceChildren(...items);
    }

    const gateFacts = { deployment: deploymentOf(), retried, host: hostLabel() };
    openExtensionsAllowed = snapshot.canWakeBrowser === true;

    const failure = failureFixOf(snapshot, t);
    if (failure === undefined) failureCard.root.hidden = true;
    else failureCard.set(failure);

    const bridgeFallback = bridgeFallbackOf(snapshot, gateFacts, t);
    if (bridgeFallback !== undefined) {
      bridgeCard.set(fallbackFixOf(bridgeFallback));
    } else {
      const bridge = bridgeFixOf(snapshot, t, runtimeProfile?.bridge ?? runtimeProfileValue()?.bridge);
      if (bridge === undefined) bridgeCard.root.hidden = true;
      else bridgeCard.set(bridge);
    }

    const diy = diyFixOf(snapshot, gateFacts, t);
    if (diy === undefined) diyCard.root.hidden = true;
    else diyCard.set(diy);

    const host = hostFixOf(snapshot, t);
    if (host === undefined) hostCard.root.hidden = true;
    else hostCard.set(host);

    for (const one of cards) one.setBusy(false);
  }

  async function poll(): Promise<void> {
    if (cancelled) return;
    const response = await nullOnFailure(request<PreflightSnapshot>('preflight', forcePlan.next()));
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
    retried += 1;
    forcePlan.again(retryTargetOf(lastSnapshot));
    for (const one of cards) {
      one.root.hidden = true;
      one.setBusy(true);
    }
    void poll();
  }

  async function wakeBrowserNow(): Promise<void> {
    bridgeCard.status(t('env.wake.opening'));
    const reply = await nullOnFailure(request<WakeBrowserReply>(WAKE_BROWSER_ROUTE));
    if (reply === null || !reply.ok) {
      bridgeCard.status(t('env.wake.failed'));
      return;
    }
    if (reply.status === 'connected') {
      bridgeCard.status(t('env.checking'));
      forcePlan.again();
      void poll();
      return;
    }
    bridgeCard.status(
      reply.status === 'browser-open'
        ? t('env.wake.browserOpen')
        : reply.status === 'no-browser'
          ? t('env.wake.noBrowser')
          : t('env.wake.failed'),
    );
  }

  async function openExtensionsNow(): Promise<void> {
    bridgeCard.openStatus(undefined);
    const reply = await nullOnFailure(
      request<WakeBrowserReply>(WAKE_BROWSER_ROUTE, { target: 'extensions' }),
    );
    if (reply === null || !reply.ok || reply.status !== 'browser-open') {
      bridgeCard.openStatus(t('env.bridge.openFailed'));
      return;
    }
    bridgeCard.openStatus(t('env.bridge.opened'));
  }

  void readRuntimeCapabilities()
    .then((answer) => {
      runtimeProfile = answer.ok ? (answer.runtimeProfile ?? undefined) : undefined;
      if (lastSnapshot !== null) render(lastSnapshot);
    })
    .catch(() => undefined);

  void poll();

  return { close };
}
