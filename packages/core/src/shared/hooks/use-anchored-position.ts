import { useLayoutEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';

export interface AnchoredPositionOptions {
  readonly open: boolean;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly align: 'start' | 'end';
  readonly gap: number;
  readonly margin: number;
}

export interface AnchoredPositionInput {
  readonly anchor: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly panel: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly align: 'start' | 'end';
  readonly gap: number;
  readonly margin: number;
}

export function anchoredPositionOf(input: AnchoredPositionInput): CSSProperties {
  const { anchor, panel, viewport, align, gap, margin } = input;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - panel.height;
  const top = below + panel.height + margin > viewport.height && above >= margin ? above : below;
  const wanted = align === 'end' ? anchor.right - panel.width : anchor.left;
  const left = Math.max(margin, Math.min(wanted, viewport.width - panel.width - margin));
  return { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` };
}

function useFallbackAnchoredPosition(options: AnchoredPositionOptions): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  const { open, anchorRef, panelRef, align, gap, margin } = options;
  useLayoutEffect(() => {
    if (!open) return;
    const place = (): void => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (anchor === null || panel === null) return;
      const box = anchor.getBoundingClientRect();
      setStyle(
        anchoredPositionOf({
          anchor: { top: box.top, right: box.right, bottom: box.bottom, left: box.left },
          panel: { width: panel.offsetWidth, height: panel.offsetHeight },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          align,
          gap,
          margin,
        }),
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, panelRef, align, gap, margin]);
  return open ? style : undefined;
}

type DshAnchoredPositionHook = (options: AnchoredPositionOptions) => CSSProperties | undefined;

const dshAnchoredPosition = (primitives as unknown as Record<string, unknown>).useAnchoredPosition as
  | DshAnchoredPositionHook
  | undefined;

export const useAnchoredPosition: DshAnchoredPositionHook =
  typeof dshAnchoredPosition === 'function' ? dshAnchoredPosition : useFallbackAnchoredPosition;
