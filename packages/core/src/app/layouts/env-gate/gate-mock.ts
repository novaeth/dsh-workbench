import styles from './BootGate.module.css';
import type { PreflightBridgeIssue, PreflightGuidance, PreflightSnapshot } from '@dsh-workbench/shared/host';

const INSTALL_COMMAND = "npm i --prefix '/Users/you/.dsh/workbench/opencli/toolchain' @jackwener/opencli@1.8.8";

export interface GateMockExpect {
  readonly hint: 'checking' | 'installing' | 'failed' | 'hold';
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
  '[OK] Daemon: running on port 19825 (v1.8.8)',
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
  '[OK] Daemon: running on port 19825 (v1.8.8)',
  '[MISSING] Extension: not connected',
  '[FAIL] Connectivity: failed (profile-required)',
  '',
  'Issues:',
  '  • Multiple Chrome profiles are connected to the daemon, but no default profile was selected.',
  '  Run opencli profile list, then opencli profile use <name>, or pass --profile <name>.',
].join('\n');

const AT = 1790574156506;

function mock(
  id: string,
  label: string,
  note: string,
  snapshot: Omit<PreflightSnapshot, 'at'>,
  expect: GateMockExpect,
): GateMock {
  return { id, label, note, snapshot: { ...snapshot, at: AT }, expect };
}

const BRIDGE_PENDING = { id: 'bridge', status: 'pending' } as const;

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
      steps: [{ id: 'cli', status: 'running', action: 'opencli --version' }, BRIDGE_PENDING],
    },
    { hint: 'checking', command: false },
  ),
  mock(
    'installing',
    '安装中（npm 在跑）',
    '缺 opencli：正在装。右边会**数秒**（静止的圆点看不出在干活）。',
    {
      phase: 'installing',
      steps: [{ id: 'cli', status: 'running', action: INSTALL_COMMAND, command: INSTALL_COMMAND }, BRIDGE_PENDING],
    },
    { hint: 'installing', command: false },
  ),
  mock(
    'ready',
    '都就绪（真机到这就放行）',
    '两步都过。这一帧之后 gate 立刻撤掉 —— 钉住它只是为了看一眼这两行长什么样。',
    {
      phase: 'ready',
      steps: [
        { id: 'cli', status: 'ok', detail: '1.8.8' },
        { id: 'bridge', status: 'ok', detail: 'Everything looks good!' },
      ],
    },
    { hint: 'checking', command: false },
  ),
  mock(
    'warn-extension',
    '浏览器通道：扩展没连上',
    'daemon 在跑、扩展没连上（最常见）：门**停在这一帧** —— 行尾说"没连上"，下面给「去应用商店装扩展」+ `daemon restart`（原文折叠当证据）+ 一颗「打开浏览器」（Desktop 才有）+ 一颗「先进入工作台」。',
    {
      phase: 'ready',
      steps: [
        { id: 'cli', status: 'ok', detail: '1.8.8' },
        { id: 'bridge', status: 'warn', detail: EXTENSION_REPORT },
      ],
      bridgeIssues: ['extension'],
      canWakeBrowser: true,
    },
    { hint: 'hold', command: false, bridgeIssues: ['extension'] },
  ),
  mock(
    'warn-daemon',
    '浏览器通道：服务没起来',
    'daemon 没起来（扩展跟着也连不上）：两条人话都摆出来，命令给 `daemon restart`。',
    {
      phase: 'ready',
      steps: [
        { id: 'cli', status: 'ok', detail: '1.8.8' },
        { id: 'bridge', status: 'warn', detail: DAEMON_REPORT, command: 'opencli daemon restart' },
      ],
      bridgeIssues: ['daemon', 'extension'],
    },
    { hint: 'hold', command: false, bridgeIssues: ['daemon', 'extension'] },
  ),
  mock(
    'warn-profile',
    '浏览器通道：没选默认 profile',
    '连了多个浏览器 profile 但没选默认：只说"选哪个"（重启服务解决不了它），命令给 `profile list`。',
    {
      phase: 'ready',
      steps: [
        { id: 'cli', status: 'ok', detail: '1.8.8' },
        { id: 'bridge', status: 'warn', detail: PROFILE_REPORT, command: 'opencli profile list' },
      ],
      bridgeIssues: ['profile'],
    },
    { hint: 'hold', command: false, bridgeIssues: ['profile'] },
  ),
  mock(
    'warn-diy',
    'DIY 模式：挂不起来',
    'dsh 太旧（比这份外壳验过的那一代旧）：preset 里几行 dsh 根本没有 ⇒ 那一行挂不起来，而 dsh 的模式选择器只列挂得起来的。门**停在这一帧**：行尾说"挂不起来"，下面说清"缺哪几行" + 升级命令 + 一颗「先进入工作台」。',
    {
      phase: 'ready',
      steps: [
        { id: 'cli', status: 'ok', detail: '1.8.8' },
        { id: 'bridge', status: 'ok', detail: 'Everything looks good!' },
        {
          id: 'diy',
          status: 'warn',
          detail: 'tool-schedule (@deepseek-ai/dsh-tool-schedule): never started',
          command: 'npm i -g @deepseek-ai/dsh@latest',
        },
      ],
      diyGap: {
        rows: ['tool-schedule'],
        detail: 'tool-schedule (@deepseek-ai/dsh-tool-schedule): never started',
        command: 'npm i -g @deepseek-ai/dsh@latest',
      },
    },
    { hint: 'hold', command: false },
  ),
  mock(
    'failed-permission',
    '装不上：权限不足',
    '失败态：为什么需要它 → 确切命令（可复制）→ 照做能解决的一句人话（EACCES → 换目录 / sudo）。',
    {
      phase: 'failed',
      steps: [{ id: 'cli', status: 'failed', detail: 'npm ERR! code EACCES', command: INSTALL_COMMAND }, BRIDGE_PENDING],
      error: 'npm ERR! code EACCES\nnpm ERR! syscall mkdir\nnpm ERR! path /usr/local/lib/node_modules',
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
      steps: [{ id: 'cli', status: 'failed', detail: 'npm ERR! code EAI_AGAIN', command: INSTALL_COMMAND }, BRIDGE_PENDING],
      error: 'npm ERR! code EAI_AGAIN\nnpm ERR! network request to https://registry.npmjs.org failed',
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
