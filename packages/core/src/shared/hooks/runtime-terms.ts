import type { Translate } from '@dsh-workbench/shared';
import { runtimeTermsOf as fallbackTerms } from '@dsh-workbench/shared';
import { runtimeProfileValue } from './use-runtime-capabilities';
import { runtimeText } from '@/shared/hooks/locale-text';

export function runtimeTermsOf(t: Translate): Readonly<Record<string, string>> {
  const profile = runtimeProfileValue();
  if (profile === undefined) return fallbackTerms(t);
  return {
    plugin: runtimeText(profile.terms.plugin),
    pluginOf: runtimeText(profile.terms.pluginOf),
    pluginThing: runtimeText(profile.terms.pluginThing),
    pluginArea: runtimeText(profile.terms.pluginArea),
  };
}
