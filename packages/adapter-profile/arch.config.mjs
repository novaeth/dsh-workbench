import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: ['*.ts'],
  exceptions: [
    { rule: 'S11', glob: 'src/index.ts', reason: '包的公开面就是这一份 barrel：package.json 的 exports 指向它，只做导出、不放逻辑。' },
    {
      rule: 'P06',
      glob: 'src/__tests__/**',
      reason: '测试夹具要真起子进程去跑脚本，验证的是脚本本身的行为；产品代码里起进程仍然只走 execa。',
    },
  ],
});
