import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { ReadmeSectionKey, ReadmeShot } from '@dsh-workbench/shared/contract/readme';
import { README_SECTION_KEYS, readmeShotLines } from '@dsh-workbench/shared/contract/readme';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './approval-detail.module.css';

const SECTION_LABELS = {
  see: 'approval.plan.see',
  do: 'approval.plan.do',
  agent: 'approval.plan.agent',
  data: 'approval.plan.data',
} as const satisfies Readonly<Record<ReadmeSectionKey, string>>;

const HEADLESS_SECTION_LABELS = {
  see: 'approval.plan.output',
  do: 'approval.plan.trigger',
  agent: 'approval.plan.approval',
  data: 'approval.plan.headlessData',
} as const satisfies Readonly<Record<ReadmeSectionKey, string>>;

const CHANGE_TAG = /^(新增|删除|修改)：/;

const CHANGE_TONE: Readonly<Record<string, string>> = {
  新增: styles.changeAdd,
  删除: styles.changeRemove,
  修改: styles.changeEdit,
};

function changeOf(text: string): { tag: string; body: string } | null {
  const match = CHANGE_TAG.exec(text);
  if (match === null) return null;
  return { tag: match[1] ?? '', body: text.slice(match[0].length) };
}

export function planShots(args: Readonly<Record<string, unknown>>): readonly ReadmeShot[] {
  const raw = args['shots'];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((one) => {
    if (typeof one !== 'object' || one === null) return [];
    const shot = one as { kind?: ReadmeShot['kind']; caption?: unknown; ascii?: unknown };
    const caption = typeof shot.caption === 'string' ? shot.caption.trim() : '';
    const ascii = typeof shot.ascii === 'string' ? shot.ascii : '';
    return ascii.trim() === '' ? [] : [{ ...(shot.kind === undefined ? {} : { kind: shot.kind }), caption, ascii }];
  });
}

export function planSections(
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly { label: string; items: readonly string[] }[] {
  const sections: { label: string; items: readonly string[] }[] = [];
  const labels = args['destination'] === 'headless' ? HEADLESS_SECTION_LABELS : SECTION_LABELS;
  for (const key of README_SECTION_KEYS) {
    const raw = args[key];
    const items = Array.isArray(raw)
      ? raw.flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : []))
      : [];
    if (items.length > 0) sections.push({ label: t(labels[key]), items });
  }
  return sections;
}

export function PlanCard({
  args,
  t,
}: {
  readonly args: Readonly<Record<string, unknown>>;
  readonly t: Translate;
}) {
  const shots = planShots(args);
  const sections = planSections(args, t);
  const summary = typeof args['summary'] === 'string' ? args['summary'].trim() : '';
  const shotsText = readmeShotLines(shots).join('\n').trimEnd();

  return (
    <>
      {summary === '' ? null : <p className={styles.planSummary}>{summary}</p>}
      {shotsText === '' ? null : (
        <div className={styles.planShots}>
          <MarkdownText
            text={shotsText}
            labels={{
              code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
              footnotes: t('markdown.footnotes'),
            }}
          />
        </div>
      )}
      {sections.map((section) => (
        <div className={styles.shot} key={section.label}>
          <p className={styles.shotCaption}>{section.label}</p>
          <ul className={styles.shotItems}>
            {section.items.map((item, index) => {
              const change = changeOf(item);
              if (change === null) {
                return (
                  <li className={styles.shotItemMuted} key={String(index)}>
                    {item}
                  </li>
                );
              }
              return (
                <li className={styles.shotItem} key={String(index)}>
                  <span className={`${styles.changeTag} ${CHANGE_TONE[change.tag] ?? ''}`}>{change.tag}</span>
                  {change.body}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
