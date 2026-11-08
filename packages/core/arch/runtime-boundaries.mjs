export const HOST_ONLY_PREFIXES = [
  'src/kernel/host/',
  'src/shared/api/host/',
  'src/app/host.ts',
];

export const CLIENT_ONLY_PREFIXES = [
  'src/kernel/client/',
  'src/app/layouts/',
  'src/shared/components/',
  'src/shared/hooks/',
  'src/shared/styles/',
];

export const CLIENT_GRAPH_HOST_PATHS = [...HOST_ONLY_PREFIXES, 'src/app/units/host.ts'];

export const HOST_GRAPH_CLIENT_PATHS = [...CLIENT_ONLY_PREFIXES, 'src/app/units/manifests.ts'];
