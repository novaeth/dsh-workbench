import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: ['*.ts'],
  exceptions: [
    {
      rule: 'H09',
      glob: 'src/index.ts',
      reason:
        '这个包本身就是**测试用的适配器替身**（package.json 里 private，只给集成测试当夹具）：' +
        '`FIXTURE_MARKER` 是它的全部意义 —— "假数据进生产路径"在这里不成立，它不进生产。',
    },
  ],
});
