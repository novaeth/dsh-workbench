import styles from './BootGate.module.css';
import type {
  PreflightBridgeIssue,
  PreflightDiyGap,
  PreflightGuidance,
  PreflightSnapshot,
  PreflightStep,
} from '@dsh-workbench/shared/host';

const CLI_VERSION = '2.0.3';

function cliOkStep(): PreflightStep {
  return {
    id: 'cli',
    status: 'ok' as const,
    detail: CLI_VERSION,
    log: ["> 'opencli' --version", CLI_VERSION],
  };
}

const BRIDGE_OK_LOG = ['> opencli doctor', 'Everything looks good!'];

function bridgeOkStep(): PreflightStep {
  return { id: 'bridge', status: 'ok', detail: 'Everything looks good!', log: [...BRIDGE_OK_LOG] };
}

function diyWarnStep(detail: string, command?: string): PreflightStep {
  return { id: 'diy', status: 'warn', detail, ...(command === undefined ? {} : { command }) };
}

const INSTALL_COMMAND = "pnpm add --dir '/Users/you/.dsh/workbench/opencli/toolchain' @jackwener/opencli@2.0.3 --store-dir '/Users/you/.dsh/workbench/opencli/pnpm-store' --allow-build=@jackwener/opencli --save-exact --config.update-notifier=false";

export interface GateMockExpect {
  readonly hint: 'checking' | 'installing' | 'installingToolchain' | 'failed' | 'hold';
  readonly guidance?: PreflightGuidance;
  readonly command: boolean;
  readonly bridgeIssues?: readonly PreflightBridgeIssue[];
}
export interface GateMock {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly snapshot: PreflightSnapshot;
  readonly expect: GateMockExpect;
}

const EXTENSION_REPORT = [
  '[OK] Daemon: running on port 19825 (v2.0.3)',
  '[MISSING] Extension: not connected',
  '[OK] Connectivity: connected in 0.0s',
  '',
  'Issues:',
  '  • Daemon is running but the Chrome/Chromium extension is not connected.',
  'If the extension is already installed, try: opencli daemon restart',
  'If the extension is not installed:',
  '  1. Download from https://github.com/jackwener/opencli/releases',
  '  2. Open chrome://extensions/ → Enable Developer Mode',
  '  3. Click "Load unpacked" → select the extension folder',
].join('\n');

const DAEMON_REPORT = [
  '[MISSING] Daemon: not running',
  '[MISSING] Extension: not connected',
  '[FAIL] Connectivity: failed (daemon not reachable)',
  '',
  'Issues:',
  '  • Daemon is not running. It should start automatically when you run an opencli browser command.',
  '  • Daemon is running but the Chrome/Chromium extension is not connected.',
  'If the extension is already installed, try: opencli daemon restart',
].join('\n');

const PROFILE_REPORT = [
  '[OK] Daemon: running on port 19825 (v2.0.3)',
  '[MISSING] Extension: not connected',
  '[FAIL] Connectivity: failed (profile-required)',
  '',
  'Issues:',
  '  • Multiple Chrome profiles are connected to the daemon, but no default profile was selected.',
  '  Run opencli profile list, then opencli profile use <name>, or pass --profile <name>.',
].join('\n');

const AT = 1790574156506;

const MOCK_PATHS = {
  workbenchRoot: '/Users/you/.dsh/workbench',
  dshHome: '/Users/you/.dsh',
} as const;

function mock(
  id: string,
  label: string,
  note: string,
  snapshot: Omit<PreflightSnapshot, 'at'>,
  expect: GateMockExpect,
): GateMock {
  const paths = snapshot.phase === 'ready' && snapshot.paths === undefined ? { paths: MOCK_PATHS } : {};
  return { id, label, note, snapshot: { ...snapshot, ...paths, at: AT }, expect };
}

const BRIDGE_PENDING = { id: 'bridge', status: 'pending' } as const;

type SnapshotBody = Omit<PreflightSnapshot, 'at'>;

function readySnapshot(steps: readonly PreflightStep[], extra: Partial<SnapshotBody> = {}): SnapshotBody {
  return { phase: 'ready', steps, ...extra };
}

function bridgeWarnStep(detail: string, command?: string): PreflightStep {
  return { ...(command === undefined ? {} : { command }), id: 'bridge', status: 'warn', detail };
}

function diySnapshot(step: PreflightStep, gap: PreflightDiyGap): SnapshotBody {
  return readySnapshot([cliOkStep(), bridgeOkStep(), step], { diyGap: gap });
}

const DIY_DETAIL = 'tool-schedule (@deepseek-ai/dsh-tool-schedule): never started';

