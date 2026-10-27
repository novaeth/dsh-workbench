export type { NeedKindSpec as NeedKindSpecOf } from '../contract/needs.js';
export type NeedProbe = 'bin' | 'extension' | 'package' | 'env';

export { NEED_KIND_SPECS } from '../contract/needs.js';

export const NEED_PROBES: readonly NeedProbe[] = ['bin', 'extension', 'package', 'env'];
