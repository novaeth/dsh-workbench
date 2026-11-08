import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SetupPhase,
  SetupSnapshot,
  SetupStep,
  SetupWriteResult,
  UnitSetup,
} from '@dsh-workbench/shared';

/**
 * `useUnitSetup` 的入参：步骤、读配置、写配置与两个回调。
 */
export interface UseUnitSetupOptions {
  readonly steps: readonly SetupStep[];
  readonly read?: (() => Promise<SetupSnapshot>) | undefined;
  readonly initialValues?: Readonly<Record<string, unknown>> | undefined;
  readonly write?:
    | ((values: Readonly<Record<string, unknown>>) => Promise<SetupWriteResult>)
    | undefined;
  readonly initialStep?: ((snapshot: SetupSnapshot) => string) | undefined;
  readonly onReady?: ((snapshot: SetupSnapshot) => void) | undefined;
  readonly onSaved?: (() => void) | undefined;
}

/**
 * 初始化的那台状态机：读配置定相位、按步走、每步可存、完成进主页、`edit` 模式一次存全量。
 * @param options.steps - 步骤；每步给 `render`、可选的 `canLeave` / `next` / `submit`。
 * @param options.read - 读一次配置：`configured` 为真表示已配置（相位直接到 `ready`）；不给就直接进 `needs-setup`。
 * @param options.initialValues - 没有 `read` 时的初始值（编辑当前配置的常见接法）。
 * @param options.write - `edit` 模式存全量时用；不给则 `saveAll` 无效。
 * @param options.initialStep - 未配置时从哪一步开始；不给用第一步。
 * @param options.onReady - 相位到 `ready` 时回调（含配置已存在的那次读）。
 * @param options.onSaved - `saveAll` 写成功时回调。
 * @returns 相位、当前步、值、忙碌/错误与几个动作。
 */
export function useUnitSetup({
  steps,
  read,
  initialValues,
  write,
  initialStep,
  onReady,
  onSaved,
}: UseUnitSetupOptions): UnitSetup {
  const [phase, setPhase] = useState<SetupPhase>(read === undefined ? 'needs-setup' : 'checking');
  const [stepId, setStepId] = useState<string>(() => steps[0]?.id ?? '');
  const [values, setValuesState] = useState<Record<string, unknown>>(() => ({ ...(initialValues ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readRef = useRef(read);
  const stepsRef = useRef(steps);
  const initialStepRef = useRef(initialStep);
  const onReadyRef = useRef(onReady);
  const onSavedRef = useRef(onSaved);
  const ticketRef = useRef(0);

  useEffect(() => {
    readRef.current = read;
  }, [read]);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  useEffect(() => {
    initialStepRef.current = initialStep;
  }, [initialStep]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const load = useCallback(() => {
    const currentRead = readRef.current;
    if (currentRead === undefined) return;
    const ticket = ticketRef.current + 1;
    ticketRef.current = ticket;
    setPhase('checking');
    setError(null);
    void currentRead()
      .then((snapshot) => {
        if (ticketRef.current !== ticket) return;
        setValuesState({ ...(snapshot.values ?? {}) });
        if (snapshot.configured) {
          setPhase('ready');
          onReadyRef.current?.(snapshot);
          return;
        }
        const list = stepsRef.current;
        const wanted = initialStepRef.current?.(snapshot) ?? list[0]?.id ?? '';
        setStepId(list.some((step) => step.id === wanted) ? wanted : (list[0]?.id ?? ''));
        setPhase('needs-setup');
      })
      .catch((caught: unknown) => {
        if (ticketRef.current !== ticket) return;
        setError(messageOf(caught));
        setPhase('blocked');
      });
  }, []);

  useEffect(() => {
    if (readRef.current !== undefined) void Promise.resolve().then(load);
  }, [load]);

  const step = steps.find((candidate) => candidate.id === stepId);
  const index = steps.findIndex((candidate) => candidate.id === stepId);
  const canLeave = step?.canLeave?.(values) ?? true;

  const goNext = (): void => {
    if (step === undefined || busy || !canLeave) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        if (step.submit !== undefined) {
          const result = await step.submit(values);
          if (!result.ok) {
            setError(result.message);
            return;
          }
        }
        const target = step.next === undefined ? nextId(steps, step.id) : step.next(values);
        if (target === null) {
          setPhase('ready');
          return;
        }
        setStepId(target);
      } catch (caught) {
        setError(messageOf(caught));
      } finally {
        setBusy(false);
      }
    })();
  };

  const goBack = (): void => {
    if (index <= 0) return;
    const previous = steps[index - 1];
    if (previous !== undefined) setStepId(previous.id);
  };

  const saveAll = (): void => {
    if (write === undefined || busy) return;
    setBusy(true);
    setError(null);
    void write(values)
      .then((result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setPhase('ready');
        onSavedRef.current?.();
      })
      .catch((caught: unknown) => {
        setError(messageOf(caught));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return {
    phase,
    steps,
    step,
    values,
    setValues: setValuesState,
    busy,
    error,
    canLeave,
    canBack: index > 0,
    next: goNext,
    back: goBack,
    retry: load,
    saveAll,
  };
}

function nextId(steps: readonly SetupStep[], id: string): string | null {
  const at = steps.findIndex((step) => step.id === id);
  if (at < 0 || at >= steps.length - 1) return null;
  return steps[at + 1]?.id ?? null;
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
