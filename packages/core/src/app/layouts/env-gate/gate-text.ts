import type { Translate } from '@dsh-workbench/shared';
import type { PreflightBridgeIssue, PreflightGuidance, PreflightSnapshot, PreflightStep } from '@dsh-workbench/shared/host';
import type { RuntimeProfile } from '@dsh-workbench/shared';
import { runtimeText } from '@/shared/hooks/locale-text';

export function failedStepText(guidance: PreflightGuidance | undefined, t: Translate): string {
  if (guidance === 'path') return t('env.stepFailed.path');
  if (guidance === 'shell') return t('env.stepFailed.shell');
  if (guidance === 'host') return t('env.stepFailed.host');
  return t('env.stepFailed.install');
}

export interface GuidanceText {
  readonly why: string;
  readonly step: string;
}

export function guidanceTextOf(guidance: PreflightGuidance | undefined, t: Translate): GuidanceText {
  if (guidance === 'path') return { why: t('env.fix.whyPath'), step: t('env.fix.stepPath') };
  if (guidance === 'shell') return { why: t('env.fix.whyShell'), step: t('env.fix.stepShell') };
  if (guidance === 'host') return { why: t('env.fix.whyHost'), step: t('env.fix.stepHost') };
  return { why: t('env.fix.why'), step: t('env.fix.step') };
}

export function stepDetailText(step: PreflightStep, snapshot: PreflightSnapshot, t: Translate): string {
  if (step.status === 'failed') return failedStepText(snapshot.guidance, t);
  if (step.status === 'pending') return '';
  if (step.status === 'running') return step.action ?? '';
  if (step.id === 'toolchain') return step.status === 'ok' ? t('env.toolchain.ok') : t('env.toolchain.warn');
  if (step.id === 'cli') return step.status === 'ok' ? t('env.runtime.ok') : '';
  if (step.id === 'bridge') return step.status === 'ok' ? t('env.bridge.ok') : t('env.bridge.short');
  if (step.id === 'diy') return step.status === 'ok' ? t('env.diy.ok') : t('env.diy.short');
  if (step.id === 'warm') {
    return step.status === 'ok' ? t('env.warm.done', { n: step.detail ?? '0' }) : t('env.warm.short');
  }
  return '';
}

export function gateHintOf(snapshot: PreflightSnapshot, t: Translate): string {
  if (snapshot.phase === 'failed') return t('env.failed');
  if (snapshot.phase === 'installing') {
    const toolchain = snapshot.steps.some((step) => step.id === 'toolchain' && step.status === 'running');
    return toolchain ? t('env.installingToolchain') : t('env.installing');
  }
  if (snapshot.phase === 'ready') {
    if ((snapshot.bridgeIssues?.length ?? 0) > 0) return t('env.bridge.hold');
    if (snapshot.diyGap !== undefined) return t('env.diy.hold');
  }
  return t('env.checking');
}

export function showsRawDetails(snapshot: PreflightSnapshot): boolean {
  if (snapshot.phase === 'failed') return true;
  return snapshot.steps.some((step) => step.status === 'warn' || step.status === 'failed');
}

export function showsRawAll(snapshot: PreflightSnapshot, panelShown: boolean): boolean {
  return !panelShown && showsRawDetails(snapshot);
}

export interface BridgeAdvice {
  readonly text: string;
  readonly link?: { readonly label: string; readonly href: string };
}

export function bridgeAdvice(
  issue: PreflightBridgeIssue,
  t: Translate,
  fixes?: RuntimeProfile['bridge'],
): BridgeAdvice {
  const fix = fixes?.[issue];
  if (fix !== undefined) {
    return {
      text: runtimeText(fix.text),
      ...(fix.link === undefined
        ? {}
        : { link: { label: runtimeText(fix.link.label), href: fix.link.href } }),
    };
  }
  return { text: t('env.bridge.unknown') };
}
