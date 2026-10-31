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
        glob: 'packages/shared/scripts/check-state.mjs',
        reason: '这条正则就是「禁 node:child_process」的判据本体；文件本身没有起进程。',
      },
    ],
  },
};
