import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { CenteredState, EmptyIllustration } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { DiscoverSkeleton } from '../market/discover-states';

export function MarketChecking({ t }: { readonly t: Translate }) {
  return <DiscoverSkeleton label={t('panels.market.checking')} />;
}

export function MarketEmpty({
  t,
  onBuildModule,
}: {
  readonly t: Translate;
  readonly onBuildModule?: (() => void) | undefined;
}) {
  return (
    <CenteredState
      compact
      icon={<EmptyIllustration size={72} />}
      title={t('panels.market.emptyInstalled')}
      hint={t('panels.market.emptyInstalledHint')}
      {...(onBuildModule === undefined
        ? {}
        : {
            action: (
              <Button type="button" size="sm" variant="outline" onClick={onBuildModule}>
                {t('panels.buildModule')}
              </Button>
            ),
          })}
    />
  );
}
