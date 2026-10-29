import type { Translate } from '@dsh-workbench/shared';
import type { PreflightBridgeIssue, PreflightGuidance, PreflightSnapshot, PreflightStep } from '@dsh-workbench/shared/host';
import type { RuntimeProfile } from '@dsh-workbench/shared';
import { runtimeText } from '@/shared/hooks/locale-text';

export function failedStepText(guidance: PreflightGuidance | undefined, t: Translate): string {
  if (guidance === 'path') return t('env.stepFailed.path');
  if (guidance === 'shell') return t('env.stepFailed.shell');
  return t('env.stepFailed.install');
}

export function stepDetailText(step: PreflightStep, snapshot: PreflightSnapshot, t: Translate): string {
  if (step.status === 'failed') return failedStepText(snapshot.guidance, t);
  if (step.status === 'pending' || step.status === 'running') return '';
  if (step.id === 'toolchain') return step.status === 'ok' ? t('env.toolchain.ok') : t('env.toolchain.warn');
  if (step.id === 'opencli') return step.status === 'ok' ? t('env.runtime.ok') : '';
  if (step.id === 'bridge') return step.status === 'ok' ? t('env.bridge.ok') : t('env.bridge.short');
  if (step.id === 'diy') return step.status === 'ok' ? t('env.diy.ok') : t('env.diy.short');
  if (step.id === 'warm') {
    return step.status === 'ok' ? t('env.warm.done', { n: step.detail ?? '0' }) : t('env.warm.short');
  }
  return '';
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
  const key = `env.bridge.${issue}`;
  const text = t(key);
  return { text: text === key ? t('env.bridge.unknown') : text };
}
