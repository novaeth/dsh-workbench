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
    void write().then((ok) => {
      setBusy(false);
      if (ok) onWritten();
      else setFailed(true);
    });
  };
  return { busy, failed, submit };
}
