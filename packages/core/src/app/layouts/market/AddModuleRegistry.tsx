import { createElement as h, useRef } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import styles from './AddModule.module.css';
import { TextField } from '@dsh-workbench/shared';
import {
  IconChevronDownOutlineRegular,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { customRegistryAllowed, optionLabel, registryName } from './add-module-text';
import type { AddModuleState } from './use-add-module';

const REGISTRY_ID = 'wb-add-module-registry';

export function AddModuleRegistry({ t, state }: { t: Translate; state: AddModuleState }) {
  const chosen = state.choices.find(
    (option) => option.choice.kind === state.choice.kind && option.choice.value === state.choice.value,
  );
  const customBad =
    state.choice.kind === 'custom' && state.custom.trim() !== '' && !customRegistryAllowed(state.custom);

  const registryRoot = useRef<HTMLDivElement | null>(null);
  const registryAnchor = useRef<HTMLButtonElement | null>(null);
  const registryPanel = useRef<HTMLDivElement | null>(null);
  const registryPosition = useAnchoredPosition({
    open: state.registryOpen,
    anchorRef: registryAnchor,
    panelRef: registryPanel,
    align: 'end',
    gap: 6,
    margin: 12,
  });
  useDismissOnOutsidePointer(registryRoot, state.registryOpen, (next) => {
    if (!next) state.closeRegistry();
  });

  return (
    <div
      className={styles.registryWrap}
      ref={registryRoot}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !state.registryOpen) return;
        event.stopPropagation();
        state.closeRegistry();
      }}
    >
      <button
        type="button"
        ref={registryAnchor}
        className={styles.registryToggle}
        aria-expanded={state.registryOpen}
        aria-haspopup="dialog"
        aria-controls={REGISTRY_ID}
        disabled={state.phase === 'inspecting'}
        onClick={state.toggleRegistry}
      >
        <span>{t('panels.market.add.registryToggle')}</span>{' '}
        <span className={styles.registryChosen}>
          {chosen === undefined ? t('panels.market.add.registryDefault') : registryName(chosen, t)}
        </span>
        <IconChevronDownOutlineRegular size={14} />
      </button>

      {state.registryOpen ? (
        <div
          id={REGISTRY_ID}
          className={styles.registry}
          ref={registryPanel}
          role="dialog"
          aria-label={t('panels.market.add.registryLegend')}
          style={registryPosition ?? undefined}
        >
          {state.choices.map((option) => {
            const active =
              option.choice.kind === state.choice.kind && option.choice.value === state.choice.value;
            const custom = option.choice.kind === 'custom';
            if (!custom) {
              return (
                <label
                  key={`${option.choice.kind}|${option.choice.value}`}
                  className={styles.registryOption}
                  data-checked={active}
                >
                  <input
                    type="radio"
                    name={REGISTRY_ID}
                    checked={active}
                    onChange={() => state.setChoice(option.choice)}
                  />
                  <span className={styles.registryTitle}>
                    <span>{optionLabel(option, t)}</span>
                  </span>
                </label>
              );
            }
            return (
              <div
                key={`${option.choice.kind}|${option.choice.value}`}
                className={styles.registryOption}
                data-checked={active}
                onPointerDown={() => {
                  if (!active) state.setChoice(option.choice);
                }}
                onFocusCapture={() => {
                  if (!active) state.setChoice(option.choice);
                }}
              >
                <label className={styles.registryPick}>
                  <input
                    type="radio"
                    name={REGISTRY_ID}
                    checked={active}
                    onChange={() => state.setChoice(option.choice)}
                  />
                  <span className={styles.registryTitle}>
                    <span>{t('panels.market.add.registryCustom')}</span>
                  </span>
                </label>
                <TextField
                  type="text"
                  className={styles.registryField}
                  aria-label={t('panels.market.add.registryCustom')}
                  placeholder={t('panels.market.add.registryCustomPlaceholder')}
                  value={state.custom}
                  invalid={customBad}
                  onChange={(event) => state.setCustom(event.target.value)}
                />
                {customBad ? (
                  <span className={styles.inputError} role="alert">
                    {t('panels.market.add.registryCustomInvalid')}
                  </span>
                ) : null}
                <span className={styles.registryHint}>
                  {t('panels.market.add.registryCustomHint')}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
