import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: ['*.ts'],
  exceptions: [
    { rule: 'S11', glob: 'src/index.ts', reason: '包的公开面就是这一份 barrel：package.json 的 exports 指向它，只做导出、不放逻辑。' },
  ],
});
