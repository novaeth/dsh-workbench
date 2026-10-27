export const SEED_SPECIFIERS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
];

export const SEED_SHORT = new Set([
  'react',
  'react-dom',
  'cordis',
  'zod',
  '@tanstack/react-virtual',
  'dsh-client-store',
  'ui-slots',
  'ui-primitives',
  'ui-dockkit',
  ...SEED_SPECIFIERS.filter((name) => name.startsWith('@deepseek-ai/dsh-client')),
]);

const SEED_LONG = new Set(SEED_SPECIFIERS);

export const isSeedSpecifier = (specifier) => SEED_LONG.has(specifier);

export const BROWSER_SEED_SPECIFIERS = SEED_SPECIFIERS.filter(
  (name) => name.startsWith('@deepseek-ai/'),
);
