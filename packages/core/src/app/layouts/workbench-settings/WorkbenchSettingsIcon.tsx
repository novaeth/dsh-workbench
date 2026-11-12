import { createElement as h } from 'react';
import { IconBrandMark } from '@dsh-workbench/shared';

export interface WorkbenchSettingsIconProps {
  readonly size: number;
}

export function WorkbenchSettingsIcon({ size }: WorkbenchSettingsIconProps): JSX.Element {
  return <IconBrandMark size={size} />;
}
