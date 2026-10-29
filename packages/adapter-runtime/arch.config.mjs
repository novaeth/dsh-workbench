import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: ['*.ts'],
  modules: { browser: 2, cli: 2, data: 2, git: 2, libs: 2, command: 2 },
  exceptions: [
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
