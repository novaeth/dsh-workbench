import type { NeedState, UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { MarketMock } from './market-mock-types';

type ProbePatch = Partial<CapabilityMap[string]> & { readonly provision?: NeedState['provision'] };

export function failureCardMocks(input: {
  readonly id: string;
  readonly mine: UnitManifest;
  readonly probe: (unit: string, status: string, extra?: ProbePatch) => CapabilityMap;
}): readonly MarketMock[] {
  const { id, mine, probe } = input;
  return [
    {
      id: 'install-denied',
      label: '装依赖失败：目录是 root 的',
      manifests: [mine],
      capabilities: probe(id, 'missing', { provision: 'ready' }),
      failure: {
        id,
        message: '没成功：没有写入权限（退出码 255）',
        failure: {
          kind: 'permission',
          command:
            'npm i --prefix /Users/you/.dsh/workbench/opencli/libs opencli-workflow@1.1.24 --cache /Users/you/.dsh/workbench/opencli/npm-cache',
          exitCode: 255,
          output: [
            'npm error code EACCES',
            'npm error syscall mkdir',
            'npm error path /Users/you/.dsh/workbench/opencli/libs',
            'npm error errno -13',
            'npm error Error: EACCES: permission denied, mkdir',
            "npm error     at async mkdir (node:internal/fs/promises:930:10)",
            'npm error     at async Arborist.reify (npm/node_modules/@npmcli/arborist/lib/arborist/reify.js:307:5)',
            'npm error     at async Install.exec (npm/node_modules/@npmcli/arborist/lib/arborist/build-ideal-tree.js:553:7)',
            'npm error     at async module.exports (npm/node_modules/npm/lib/cli/install.js:74:5)',
            'npm error     at async module.exports (npm/node_modules/npm/lib/cli/entry.js:94:5)',
            'npm error     at async module.exports (npm/node_modules/npm/lib/cli.js:46:5)',
            'npm error',
            'npm error The operation was rejected by your operating system.',
            'npm error It is likely you do not have the permissions to access this file as the current user',
            'npm error Log files were not written due to an error writing to the directory:',
            'npm error   /Users/you/.dsh/workbench/opencli/npm-cache/_logs',
          ].join('\n'),
          path: '/Users/you/.dsh/workbench/opencli/libs',
          mode: '755',
          owner: { uid: 0, gid: 0 },
          current: { uid: 502, gid: 20 },
          fix: {
            kind: 'chown',
            path: '/Users/you/.dsh/workbench/opencli/libs',
            uid: 502,
            gid: 20,
          },
        },
      },
      expect: { rows: 1, state: 'missing', actions: ['install'] },
    },
    {
      id: 'install-mode',
      label: '装依赖失败：只是没写位',
      manifests: [mine],
      capabilities: probe(id, 'missing', { provision: 'ready' }),
      failure: {
        id,
        message: '没成功：没有写入权限（退出码 1）',
        failure: {
          kind: 'permission',
          command:
            'npm i --prefix /Users/you/.dsh/workbench/opencli/libs opencli-workflow@1.1.24 --cache /Users/you/.dsh/workbench/opencli/npm-cache',
          exitCode: 1,
          output: 'npm error code EACCES\nnpm error path /Users/you/.dsh/workbench/opencli/libs\nnpm error errno -13',
          path: '/Users/you/.dsh/workbench/opencli/libs',
          mode: '555',
          owner: { uid: 502, gid: 20 },
          current: { uid: 502, gid: 20 },
          fix: { kind: 'chmod', path: '/Users/you/.dsh/workbench/opencli/libs' },
        },
      },
      expect: { rows: 1, state: 'missing', actions: ['install'] },
    },
    {
      id: 'install-sandbox',
      label: '装依赖失败：被沙箱拦住（交给 agent）',
      manifests: [mine],
      capabilities: probe(id, 'missing', { provision: 'ready' }),
      failure: {
        id,
        message: '没成功：被系统拦住了（退出码 255）',
        failure: {
          kind: 'sandbox',
          command:
            'npm i --prefix /Users/you/.dsh/workbench/opencli/libs opencli-workflow@1.1.24 --cache /Users/you/.dsh/workbench/opencli/npm-cache',
          exitCode: 255,
          output:
            'npm error code EPERM\nnpm error syscall open\nnpm error path /Users/you/.dsh/workbench/opencli/npm-cache/_cacache/tmp/9d1f\nnpm error errno -1',
          path: '/Users/you/.dsh/workbench/opencli/npm-cache',
          mode: '755',
          owner: { uid: 502, gid: 20 },
          current: { uid: 502, gid: 20 },
          fix: { kind: 'handoff' },
        },
      },
      expect: { rows: 1, state: 'missing', actions: ['install'], askAgent: false },
    },
  ];
}

export function binInstallMocks(input: {
  readonly id: string;
  readonly mine: UnitManifest;
}): readonly MarketMock[] {
  const { id, mine } = input;
  return [
    {
      id: 'bin-install',
      label: '缺一条命令，但模块给了装法',
      manifests: [
        {
          ...mine,
          needs: [
            {
              kind: 'bin',
              name: 'gitops',
              purpose: '在机器上跑平台命令',
              install: { kind: 'command', line: 'brew install pagoda/tap/gitops', platforms: ['darwin'] },
            },
          ],
        },
      ],
      capabilities: {
        [id]: {
          unit: id,
          status: 'missing',
          detail: '夹具',
          needs: [
            {
              id: 'bin:gitops',
              kind: 'bin',
              name: 'gitops',
              status: 'missing',
              detail: '这台机器上找不到 gitops 命令（PATH 里没有）',
              provision: 'ready',
              command: 'brew install pagoda/tap/gitops',
            },
          ],
        },
      },
      expect: { rows: 1, state: 'missing', actions: ['install'], askAgent: false },
    },
    {
      id: 'bin-no-install',
      label: '缺一条命令，模块没给装法',
      manifests: [
        {
          ...mine,
          needs: [{ kind: 'bin', name: 'gitops', purpose: '在机器上跑平台命令' }],
        },
      ],
      capabilities: {
        [id]: {
          unit: id,
          status: 'missing',
          detail: '夹具',
          needs: [
            {
              id: 'bin:gitops',
              kind: 'bin',
              name: 'gitops',
              status: 'missing',
              detail: '这台机器上找不到 gitops 命令（PATH 里没有）',
            },
          ],
        },
      },
      expect: { rows: 1, state: 'missing', actions: [], askAgent: true },
    },
  ];
}
