import { deps, hygiene, library } from '@arch-guard/core/presets';
import { testsLiveInFolders } from './rules/tests-in-folders.mjs';

export const STACK_CAPABILITIES = {
  'cli-args': 'commander',
  'unique-id': 'crypto.randomUUID',
  'number-format': 'Intl.NumberFormat',
  'deep-equal': 'node:util.isDeepStrictEqual',
  datetime: 'dayjs',
  'deep-clone': 'structuredClone',
  'query-string': 'URLSearchParams',
  validation: 'zod',
  semver: {
    preferred: 'semver',
    syntax: [
      '\\^\\\\d\\+\\\\\\.\\\\d\\+\\\\\\.\\\\d\\+',
      "\\.split\\(\\s*['\"]\\.['\"]\\s*\\)\\.map\\(.*(?:parseInt|Number)",
    ],
    softSyntax: ["\\.split\\(\\s*['\"]\\.['\"]\\s*\\)"],
    apiNames: [
      'compareVersions',
      'compareSemver',
      'parseVersion',
      'isNewerVersion',
      'isStableVersion',
      'isPrereleaseVersion',
    ],
    hint: '用 semver：semver.valid / semver.gt / semver.satisfies / semver.prerelease —— 别手写版本号解析与比较',
  },
  'process-spawn': {
    preferred: 'execa',
    syntax: ['from\\s+[\'"]node:child_process[\'"]'],
    hint: '自己起进程用 execa；同步 / 跨平台差异交给它。',
  },
  'cli-locate': {
    preferred: 'which',
    syntax: ['\\bprocess\\.env\\.(?:PATH|PATHEXT)\\b'],
    hint: '自己扫 PATH / PATHEXT 用 which（它处理 PATHEXT 与大小写）。',
  },
  'file-lock': {
    preferred: 'proper-lockfile',
    syntax: ['\\bprocess\\.kill\\([^)]*,\\s*0\\)', 'flag:\\s*[\'"]wx[\'"]'],
    hint: '自己抢文件锁用 proper-lockfile（stale / 重试 / 跨平台）。',
  },
  'atomic-state': {
    preferred: 'write-file-atomic',
    syntax: ['writeFileSync\\([^)]*\\.(?:sync\\.json|self-update\\.json)'],
    hint: '自己直写状态文件用 write-file-atomic（防写一半）。',
  },
};

export function stackArch(options = {}) {
  const {
    src = 'src',
    entry = ['index.ts'],
    modules = {},
    presets = [],
    roles = [],
    exceptions = [],
    overrides = {},
    sourceForm = 'typescript',
  } = options;

  return {
    sourceForm,
    presets: [
      library({ src, entry, modules }),
      deps({
        capabilities: STACK_CAPABILITIES,
        fingerprints: [{ capability: 'query-string', allowOwn: false }],
      }),
      hygiene(),
      ...presets,
    ],
    overrides: {
      include: [`${src}/**`],
      addRoles: [
        { id: 'lib:tests-dir', pattern: `${src}/**/__tests__/**`, layer: 99, exclusive: true },
        ...roles,
      ],
      exceptions: [...exceptions],
      customRules: [testsLiveInFolders],
      ...overrides,
    },
  };
}
