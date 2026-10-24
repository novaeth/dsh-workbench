export const primitives = {
  roots: { primitives: '/w/primitives/lib/types' },
  files: {
    Button: '/w/primitives/lib/types/Button.d.ts',
    IconSearchOutlineRegular: '/w/primitives/lib/types/icons/index.d.ts',
    useAnchoredPosition: '/w/primitives/lib/types/useAnchoredPosition.d.ts',
  },
  installed: { version: '0.2.1-rc.2', dir: '/w/primitives' },
  counts: { total: 288, components: 65, icons: 188, hooks: 5, lib: 29 },
  onlyPrimitives: { components: ['Button', 'Modal'], icons: ['IconSearchOutlineRegular'], hooks: [], lib: [] },
  kitCovered: [{ name: 'relativeTime', bucket: 'components' }],
};

export const kit = {
  roots: { shell: '/w/core/dist/types', shared: '/w/core/node_modules/@dsh-workbench/shared/dist' },
  buckets: { components: ['Card'], hooks: ['useApiResource'] },
  files: { Card: '/w/shared/dist/components/Card.d.ts', useApiResource: '/w/core/dist/types/shared/hooks/use-api-resource.d.ts' },
  missing: [],
};
