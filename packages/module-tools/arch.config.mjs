import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: [],
  roles: [
    { id: 'lib:index', pattern: 'src/index.mjs', layer: 40, exclusive: true },
    { id: 'lib:registry', pattern: 'src/check.mjs', layer: 30, exclusive: true },
    { id: 'lib:checks', pattern: 'src/checks/*.mjs', layer: 20, exclusive: true },
    { id: 'lib:root', pattern: 'src/*.mjs', layer: 10 },
    { id: 'lib:bin', pattern: 'bin/*.mjs', layer: 50 },
  ],
  exceptions: [
    {
      rule: 'H08',
      glob: 'src/checks/cards.mjs',
      reason: '这条判据的夹具就是一个本地工作台地址，用来验证卡片取数；它不是可发布的默认值。',
    },
  ],
  overrides: {
    include: ['src/**', 'bin/**'],
    thresholds: {
      fileLines: 1300,
      viewLines: 1300,
      functionLines: 160,
      exportsPerFile: 60,
      componentsPerFile: 10,
    },
  },
});
