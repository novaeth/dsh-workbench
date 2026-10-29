import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: ['*.ts'],
  exceptions: [
    { rule: 'S11', glob: 'src/index.ts', reason: '包的公开面就是这一份 barrel：package.json 的 exports 指向它，只做导出、不放逻辑。' },
    {
      rule: 'P06',
      glob: 'src/self-update.ts',
      reason:
        '命中的是自更新脚本模板里那段 `node -e` 片段：`process.argv` 是那段 node 自己的入参，不是插件在解析命令行。',
    },
    {
      rule: 'P06',
      glob: 'src/__tests__/**',
      reason: '测试夹具要真跑一段带 `process.argv` 的脚本，验证的是脚本本身的行为。',
    },
  ],
});
