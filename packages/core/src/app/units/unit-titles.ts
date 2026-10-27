import type { MessagesContribution, UnitManifest } from '@dsh-workbench/shared';
import { unitTitleKey } from '@dsh-workbench/shared';

export const UNIT_TITLES_OWNER = 'dsh-workbench';

export function unitTitlesOf(manifests: readonly UnitManifest[]): MessagesContribution {
  const zh: Record<string, string> = {};
  const en: Record<string, string> = {};
  for (const manifest of manifests) {
    const title = manifest.title;
    if (title === undefined || title.zh.trim() === '' || title.en.trim() === '') continue;
    zh[unitTitleKey(manifest.id)] = title.zh;
    en[unitTitleKey(manifest.id)] = title.en;
  }
  return { unit: UNIT_TITLES_OWNER, messages: { zh, en } };
}
