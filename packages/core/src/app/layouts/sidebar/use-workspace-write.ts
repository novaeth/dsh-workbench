import { useState } from 'react';

export interface WorkspaceWrite {
  readonly busy: boolean;
  readonly failed: boolean;
  readonly submit: () => void;
}

export function useWorkspaceWrite(write: () => Promise<boolean>, onWritten: () => void): WorkspaceWrite {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = (): void => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const settle = (ok: boolean): void => {
      setBusy(false);
      if (ok) onWritten();
      else setFailed(true);
    };
    void write().then(settle, () => settle(false));
  };
  return { busy, failed, submit };
}
