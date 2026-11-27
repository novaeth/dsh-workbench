import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import type { RuntimeProfile, Translate } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { runtimeText } from '@/shared/hooks/locale-text';
import { hostLabel } from '@/app/layouts/host-requirement';
import { diyCardOf, type FallbackCard, type GateFacts } from './fault-card';
import { guidanceTextOf, hostVersionWhyText } from './gate-text';
import { commandRow } from './command-row';
import { el } from './gate-dom';
import styles from './BootGate.module.css';

const EXTENSIONS_URL = 'chrome://extensions';
const METHOD_MARKERS = ['①', '②', '③', '④', '⑤'];
const ISSUE_ORDER = ['daemon', 'extension-incompatible', 'extension', 'profile', 'stale'] as const;

export type FixAction = 'retry' | 'skip' | 'wake' | 'agent';

export interface FixLink {
  readonly label: string;
  readonly href: string;
}

export interface FixStep {
  readonly text?: string;
  readonly command?: string;
  readonly link?: FixLink;
  readonly open?: 'extensions';
}

export interface FixMethod {
  readonly title?: string;
  readonly link?: FixLink;
  readonly steps: readonly FixStep[];
}

export interface FixCardData {
  readonly actions: readonly FixAction[];
  readonly title: string;
  readonly reason?: string;
  readonly facts?: readonly string[];
  readonly methods?: readonly FixMethod[];
  readonly methodHint?: string;
  readonly note?: string;
  readonly prompt?: string;
}

export interface FixCardWiring {
  readonly retry: () => void;
  readonly skip: () => void;
  readonly wake: () => void;
  readonly openExtensions: () => void;
  readonly canOpenExtensions: () => boolean;
}

export interface FixCardView {
  readonly root: HTMLElement;
  set(data: FixCardData): void;
  status(text: string | undefined): void;
  openStatus(text: string | undefined): void;
  setBusy(busy: boolean): void;
}

function issueOf(issues: readonly string[]): string | undefined {
  return ISSUE_ORDER.find((one) => issues.includes(one)) ?? issues[0];
}

function runCommandSteps(command: string | undefined, t: Translate): readonly FixStep[] {
  return command === undefined ? [] : [{ text: t('env.fix.runCommand'), command }];
}

export function failureFixOf(snapshot: PreflightSnapshot, t: Translate): FixCardData | undefined {
  if (snapshot.phase !== 'failed') return undefined;
  const guidance = snapshot.guidance ?? 'install';
  const failed = snapshot.steps.find((step) => step.status === 'failed' && step.command !== undefined);
  const command = guidance === 'install' ? failed?.command : undefined;
  const advice = guidanceTextOf(guidance, t, command !== undefined);
  const steps: FixStep[] = [];
  if (command === undefined) steps.push({ text: advice.step });
  else {
    steps.push({ text: t('env.fix.runCommand'), command });
    if (snapshot.failure === 'permission') steps.push({ text: t('env.fix.permission') });
    if (snapshot.failure === 'network') steps.push({ text: t('env.fix.network') });
  }
  return {
    actions: ['retry', 'skip'],
    title: t('env.fix.title'),
    reason: advice.why,
    methods: [{ steps }],
    ...(command === undefined ? {} : { note: t('env.fix.note') }),
  };
}

function extensionFixOf(
  snapshot: PreflightSnapshot,
  t: Translate,
  fixes: RuntimeProfile['bridge'] | undefined,
): FixCardData {
  const dir = snapshot.extensionDir;
  const store = fixes?.extension?.link;
  const methods: FixMethod[] = [];
  if (dir !== undefined) {
    methods.push({
      title: t('env.bridge.extension.local'),
      steps: [
        { text: t('env.fix.open'), open: 'extensions' },
        { text: t('env.bridge.extension.devMode') },
        { text: t('env.bridge.extension.loadUnpacked') },
        { text: t('env.bridge.extension.chooseDir'), command: dir },
      ],
    });
  }
  if (store !== undefined) {
    methods.push({
      link: { label: runtimeText(store.label), href: store.href },
      steps: [],
    });
  }
  if (methods.length === 0) {
    methods.push({
      steps: [
        { text: t('env.fix.open'), open: 'extensions' },
        { text: t('env.bridge.extension.enable') },
      ],
    });
  }
  return {
    actions: snapshot.canWakeBrowser === true ? ['wake', 'retry', 'skip'] : ['retry', 'skip'],
    title: t('env.fix.title'),
    reason: t('env.bridge.reason.extension'),
    methods,
    methodHint: t('env.fix.pickExtension'),
    note: t('env.fix.note'),
  };
}

