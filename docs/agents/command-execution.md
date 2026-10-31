# 命令执行方式的选择

起子进程只有一条默认路：**执行缝**（`runShell`）。不走它的是四问命中的四类**出缝**例外，外加一类特意不塞的**一级命令**（`execa` 直传 argv）。写任何起进程的代码之前，先按「四问」归类；归不出类，就是该走执行缝。

## 默认：执行缝

`ctx.get<DshShell>('shell')` 拿到 shell 服务，再调 `runShell(shell, 命令行, 选项)`（[shell.ts](../../packages/shared/src/host/shell.ts)）。直接 `resolve` / `execute` 只发生在 `shell.ts` 里。模块要用 shell，就在 manifest 的 `host.optional` 里登记；可选消费方处理拿到 `undefined` 的情况。

平台差异（OS、Desktop/Electron、shell 种类）走 [`platform.ts`](../../packages/adapter-probe/src/platform.ts)（`hostSurface` / `currentShellKind`）；业务代码读的是能力，不是 `process.platform`。

`runShell` 返回 `ShellResult`：`exitCode` / `timedOut` / `aborted` / `stdout` / `stderr` / `truncated` / `stalled`。非零退出、超时、中止都是**结果**；只有起不来（`spawn ENOENT` 之类）才抛。

命令从这儿跑，同时拿到这几样：

| 拿到什么 | 预算与事实 |
|---|---|
| 文件沙箱 | 带会话的调用由调用方把该会话的 policy 塞进请求；直接调用（插件、无会话）回落到部署策略的 mode 与 `workspaceRoot` |
| 超时 | 调用方给；不传时 `runShell` 缺省 10s。执行器对单次调用设上限（默认 600s），安装/打包类传 300s，在限内 |
| 输出 | stdout 请求上限 8MB；stderr 每流 64KB 内存、溢出落 spill 文件，读到的都是尾部 |
| 环境 | `env` 叠加在宿主环境上；凭据先被清、`DSH_*` 先被剥，所以 `DSH_HOME` 这类值自己钉进 `env` |
| 兜底 | 宿主没把结果交回来时标 `stalled`，不重试、不静默 |

两个边界：

- 进程归 composition，teardown 时会被停止并 join；要活过宿主进程就不能走这儿。
- 后台语义在缝里（`onExpiry: 'none'` 加执行句柄），而 `runShell` 只封装了前台那一半。需要后台时扩这个封装。

## 四问：什么时候出缝

按顺序问，命中即停。

1. **要活过 dsh 进程，或者是产品自举？** 工坊 seed、自更新 → 裸 spawn 加 `detached`，输出落日志文件（[runtime-seed.ts](../../packages/adapter-probe/src/runtime-seed.ts)、[self-update.ts](../../packages/adapter-probe/src/self-update.ts)）；首次装 opencli / 本地 pnpm 这类 provisioning → `runBootstrapCommand`（[bootstrap-run.ts](../../packages/adapter-probe/src/bootstrap-run.ts)），HOME 与缓存钉在运行时根，用户的 npmrc 经 `NPM_CONFIG_USERCONFIG` 指向真家目录。自举不依赖可写根与部署 mode。
2. **要双向通道或 PTY？** 长期 stdin/stdout 的 MCP server → 自己的客户端（[mcp-client.ts](../../packages/adapters-chrome-mcp/src/mcp-client.ts)）；交互式终端用 dsh 的 `ctx.terminals`。
3. **写入点不在可写范围里？** 数据迁移、建 profile 写的是 `$DSH_HOME` / profile，不在工作台运行时的可写范围里 → 出缝调脚本（[market-follow-up.ts](../../packages/core/src/modules/panels/model/market-follow-up.ts)、[host-actions.ts](../../packages/adapter-profile/src/host-actions.ts)）。不是自举的写入，先补可写根（见「已知边界」）。
4. **其余全部** → 执行缝。

会落进第 4 问、但特意不走缝的一类：**纯 argv、只碰自己缓存、要独立于 dsh 宿主的一级命令**（市场索引的 git fetch、市场文档、git probe、署名预览）走 `runGitProcess`——argv 直传 git，配禁交互 env（[git-process.ts](../../packages/core/src/shared/api/host/git-process.ts)）。命令不进 shell 解析，也就不需要转义；自检反着守这条（[market-seam.mjs](../../packages/core/scripts/selfcheck/checks/market-seam.mjs)）。

## 脚本与自检

- `scripts/**`、`packages/*/{scripts,bin,arch}/**` 由根 [arch.config.mjs](../../arch.config.mjs) 管：能力表只认 `process-spawn → execa` 与 `cli-locate → which`，`node:child_process` 判红（[ARCHITECTURE.md](../../ARCHITECTURE.md) §3.4）。
- `**/selfcheck/**` 是检查基建档，仍可用 `execFileSync`。
- 模块包依赖 deny `shell-quote` / `shelljs` / `zx`（[arch.mjs:244](../../packages/module-tools/src/arch.mjs)）。

## 已知边界：无会话时的可写根

- 有会话：根是该会话**创建时**记下的 cwd，不是单次调用的 `workdir`。
- 无会话：根是部署策略的 `workspaceRoot`。dsh-base 出厂值 `process.cwd()`；工作台启动器把它 patch 到 `$DSH_WORKBENCH_HOME`。
- `workspace-write` 的可写范围 = 根 + `/tmp` + `os.tmpdir()`。HOME、各类缓存、`$DSH_HOME` 的其它分支都在范围外；`--store-dir` 也挡不住 pnpm 的 `cacheDir` / `stateDir`。
- 插件页装进别人的 profile 时没有启动器，那个 profile 要补 [profile/sandbox.patch.yml](../../packages/core/profile/sandbox.patch.yml) 那一行，**退出再启动**（在线写同值会撞重组竞态）。缺它时：首次装工具链不受影响（自举按四问第 1 条出缝），但取数、市场、DIY 这些仍走缝的命令，只要部署根盖不住运行时根就会被拒 —— 先把可写根补上。

## 新代码的落点与验收

1. 默认在调用点加 `runShell`，给足 `timeoutMs`；需要环境就显式传 `env`。
2. 要后台句柄 → 扩 `runShell` 或加同级 helper，仍然走缝。
3. 真要出缝：确认落在上面某个具名例外里。新增类别 = 改这份文档 + 加门禁 + 私有 ADR，落点放对应 adapter 包（自举在 `adapter-probe`，profile 在 `adapter-profile`，双向协议在 `adapters-chrome-mcp`）。
4. 验收：`pnpm run arch` 与 `pnpm --filter @dsh-workbench/core run selfcheck` 都过。

完成判据：这条命令能归到「默认」或某个具名例外，并且超时、输出、环境、可写根四件事都能指出依据。
