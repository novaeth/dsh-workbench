import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';

import type {
  BundleCancellationPayload,
  BundleChange,
  BundleInspectProblem,
  BundleInstallPayload,
  BundleInstalledPlugin,
  BundleModulePayload,
  BundleRemovePayload,
  BundleSupplyPayload,
} from '@/shared/api/bundle-install';
import { readBundleInspection, readBundleRegistries } from '@/shared/hooks/bundle-queries';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import {
  heldWizardPhase,
  previewOf,
  registryOf,
  registryOptions,
  type AddModulePhase,
  type AddModulePreview,
  type RegistryChoice,
  type RegistryOption,
} from './add-module-text';

export type { AddModulePhase, AddModulePreview } from './add-module-text';

export interface AddModuleOutcome {
  readonly change: BundleChange;
  readonly module: BundleModulePayload;
  readonly supply: BundleSupplyPayload;
  readonly plugin?: BundleInstalledPlugin;
}

export interface AddModuleProblem {
  readonly problem: BundleInspectProblem;
  readonly reason: string;
}

export interface AddModuleState {
  readonly spec: string;
  readonly choice: RegistryChoice;
  readonly custom: string;
  readonly registryOpen: boolean;
  readonly guideOpen: boolean;
  readonly phase: AddModulePhase;
  readonly choices: readonly RegistryOption[];
  readonly problem: AddModuleProblem | null;
  readonly preview: AddModulePreview | null;
  readonly outcome: AddModuleOutcome | null;
  readonly failure: string | null;
  readonly removing: boolean;
  readonly builds: readonly string[];
  setSpec(value: string): void;
  setChoice(choice: RegistryChoice): void;
  setCustom(value: string): void;
  toggleRegistry(): void;
  closeRegistry(): void;
  toggleGuide(): void;
  check(): void;
  edit(): void;
  install(builds?: readonly string[]): void;
  cancelInstall(): void;
  removeIt(): void;
}

function newRequestId(): string {
  return crypto.randomUUID();
}

export function useAddModule(options: {
  readonly open: boolean;
  readonly onInstalled: () => void;
  readonly failedText: string;
}): AddModuleState {
  const { open, onInstalled, failedText } = options;
  const [spec, setSpec] = useState('');
  const [choice, setChoice] = useState<RegistryChoice>({ kind: 'default', value: '' });
  const [custom, setCustom] = useState('');
  const [registryOpen, setRegistryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [phase, setPhase] = useState<AddModulePhase>('idle');
  const [choices, setChoices] = useState<readonly RegistryOption[]>(() => registryOptions(null));
  const [problem, setProblem] = useState<AddModuleProblem | null>(null);
  const [preview, setPreview] = useState<AddModulePreview | null>(null);
  const [outcome, setOutcome] = useState<AddModuleOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const generationRef = useRef(0);
  const requestIdRef = useRef('');
  const { busy: classifying } = useVisibleBusy(phase === 'inspecting', MIN_BUSY_MS);

  const write = useHostWrite<BundleInstallPayload>({ channel: 'provision', networkText: failedText });
  const cancel = useHostWrite<BundleCancellationPayload>({ channel: 'provision', networkText: failedText });
  const remove = useHostWrite<BundleRemovePayload>({ channel: 'provision', networkText: failedText });

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    void readBundleRegistries().then((response) => {
      if (!alive) return;
      setChoices(registryOptions(response.ok ? response.registries : null));
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const registry = registryOf(choice, custom);

  useEffect(() => {
    if (open) return;
    generationRef.current += 1;
    setGuideOpen(false);
    setRegistryOpen(false);
    setProblem(null);
    setPreview(null);
    setOutcome(null);
    setFailure(null);
    setPhase('idle');
  }, [open]);

  const check = useCallback((): void => {
    const wanted = spec.trim();
    if (wanted === '') return;
    const mine = generationRef.current + 1;
    generationRef.current = mine;
    setProblem(null);
    setFailure(null);
    setPreview(null);
    setOutcome(null);
    setRegistryOpen(false);
    setPhase('inspecting');
    void readBundleInspection(wanted, registry).then((response) => {
      if (generationRef.current !== mine) return;
      if (!response.ok) {
        setFailure(response.error.message);
        setPhase('idle');
        return;
      }
      const inspection = response.inspection;
      if (inspection.status === 'refused') {
        setProblem({ problem: inspection.problem, reason: inspection.reason });
        setPhase('idle');
        return;
      }
      setPreview(previewOf(inspection, wanted));
      setPhase('preview');
    });
  }, [spec, registry]);

  const install = useCallback(
    (approvedBuilds: readonly string[] = []): void => {
      const wanted = spec.trim();
      if (wanted === '') return;
      const mine = generationRef.current + 1;
      generationRef.current = mine;
      const id = newRequestId();
      requestIdRef.current = id;
      setFailure(null);
        setPhase('installing');
      void write
        .send({
          action: 'install-bundle',
          spec: wanted,
          ...(registry === undefined ? {} : { registry }),
          requestId: id,
          ...(approvedBuilds.length === 0 ? {} : { approvedBuilds: [...approvedBuilds] }),
        })
        .then((response) => {
          if (generationRef.current !== mine) return;
          if (!response.ok) {
            setFailure(response.message);
            setPhase('result');
            return;
          }
          const value = response.value;
          setOutcome({
            change: value.change,
            module: value.module,
            supply: value.supply,
            ...(value.plugin === undefined ? {} : { plugin: value.plugin }),
          });
          setPhase('result');
          if (value.change.application === 'applied' || value.change.application === 'restart-required') {
            onInstalled();
          }
        });
    },
    [spec, registry, write, onInstalled],
  );

  const cancelInstall = useCallback((): void => {
    void cancel.send({ action: 'cancel-install', requestId: requestIdRef.current });
  }, [cancel]);

  const [removing, setRemoving] = useState(false);

  const removeIt = useCallback((): void => {
    const pkg = outcome?.module.pkg;
    if (pkg === undefined) return;
    setRemoving(true);
    setFailure(null);
    void remove.send({ action: 'remove-bundle', name: pkg }).then((result) => {
      setRemoving(false);
      if (!result.ok) {
        setFailure(result.message);
        return;
      }
      onInstalled();
    });
  }, [outcome, remove, onInstalled]);

  const edit = useCallback((): void => {
    generationRef.current += 1;
    setProblem(null);
    setFailure(null);
    setPreview(null);
    setPhase('idle');
  }, []);

  return {
    spec,
    choice,
    custom,
    registryOpen,
    guideOpen,
    phase: heldWizardPhase(phase, classifying),
    choices,
    problem,
    preview,
    outcome,
    failure,
    removing,
    builds: outcome?.change.pendingBuilds ?? [],
    setSpec,
    setChoice: useCallback((next: RegistryChoice): void => {
      setChoice(next);
    }, []),
    setCustom,
    toggleRegistry: useCallback(() => setRegistryOpen((value) => !value), []),
    closeRegistry: useCallback(() => setRegistryOpen(false), []),
    toggleGuide: useCallback(() => setGuideOpen((value) => !value), []),
    check,
    edit,
    install,
    cancelInstall,
    removeIt,
  };
}