function incompatibleFixOf(snapshot: PreflightSnapshot, t: Translate): FixCardData {
  const target = snapshot.extensionTarget;
  return {
    actions: ['retry', 'skip'],
    title: t('env.fix.title'),
    reason: t('env.bridge.incompatible.why'),
    methods: [
      {
        steps: [
          { text: t('env.fix.open'), open: 'extensions' },
          { text: t('env.bridge.incompatible.reload') },
          target === undefined
            ? { text: t('env.bridge.incompatible.confirmAny') }
            : { text: t('env.bridge.incompatible.confirm', { version: target }) },
        ],
      },
    ],
    note: t('env.fix.note'),
  };
}

export function bridgeFixOf(
  snapshot: PreflightSnapshot,
  t: Translate,
  fixes: RuntimeProfile['bridge'] | undefined,
): FixCardData | undefined {
  const issue = issueOf(snapshot.bridgeIssues ?? []);
  if (issue === undefined || issue === 'unknown') return undefined;
  if (issue === 'extension') return extensionFixOf(snapshot, t, fixes);
  if (issue === 'extension-incompatible') return incompatibleFixOf(snapshot, t);
  const step = snapshot.steps.find((one) => one.id === 'bridge');
  const steps = runCommandSteps(step?.command, t);
  const fix = fixes?.[issue];
  return {
    actions: ['retry', 'skip'],
    title: t('env.fix.title'),
    reason: fix === undefined ? t('env.bridge.unknown') : runtimeText(fix.text),
    ...(steps.length === 0 ? {} : { methods: [{ steps }] }),
    ...(steps.length === 0 ? {} : { note: t('env.fix.note') }),
  };
}

export function diyFixOf(
  snapshot: PreflightSnapshot,
  gate: GateFacts,
  t: Translate,
): FixCardData | undefined {
  const card = diyCardOf(snapshot, gate, t);
  if (card === undefined) return undefined;
  if (card.mode === 'fallback') return fallbackFixOf(card);
  return {
    actions: ['retry', 'skip'],
    title: t('env.fix.title'),
    reason: card.why,
    methods: [{ steps: [{ text: card.step, ...(card.command === undefined ? {} : { command: card.command }) }] }],
    note: t('env.fix.note'),
  };
}

export function hostFixOf(snapshot: PreflightSnapshot, t: Translate): FixCardData | undefined {
  const gap = snapshot.hostGap;
  if (gap === undefined) return undefined;
  const steps: FixStep[] = [];
  if (gap.tier === 'older') {
    steps.push({
      text: t('env.hostVersion.older.step'),
      ...(gap.command === undefined ? {} : { command: gap.command }),
    });
  }
  steps.push({ text: t('env.hostVersion.recover', { host: hostLabel() }) });
  steps.push({ text: t('env.hostVersion.recover.detail') });
  return {
    actions: ['skip'],
    title: t('env.fix.title'),
    reason: hostVersionWhyText(gap, t),
    methods: [{ steps }],
  };
}

export function fallbackFixOf(card: FallbackCard): FixCardData {
  return {
    actions: ['agent', 'retry', 'skip'],
    title: card.title,
    facts: card.facts,
    ...(card.hint === undefined ? {} : { methods: [{ steps: [{ text: card.hint }] }] }),
    prompt: card.prompt,
  };
}

