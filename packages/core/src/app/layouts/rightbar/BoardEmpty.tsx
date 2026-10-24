import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { CenteredState } from '@dsh-workbench/shared';
import { IconBrandMark } from '@dsh-workbench/shared';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

export function BoardEmpty({
  t,
  onBuildModule,
  onOpenModules,
  onOpenMarket,
}: {
  t: Translate;
  onBuildModule: () => void;
  onOpenModules: () => void;
  onOpenMarket: () => void;
}) {
  return (
    <CenteredState
      icon={<IconBrandMark size={32} />}
      title={t('panels.empty')}
      hint={t('panels.emptyHint')}
      action={
        <>
          <Button type="button" size="sm" variant="primary" onClick={onBuildModule}>
            {t('panels.buildModule')}
          </Button>
          <Button type="button" size="sm" variant="toolbar" onClick={onOpenModules}>
            {t('panels.choose')}
          </Button>
          <Button type="button" size="sm" variant="toolbar" onClick={onOpenMarket}>
            {t('panels.browseMarket')}
          </Button>
        </>
      }
    />
  );
}
