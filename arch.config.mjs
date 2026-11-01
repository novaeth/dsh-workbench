import { deps, library } from '@arch-guard/core/presets';
import { STACK_CAPABILITIES } from './scripts/arch/stack.mjs';

const capabilities = {
  'process-spawn': STACK_CAPABILITIES['process-spawn'],
  'cli-locate': STACK_CAPABILITIES['cli-locate'],
};

export default {
  sourceForm: 'typescript',
  presets: [
    library({ src: 'scripts', entry: [], modules: {} }),
    deps({ capabilities }),
  ],
  overrides: {
    enable: ['P06'],
    include: ['scripts/**', 'packages/*/scripts/**', 'packages/*/bin/**', 'packages/*/arch/**'],
    addRoles: [
      { id: 'tooling:selfcheck', pattern: '**/selfcheck/**', layer: 95 },
      { id: 'tooling:root', pattern: 'scripts/**', layer: 80 },
      { id: 'tooling:pkg-scripts', pattern: 'packages/*/scripts/**', layer: 80 },
      { id: 'tooling:pkg-bin', pattern: 'packages/*/bin/**', layer: 81 },
      { id: 'tooling:arch-rules', pattern: 'packages/*/arch/**', layer: 80 },
    ],
    exceptions: [
      {
        rule: 'P06',
        glob: 'scripts/desktop-smoke/cdp-probe.mjs',
        reason:
          '探针给得子进程 env 里前插 Desktop 自带 node 的 bin 目录（opencli 的 .cmd 包装器要靠它找到 node），' +
          '不是在扫 PATH 找命令；`.cmd` 也只能由 cmd.exe 解析，用 which 定位不到。',
      },
      {
        rule: 'P06',
        glob: 'packages/shared/scripts/check-state.mjs',
        reason: '这条正则就是「禁 node:child_process」的判据本体；文件本身没有起进程。',
      },
    ],
  },
};
