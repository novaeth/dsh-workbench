import type { Translate } from '@dsh-workbench/shared';
import { runtimeTermsOf as fallbackTerms } from '@dsh-workbench/shared';
import { runtimeProfileValue } from './use-runtime-capabilities';

export function runtimeTermsOf(t: Translate): Readonly<Record<string, string>> {
  const profile = runtimeProfileValue();
  return profile === undefined ? fallbackTerms(t) : { ...profile.terms };
}
