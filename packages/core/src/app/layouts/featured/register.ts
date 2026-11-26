import { LOCALE_NS } from '@dsh-workbench/shared';
import type { DshClientContext, Translate } from '@dsh-workbench/shared';
import { boundaryOf } from '@/shared/components/EntryBoundary';
import { reportEntrySkip } from '@/shared/hooks/entry-report';
import { FeaturedSection } from './FeaturedSection';

const FEATURED_TAB_ID = 'dsh-plugins-plugin';
const APPLIED_FLAG = '__DSH_FEATURED_APPLIED__';
const FULL_FLAG = '__DSH_FEATURED_FULL__';
const ENTRY_FLAG = '__DSH_FEATURED_ENTRY__';

interface FeaturedEntryHandle {
  readonly dispose: () => void;
}

interface FeaturedFlags {
  __DSH_FEATURED_APPLIED__?: boolean;
  __DSH_FEATURED_FULL__?: boolean;
  __DSH_FEATURED_ENTRY__?: FeaturedEntryHandle;
}

const noop = (): void => {};

function flagsOf(): FeaturedFlags | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as typeof window & FeaturedFlags;
}

export function installFeaturedEntry(ctx: DshClientContext): () => void {
  const flags = flagsOf();
  if (flags === undefined || flags[APPLIED_FLAG] === true) return noop;
  flags[APPLIED_FLAG] = true;
  if (flags[FULL_FLAG] === true) {
    flags[APPLIED_FLAG] = false;
    return noop;
  }
  let offTab: (() => void) | undefined;
  try {
    const bindT = (): Translate => ctx.locale.bind(LOCALE_NS);
    offTab = ctx.slots.inject('plugins.tab', () =>
      ctx.slots.register(
        {
          name: 'plugins.tab',
          id: FEATURED_TAB_ID,
          order: 100,
          locale: LOCALE_NS,
          label: () => bindT()('featured.tab'),
          inject: () => ({ t: bindT() }),
        },
        boundaryOf('plugins.tab', FeaturedSection),
      ),
    );
  } catch (error) {
    flags[APPLIED_FLAG] = false;
    reportEntrySkip('featured-tab', error);
    return noop;
  }
  const disposer = (): void => {
    offTab?.();
    flags[ENTRY_FLAG] = undefined;
    flags[APPLIED_FLAG] = false;
  };
  flags[ENTRY_FLAG] = { dispose: disposer };
  return disposer;
}
