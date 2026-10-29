import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: ['*.ts'],
  modules: { foundation: 1, browser: 2, cli: 2, data: 2, git: 2, libs: 2, command: 2 },
  exceptions: [
    { rule: 'S11', glob: 'src/index.ts', reason: '包的公开面就是这一份 barrel：package.json 的 exports 指向它，只做导出、不放逻辑。' },
    { rule: 'S11', glob: 'src/**/index.ts', reason: '子模块的公开面同样是 barrel：模块之间只从各自的 index 对外，不是随手加的转发层。' },
    {
      rule: 'P06',
      glob: 'src/__tests__/opencli-wrapper.test.ts',
      reason: '这测的是包装脚本本身：要真把 node 起来跑一遍参数透传，不是插件在解析命令行。',
    },
    {
      rule: 'S11',
      glob: 'src/cli/command.ts',
      reason: 'cli 的命令面从这里对外导出（opencli 的入口、运行时与窗口都挂在它后面），不是随手加的转发层。',
    },
  ],
});