function extensionSnapshot(extra: Partial<SnapshotBody> = {}): SnapshotBody {
  return readySnapshot([cliOkStep(), bridgeWarnStep(EXTENSION_REPORT)], {
    bridgeIssues: ['extension'],
    canWakeBrowser: true,
    ...extra,
  });
}

export const GATE_MOCKS: readonly GateMock[] = [
  mock(
    'boot',
    '刚立起来',
    '还没拿到体检结果的那一帧：只有标题 + 一句"正在检测运行环境…"，一行步骤都还没有。',
    { phase: 'idle', steps: [] },
    { hint: 'checking', command: false },
  ),
  mock(
    'checking',
    '检测中',
    '第一步在跑（转圈 + 它正在执行的命令），第二步还没轮到（短横）。',
    {
      phase: 'checking',
      steps: [{ id: 'cli', status: 'running', action: '检查 opencli 版本', log: ["> 'opencli' --version", '2.0.3'] }, BRIDGE_PENDING],
      log: ["> 'opencli' --version", '2.0.3'],
    },
    { hint: 'checking', command: false },
  ),
  mock(
    'installing',
    '安装中（pnpm 在跑）',
    '缺命令行：正在装。行内日志会一直长出来（静止的圆点看不出在干活）。',
    {
      phase: 'installing',
      steps: [{ id: 'cli', status: 'running', action: '安装 opencli', command: INSTALL_COMMAND, log: ['> 安装 opencli', '+ @jackwener/opencli 2.0.3'] }, BRIDGE_PENDING],
      log: ['> 安装 opencli', '+ @jackwener/opencli 2.0.3'],
    },
    { hint: 'installing', command: false },
  ),
  mock(
    'toolchain-installing',
    '运行环境在装',
    'Desktop 上 pnpm 低于 10 时，这一行会自己装本地 pnpm：顶上那句换成"在装 pnpm"，行内日志照旧长出来 —— 几分钟的下载不该看起来像卡死。',
    {
      phase: 'installing',
      steps: [
        { id: 'toolchain', status: 'running', action: '装本地 pnpm@10.32.1', log: ['> 安装本地 pnpm', '+ pnpm 10.32.1'] },
        { id: 'cli', status: 'pending' },
        BRIDGE_PENDING,
      ],
      log: ['> 安装本地 pnpm', '+ pnpm 10.32.1'],
    },
    { hint: 'installingToolchain', command: false },
  ),
  mock(
    'ready',
    '都就绪（真机到这就放行）',
    '两步都过。这一帧之后 gate 立刻撤掉 —— 钉住它只是为了看一眼这两行长什么样。',
    readySnapshot([cliOkStep(), bridgeOkStep()]),
    { hint: 'checking', command: false },
  ),
  mock(
    'warn-extension',
    '浏览器通道：扩展没连上',
    'daemon 在跑、扩展没连上（最常见）：门**停在这一帧** —— 行尾说"没连上"，装法前面挂一句"扩展已安装的话，点击下面的重试"，装法只作为未安装时的路。下面两种装法：① 工作台自带的扩展副本（目录可直接复制）；② 去应用商店安装。末尾一句「做完后回来点击重试」，再往下是「打开浏览器」（Desktop 才有）+「先进入工作台」。',
    extensionSnapshot({ extensionDir: '/Users/you/.dsh/workbench/opencli/extension' }),
    { hint: 'hold', command: false, bridgeIssues: ['extension'] },
  ),
  mock(
    'warn-extension-offline',
    '浏览器通道：没有本地副本可指',
    '扩展没连上、这台机器上又没有随包带的副本：不给「加载本地副本」这条（没得选），只剩应用商店一条路；「已安装就点重试」那句照旧挂着。',
    extensionSnapshot(),
    { hint: 'hold', command: false, bridgeIssues: ['extension'] },
  ),
  mock(
    'warn-bridge-incompatible',
    '浏览器通道：扩展版本不兼容',
    '扩展连上了但版本对不上：三步（打开扩展页 → 重新加载或更新 → 确认版本），不再教怎么装。',
    extensionSnapshot({ bridgeIssues: ['extension-incompatible'], extensionTarget: '3.1.0' }),
    { hint: 'hold', command: false, bridgeIssues: ['extension-incompatible'] },
  ),
  mock(
    'warn-daemon',
    '浏览器通道：服务没起来',
    'daemon 没起来（扩展跟着也连不上）：两条人话都摆出来，命令给 `daemon restart`。',
    readySnapshot([cliOkStep(), bridgeWarnStep(DAEMON_REPORT, 'opencli daemon restart')], {
      bridgeIssues: ['daemon', 'extension'],
    }),
    { hint: 'hold', command: false, bridgeIssues: ['daemon', 'extension'] },
  ),
  mock(
    'warn-profile',
    '浏览器通道：没选默认 profile',
    '连了多个浏览器 profile 但没选默认：只说"选哪个"（重启服务解决不了它），命令给 `profile list`。',
    readySnapshot([cliOkStep(), bridgeWarnStep(PROFILE_REPORT, 'opencli profile list')], {
      bridgeIssues: ['profile'],
    }),
    { hint: 'hold', command: false, bridgeIssues: ['profile'] },
  ),
  mock(
    'warn-host',
    'dsh 升到了没验过的一代',
    '运行中的 dsh 比这份工作台验过的那一代新（跨代）。门停在这一帧：行尾说「未验证」，下面说清是哪一版、验的是哪一版，并给「先进入工作台」；再往下是打不开时的恢复步骤（界面句 + 一行原样的键路径）。',
    readySnapshot(
      [
        cliOkStep(),
        {
          id: 'host',
          status: 'warn',
          detail: '0.3.0-rc.1',
          log: [
            'profile: /Users/you/.dsh/profiles/workbench',
            'dsh: 0.3.0-rc.1',
            'from: /Users/you/.dsh/profiles/workbench/node_modules/@deepseek-ai/dsh/package.json',
          ],
        },
        bridgeOkStep(),
      ],
      { hostGap: { tier: 'newer', runtime: '0.3.0-rc.1', verified: '0.2.3-alpha.2' } },
    ),
    { hint: 'hold', command: false },
  ),
  mock(
    'warn-host-older',
    'dsh 比验证过的版本旧',
    '运行中的 dsh 低于这份工作台验过的那一代：卡上给升级步骤（网页版带命令）+ 一条「一直打不开时」的退路。',
    readySnapshot(
      [
        cliOkStep(),
        { id: 'host', status: 'warn', detail: '0.2.1', log: ['profile: /Users/you/.dsh/profiles/workbench', 'dsh: 0.2.1'] },
        bridgeOkStep(),
      ],
      { hostGap: { tier: 'older', runtime: '0.2.1', verified: '0.2.3-alpha.2', command: 'npm i -g @deepseek-ai/dsh@latest' } },
    ),
    { hint: 'hold', command: false },
  ),
  mock(
    'warn-diy',
    'DIY 模式：版本过低',
    'dsh 比这份工作台验过的那一代旧（版本事实可证）：卡片给出版本、验证过的版本与升级命令，桌面版不显示命令。门**停在这一帧**。',
    diySnapshot(diyWarnStep(DIY_DETAIL, 'npm i -g @deepseek-ai/dsh@latest'), {
      kind: 'older-dsh',
      rows: ['tool-schedule'],
      detail: DIY_DETAIL,
      command: 'npm i -g @deepseek-ai/dsh@latest',
    }),
    { hint: 'hold', command: false },
  ),
  mock(
    'warn-diy-broken',
    'DIY 模式：几行没有启动',
    '版本不是原因（dsh 没升级也能出现）：某几行插件没导入成功，真正报错只在 dsh 启动日志里。卡片不再断言原因、不给命令，只陈述「哪几行没有启动」+ 复制给 agent。',
    diySnapshot(diyWarnStep(DIY_DETAIL), { kind: 'broken-row', rows: ['tool-schedule'], detail: DIY_DETAIL }),
    { hint: 'hold', command: false },
  ),
  mock(
    'warn-diy-preset-missing',
    'DIY 模式：模式列表里没有',
    '启动检查没在 dsh 的模式列表里找到「工作台 DIY 模式」：兜底卡，只陈述事实 +「复制给 agent」，不给命令。',
    diySnapshot(diyWarnStep('工作台 DIY 模式：未找到'), { kind: 'preset-missing', rows: [], detail: 'preset missing' }),
    { hint: 'hold', command: false },
  ),
  mock(
    'warn-bridge-unknown',
    '浏览器连接：认不出问题',
    'doctor 报了问题但认不出是哪一类：卡片陈述事实并给「复制给 agent」，不再让人自己展开原文猜。',
    readySnapshot(
      [
        cliOkStep(),
        {
          id: 'bridge',
          status: 'warn',
          detail: 'Something unexpected happened while probing the browser',
          log: ['> opencli doctor', 'Something unexpected happened while probing the browser'],
        },
      ],
      { bridgeIssues: ['unknown'] },
    ),
    { hint: 'hold', command: false, bridgeIssues: ['unknown'] },
  ),
  mock(
    'failed-permission',
    '装不上：权限不足',
    '失败态：为什么需要它 → 确切命令（可复制）→ 照做能解决的一句人话（EACCES → 换目录 / sudo）。',
    {
      phase: 'failed',
      steps: [{ id: 'cli', status: 'failed', detail: 'ERR_PNPM_EACCES: permission denied', command: INSTALL_COMMAND }, BRIDGE_PENDING],
      error:
        "ERR_PNPM_EACCES: EACCES: permission denied, mkdir '/Users/you/.dsh/workbench/opencli/toolchain'",
      failure: 'permission',
      guidance: 'install',
    },
    { hint: 'failed', guidance: 'install', command: true },
  ),
  mock(
    'failed-network',
    '装不上：网络不通',
    '同一档失败，但人话换成"查代理"那条（EAI_AGAIN / ENOTFOUND）。',
    {
      phase: 'failed',
      steps: [{ id: 'cli', status: 'failed', detail: 'ERR_PNPM_META_FETCH_FAIL: EAI_AGAIN', command: INSTALL_COMMAND }, BRIDGE_PENDING],
      error:
        'ERR_PNPM_META_FETCH_FAIL: GET https://registry.npmjs.org/@jackwener%2Fopencli: request failed, reason: getaddrinfo EAI_AGAIN',
      failure: 'network',
      guidance: 'install',
    },
    { hint: 'failed', guidance: 'install', command: true },
  ),
  mock(
    'failed-unknown',
    '装不上：认不出的错',
    '认不出失败种类时**不编**建议：只给命令与原文（多一句假建议比少一句更糟）。',
    {
      phase: 'failed',
      steps: [{ id: 'cli', status: 'failed', detail: 'something went wrong', command: INSTALL_COMMAND }, BRIDGE_PENDING],
      error: 'something went wrong',
      failure: 'unknown',
      guidance: 'install',
    },
    { hint: 'failed', guidance: 'install', command: true },
  ),
  mock(
    'failed-path',
    '装了但还找不到',
    '装完了 `--version` 还是不行：**不再让用户装一遍**（PATH / 新终端的事），所以不给命令。',
    {
      phase: 'failed',
      steps: [{ id: 'cli', status: 'failed', detail: 'zsh: command not found: opencli', command: INSTALL_COMMAND }, BRIDGE_PENDING],
      error: 'zsh: command not found: opencli',
      failure: 'missing',
      guidance: 'path',
    },
    { hint: 'failed', guidance: 'path', command: false },
  ),
  mock(
    'failed-shell',
    '执行缝坏了',
    '连 shell 都调不动：装也不可能成功。没有"正在执行的动作"、也没有命令 —— 该做的是重启宿主。',
    {
      phase: 'failed',
      steps: [{ id: 'cli', status: 'failed', detail: 'Error: spawn /bin/sh ENOENT' }, BRIDGE_PENDING],
      error: 'Error: spawn /bin/sh ENOENT',
      failure: 'unknown',
      guidance: 'shell',
    },
    { hint: 'failed', guidance: 'shell', command: false },
  ),
  mock(
    'failed-host',
    '命令没有返回',
    '命令发出去了、结果没回来（沙箱子进程起不来）：给的是"退干净、清残留、再打开"，不是让人重装 Node / npm。',
    {
      phase: 'failed',
      steps: [
        {
          id: 'toolchain',
          status: 'failed',
          detail: '版本探测没有返回：node / npm / pnpm 的命令都没把结果交回来（不是没装）',
        },
        BRIDGE_PENDING,
      ],
      error: '版本探测没有返回：node / npm / pnpm 的命令都没把结果交回来（不是没装）',
      failure: 'host',
      guidance: 'host',
    },
    { hint: 'failed', guidance: 'host', command: false },
  ),
];

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountGateMockStrip(options: { onPick: (snapshot: PreflightSnapshot | null) => void }): HTMLElement {
  const strip = el('div', `wb-mockStrip ${styles.mockSlot}`);
  const note = el('span', 'wb-mockNote');
  const chips: HTMLButtonElement[] = [];

  const paint = (active: GateMock | null): void => {
    note.textContent = `夹具：钉住启动页的状态，不轮询、不放行 —— ${active?.note ?? '不接管：按真机走（就绪就放行）。'}`;
    chips.forEach((chip) => {
      chip.className = `wb-mockChip${chip.dataset.mock === active?.id ? ' wb-mockChipOn' : ''}`;
    });
  };

  const pick = (active: GateMock | null): void => {
    paint(active);
    options.onPick(active === null ? null : active.snapshot);
  };

  const real = el('button', 'wb-mockChip', '真实') as HTMLButtonElement;
  real.setAttribute('type', 'button');
  real.dataset.mock = '';
  real.addEventListener('click', () => pick(null));

  strip.append(note, real);
  chips.push(real);

  for (const item of GATE_MOCKS) {
    const chip = el('button', 'wb-mockChip', item.label) as HTMLButtonElement;
    chip.setAttribute('type', 'button');
    chip.dataset.mock = item.id;
    chip.addEventListener('click', () => pick(item));
    strip.append(chip);
    chips.push(chip);
  }

  pick(GATE_MOCKS[0] ?? null);
  return strip;
}
