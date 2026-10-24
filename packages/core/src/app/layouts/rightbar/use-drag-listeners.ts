import { useEffect, useRef } from 'react';

export interface DragPointerHandlers {
  readonly move: (x: number, y: number) => void;
  readonly drop: (y: number) => void;
  readonly cancel: () => void;
}

export function useDragListeners(active: boolean, handlers: DragPointerHandlers): void {
  const latestRef = useRef(handlers);
  useEffect(() => {
    latestRef.current = handlers;
  });

  useEffect(() => {
    if (!active) return;
    const onMove = (event: PointerEvent): void => latestRef.current.move(event.clientX, event.clientY);
    const onUp = (event: PointerEvent): void => latestRef.current.drop(event.clientY);
    const onCancel = (): void => latestRef.current.cancel();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
    };
  }, [active]);
}
