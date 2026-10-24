import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import styles from './AddModule.module.css';
import { TextField } from '@dsh-workbench/shared';
import { GUIDE_ITEMS, problemKey } from './add-module-text';
import { AddModuleRegistry } from './AddModuleRegistry';
import type { AddModuleState } from './use-add-module';
import {
  Button,
  IconChevronDownOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

export function AddModuleForm({ t, state }: { t: Translate; state: AddModuleState }) {
  return (
    <div className={styles.body}>
      <div className={styles.field}>
        <TextField
          type="text"
          className={styles.input}
          value={state.spec}
          placeholder={t('panels.market.add.specPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('panels.market.add.specLabel')}
          invalid={state.problem !== null}
          onChange={(event) => state.setSpec(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && state.spec.trim() !== '') state.check();
          }}
        />
      </div>

      {state.problem === null ? null : (
        <p className={styles.problem} role="alert">
          {t(problemKey(state.problem.problem), { reason: state.problem.reason })}
        </p>
      )}
      {state.failure === null ? null : (
        <p className={styles.problem} role="alert">
          {state.failure}
        </p>
      )}

      <div className={styles.options}>
        <button
          type="button"
          className={styles.guideToggle}
          aria-expanded={state.guideOpen}
          onClick={state.toggleGuide}
        >
          <IconChevronDownOutlineRegular size={14} />
          <span>{t(state.guideOpen ? 'panels.market.add.guideHide' : 'panels.market.add.guideToggle')}</span>
        </button>

        <AddModuleRegistry t={t} state={state} />
      </div>

      {state.guideOpen ? (
        <div className={styles.guide}>
          <ol className={styles.guideList}>
            {GUIDE_ITEMS.map((item, index) => (
              <li className={styles.guideItem} key={item.exampleKey}>
                <span className={styles.guideIndex} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.guideMain}>
                  <span className={styles.guideTitle}>{t(item.titleKey)}</span>
                  <span className={styles.guideHint}>{t(item.hintKey)}</span>
                  <span className={styles.guideExample}>
                    <span className={styles.guideExampleLabel}>
                      {t('panels.market.add.guideExampleLabel')}
                    </span>
                    <code>{t(item.exampleKey)}</code>
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t('panels.market.add.guideFill')}
                  onClick={() => state.setSpec(t(item.exampleKey))}
                >
                  {t('panels.market.add.guideFill')}
                </Button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
