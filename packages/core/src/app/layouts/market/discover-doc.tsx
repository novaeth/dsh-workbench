import { createElement as h, useEffect, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import type { DiscoverDoc, DiscoverDocKind } from '@/kernel/contract/market-index';
import { readMarketDoc } from '@/shared/hooks/market-queries';
import styles from './MarketPage.module.css';

export interface DiscoverDocPanelProps {
  readonly t: Translate;
  readonly name: string;
  readonly version: string;
  readonly kind: DiscoverDocKind;
}

function kindLabel(t: Translate, kind: DiscoverDocKind): string {
  return t(kind === 'readme' ? 'panels.discover.docReadme' : 'panels.discover.docChangelog');
}

export function markdownLabelsOf(t: Translate): {
  readonly code: { readonly copyLabel: string; readonly copiedLabel: string };
  readonly footnotes: string;
} {
  return {
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  };
}

export function DiscoverDocPanel({ t, name, version, kind }: DiscoverDocPanelProps) {
  const [doc, setDoc] = useState<DiscoverDoc | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void readMarketDoc(name, version, kind).then((response) => {
      if (live) setDoc(response.ok ? response.doc : { ok: false, kind, version, reason: 'unavailable' });
    });
    return () => {
      live = false;
    };
  }, [name, version, kind]);
  const label = kindLabel(t, kind);
  if (doc === undefined) {
    return h('p', { className: styles.discoverDocNotice }, t('panels.discover.docLoading'));
  }
  if (!doc.ok) {
    return h(
      'p',
      { className: styles.discoverDocNotice },
      doc.reason === 'missing'
        ? t('panels.discover.docMissing', { kind: label })
        : t('panels.discover.docUnavailable', {
            kind: label,
            reason: doc.detail?.trim() || t('panels.discover.docUnknownReason'),
          }),
    );
  }
  return h(
    'section',
    { className: styles.discoverSection, 'data-market-doc': kind },
    h(
      'div',
      { className: styles.discoverDocBody },
      h(MarkdownText, { text: doc.text, labels: markdownLabelsOf(t) }),
    ),
  );
}
