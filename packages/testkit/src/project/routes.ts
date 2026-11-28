import {
  BUNDLE_INSPECT_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  MODULE_VERSIONS_ROUTE,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';
import { MARKET_INSTALLED_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import { PANELS_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { UNIT_MANIFESTS_ROUTE } from '@dsh-workbench/shared/contract/protocol/unit-manifests';

export {
  BUNDLE_INSPECT_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  MARKET_INSTALLED_ROUTE,
  MODULE_VERSIONS_ROUTE,
  PANELS_ROUTE,
  UNIT_MANIFESTS_ROUTE,
};

export const CAPABILITY_ROUTE = 'capability';
export const CHANGES_ROUTE = 'changes';
export const HEALTH_ROUTE = 'health';
export const INSTALLED_PLUGINS_ROUTE = 'panels/plugins';
export const PREFLIGHT_ROUTE = 'preflight';

export const READ_ROUTES = [
  UNIT_MANIFESTS_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  BUNDLE_INSPECT_ROUTE,
  CAPABILITY_ROUTE,
  PANELS_ROUTE,
  MODULE_VERSIONS_ROUTE,
  MARKET_INSTALLED_ROUTE,
  INSTALLED_PLUGINS_ROUTE,
  PREFLIGHT_ROUTE,
  CHANGES_ROUTE,
] as const;

export const WRITE_ROUTES = ['provision', 'prefs', 'actions'] as const;
