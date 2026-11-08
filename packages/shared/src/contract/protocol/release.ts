export const RELEASE_TARGETS = ['team', 'public', 'tarball', 'git', 'market', 'local'] as const;

export type ReleaseTarget = (typeof RELEASE_TARGETS)[number];
