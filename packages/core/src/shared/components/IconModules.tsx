import { createElement as h } from 'react';
import type { IconProps } from '@dsh-workbench/shared';

export function IconModules({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