export function createFixCard(t: Translate, wiring: FixCardWiring): FixCardView {
  const root = el('div', styles.fixCard);
  root.hidden = true;
  const body = el('div', styles.fixBody);
  const status = el('p', styles.cardStatus);
  status.hidden = true;
  const actions = el('div', styles.buttons);
  root.append(body, actions, status);

  let prompt = '';
  let busy = false;
  let openStatusNode: HTMLElement | undefined;

  function buttonOf(action: FixAction): HTMLButtonElement {
    const node = document.createElement('button');
    node.setAttribute('type', 'button');
    node.className = styles.button;
    node.dataset.action = action;
    const plain: Record<Exclude<FixAction, 'agent'>, { label: string; run: () => void }> = {
      retry: { label: t('env.retry'), run: () => wiring.retry() },
      skip: { label: t('env.failed.continue'), run: () => wiring.skip() },
      wake: { label: t('env.wake'), run: () => wiring.wake() },
    };
    if (action !== 'agent') {
      node.textContent = plain[action].label;
      if (action === 'retry') node.disabled = busy;
      node.addEventListener('click', plain[action].run);
      return node;
    }
    node.textContent = t('askAgent.copy');
    node.addEventListener('click', () => {
      if (prompt === '') return;
      void writeClipboard(prompt).then((ok) => {
        if (!ok) return;
        node.textContent = t('askAgent.copied');
        setTimeout(() => {
          node.textContent = t('askAgent.copy');
        }, 1500);
      });
    });
    return node;
  }

  function openChipOf(): HTMLElement {
    if (!wiring.canOpenExtensions()) return el('code', styles.inlineCode, EXTENSIONS_URL);
    const chip = document.createElement('button');
    chip.setAttribute('type', 'button');
    chip.setAttribute('aria-label', t('env.fix.openExtensions'));
    chip.title = t('env.fix.openExtensions');
    chip.className = `${styles.inlineCode} ${styles.inlineAction}`;
    chip.textContent = EXTENSIONS_URL;
    chip.addEventListener('click', () => wiring.openExtensions());
    return chip;
  }

  function linkOf(link: FixLink): HTMLAnchorElement {
    const anchor = document.createElement('a');
    anchor.className = styles.link;
    anchor.textContent = link.label;
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    return anchor;
  }

  function stepOf(step: FixStep, index: number, numbered: boolean): HTMLElement {
    const main = el('div', styles.stepMain);
    if (step.text !== undefined || step.open !== undefined) {
      const line = el('p', styles.stepText);
      if (step.text !== undefined) line.append(step.text);
      if (step.open !== undefined) line.append(openChipOf());
      main.append(line);
    }
    if (step.command !== undefined) {
      const row = commandRow(t);
      row.set(step.command);
      main.append(row.row);
    }
    if (step.link !== undefined) main.append(linkOf(step.link));
    if (step.open !== undefined) {
      const line = el('p', styles.stepStatus);
      line.hidden = true;
      main.append(line);
      openStatusNode = line;
    }
    const row = el('li', numbered ? styles.stepRow : `${styles.stepRow} ${styles.stepRowSingle}`);
    if (numbered) row.append(el('span', styles.stepIndex, String(index + 1)));
    row.append(main);
    return row;
  }

  function methodOf(method: FixMethod, index: number, marked: boolean): HTMLElement {
    const node = el('div', marked ? `${styles.method} ${styles.methodMarked}` : styles.method);
    const marker = METHOD_MARKERS[index] ?? `${index + 1}.`;
    if (method.link !== undefined) {
      const head = el('div', styles.methodHead);
      if (marked) head.append(el('span', styles.methodTitle, marker));
      const anchor = document.createElement('a');
      anchor.className = `${styles.methodTitle} ${styles.link}`;
      anchor.href = method.link.href;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer noopener';
      anchor.textContent = method.link.label;
      head.append(anchor);
      node.append(head);
      return node;
    }
    if (method.title !== undefined) {
      node.append(el('h4', styles.methodTitle, marked ? `${marker} ${method.title}` : method.title));
    }
    const list = el('ol', styles.fixSteps);
    const numberedSteps = method.steps.length > 1;
    method.steps.forEach((step, stepIndex) => {
      list.append(stepOf(step, stepIndex, numberedSteps));
    });
    node.append(list);
    return node;
  }

  function blockOf(label: string, content: HTMLElement): HTMLElement {
    const section = el('section', styles.fixBlock);
    section.append(el('h3', styles.blockLabel, label), content);
    return section;
  }

  function set(data: FixCardData): void {
    prompt = data.prompt ?? '';
    openStatusNode = undefined;
    const nodes: HTMLElement[] = [el('h2', styles.fixTitle, data.title)];
    if (data.reason !== undefined) nodes.push(blockOf(t('env.fix.reason'), el('p', styles.reason, data.reason)));
    if (data.facts !== undefined && data.facts.length > 0) {
      const facts = el('ul', styles.facts);
      for (const fact of data.facts) facts.append(el('li', styles.fact, fact));
      nodes.push(blockOf(t('env.fix.situation'), facts));
    }
    if (data.methods !== undefined && data.methods.length > 0) {
      const methods = el('div', styles.methods);
      if (data.methodHint !== undefined) methods.append(el('p', styles.methodHint, data.methodHint));
      const numbered = data.methods.length > 1;
      data.methods.forEach((method, index) => {
        methods.append(methodOf(method, index, numbered));
      });
      nodes.push(blockOf(t('env.fix.methods'), methods));
    }
    if (data.note !== undefined) nodes.push(el('p', styles.note, data.note));
    body.replaceChildren(...nodes);
    actions.replaceChildren(...data.actions.map(buttonOf));
    status.hidden = true;
    root.hidden = false;
  }

  return {
    root,
    set,
    status(text) {
      status.textContent = text ?? '';
      status.hidden = text === undefined;
    },
    openStatus(text) {
      if (openStatusNode === undefined) return;
      openStatusNode.textContent = text ?? '';
      openStatusNode.hidden = text === undefined;
    },
    setBusy(next) {
      busy = next;
      for (const node of actions.querySelectorAll<HTMLButtonElement>('button[data-action="retry"]')) {
        node.disabled = next;
      }
    },
  };
}
