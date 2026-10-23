import type { Translate } from '@dsh-workbench/shared';
import type {
  PreflightBridgeIssue,
  PreflightGuidance,
  PreflightSnapshot,
  PreflightStep,
} from '@/shared/api/host/preflight';

export function failedStepText(guidance: PreflightGuidance | undefined, t: Translate): string {
  if (guidance === 'path') return t('env.stepFailed.path');
  if (guidance === 'shell') return t('env.stepFailed.shell');
  return t('env.stepFailed.install');
}

export function stepDetailText(step: PreflightStep, snapshot: PreflightSnapshot, t: Translate): string {
  if (step.status === 'failed') return failedStepText(snapshot.guidance, t);
  if (step.status === 'pending' || step.status === 'running') return '';
  if (step.id === 'toolchain') return step.status === 'ok' ? t('env.toolchain.ok') : t('env.toolchain.warn');
  if (step.id === 'opencli') return step.status === 'ok' ? t('env.opencli.ok') : '';
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

export const OPENCLI_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk';

export interface BridgeAdvice {
  readonly textKey: string;
  readonly link?: { readonly labelKey: string; readonly href: string };
}

export function bridgeAdvice(issue: PreflightBridgeIssue): BridgeAdvice {
  if (issue === 'daemon') return { textKey: 'env.bridge.daemon' };
  if (issue === 'extension') {
    return {
      textKey: 'env.bridge.extension',
      link: { labelKey: 'env.bridge.extensionLink', href: OPENCLI_EXTENSION_URL },
    };
  }
  if (issue === 'profile') return { textKey: 'env.bridge.profile' };
  if (issue === 'stale') return { textKey: 'env.bridge.stale' };
  return { textKey: 'env.bridge.unknown' };
}
