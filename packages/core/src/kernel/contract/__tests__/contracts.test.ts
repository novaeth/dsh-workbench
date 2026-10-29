import { describe, expect, it } from 'vitest';
import { BUNDLE_REGISTRIES_ROUTE, RESTART_REASONS } from '../bundle-install';
import { CONFIG_SYNC_ROUTE } from '../config-sync';
import { DIY_PRESET_ID } from '../diy';
import { DSH_PLUGINS_ROUTE } from '../dsh-plugins';
import { LONG_TASKS_ROUTE } from '../long-tasks';
import type { HostSurface } from '../platform';
import { WAKE_BROWSER_ROUTE } from '../preflight-wake';
import { PROFILE_CREATE_ROUTE } from '../profile-create';
import { SIDEBAR_EDITION_ROUTE } from '../sidebar-edition';
import { UNIT_MANIFESTS_ROUTE } from '../unit-manifests';

describe('kernel contract', () => {
  it('keeps the route ids and static unions stable', () => {
    expect([
      BUNDLE_REGISTRIES_ROUTE,
      CONFIG_SYNC_ROUTE,
      DSH_PLUGINS_ROUTE,
      LONG_TASKS_ROUTE,
      WAKE_BROWSER_ROUTE,
      PROFILE_CREATE_ROUTE,
      SIDEBAR_EDITION_ROUTE,
      UNIT_MANIFESTS_ROUTE,
    ]).toEqual([
      'bundle-registries',
      'config-sync',
      'dsh-plugins',
      'long-tasks',
      'wake-browser',
      'profile-create',
      'sidebar-edition',
      'unit-manifests',
    ]);
    expect(DIY_PRESET_ID).toBe('workbench-diy');
    expect(RESTART_REASONS.length).toBeGreaterThan(0);
    const surface = null as HostSurface | null;
    expect(surface).toBeNull();
  });
});
