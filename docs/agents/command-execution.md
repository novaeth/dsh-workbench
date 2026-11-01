# 命令执行方式的选择

起子进程只有一条默认路：**执行缝**（`seam.run`）。它要一个**语义写入域**（调用点只说"我写哪一类树"），
策略、环境与拒绝处置由执行缝模块统一算。写任何起进程的代码之前先问三件事：**写哪**（intent）、
**要什么**（argv 还是 shell line）、**活多久**（这次调用 / 活过这次调用 / 双向流）——按答案选
`run` / `spawn` / `open`。只有「启动前的 launcher/seed 脚本」与「开发期工具链」不在宿主进程内，
其余都不许自己起进程。

依据：私有仓的 ADR-0085（写入域按调用点声明）与 `seam-permissions` spec；公开仓不链私有仓。

## 默认：执行缝

宿主侧从 `seamOf(ctx)` 拿执行缝（或由组合根注入 `seam: Seam`），按**要什么**选一个动词：

```ts
seam.run({ argv | command, intent, session?, workdir?, timeoutMs?, env?, retry?, bestEffort? }) // 前台、要结果
seam.spawn({ target, intent, lifetime: 'host', logFile, env?, cwd? })                           // 后台、活过这次调用
seam.open({ target, intent, env?, cwd? })                                                       // 双向流
```

- `target` 是 `{ argv: string[] }` 或 `{ command: string, shellKind?: 'posix' | 'pwsh' }`：
  argv 是一等公民；要 shell 语义才写 `command`。调用点不拼 `bash -c`、不写 `detached` / `stdio`。
- 三个动词共用 `intent`（写哪，见下表）。
- `spawn` 的 `logFile` 是调用方给的日志文件（自举 / 自更新的日志还在运行时根下）；
  「怎么 detached、fd 怎么接、什么时候 unref」由执行缝做。
- `open` 是长期双向流（MCP / PTY 类）；`write` / `onData` / `onExit` / `kill` 由执行缝给。

`intent` 必填，是语义写入域之一：

| intent | 写哪 | 谁负责根 |
|---|---|---|
| `{ kind: 'product' }` | 工作台自己的数据树（隔离运行时、缓存、工件、发布中间产物） | 产品域根 = 运行时根（`$DSH_WORKBENCH_HOME`，缺省 `$DSH_HOME/workbench`） |
| `{ kind: 'workspace' }` | 当前会话工作区 | 会话解析：per-session 模式 + 会话 cwd；必须带 `session` |
| `{ kind: 'paths', paths }` | 用户明确指定的外部目录 | 这些路径的公共目录；只给宿主调用点，且工具要在审批层声明过目标 |
| `{ kind: 'none' }` | 不预期写 | 产品域（读不受限；写入仍会被类型化拒绝） |
| `{ kind: 'host' }` | 宿主自己的数据（profile / 凭据 / 迁移 / 自更新） | 宿主进程直接执行（不经沙箱）；模块门面拿不到这一档 |

调用点可以只用 helper：`productWrite()` / `workspaceWrite()` / `pathsWrite(paths)` / `noWrite()`。

执行缝同时给你这几样，**不要自己再拼**：

| 拿到什么 | 事实 |
|---|---|
| 策略 | 部署上限（`DSH_PERMISSION_MODE`）与意图合成后的一次性 `{mode, workspaceRoot}`；会话只读只挡工作区，不挡产品域 |
| 环境 | 隔离 HOME、npm/pnpm 的 cache/logs/store/cache-dir/state-dir、opencli 配置目录、真实 npmrc/gitconfig 指针、`DSH_WORKBENCH_HOME`（显式 env，绕开 `DSH_*` 清洗） |
| 超时 / 输出 / 后台 | 仍走 `runShell` 的约定：调用方给超时（缺省 10s）；stdout 8MB 上限；stderr 尾部；后台语义要另外扩，不在 `run` 的前台那一半 |
| 拒绝 | `sandbox.denied` 会变成类型化结果：`retry:'safe'` 可安全重试一次（只给幂等/只读命令）；否则 `SeamError('sandbox-denied')` 带域与路径。`bestEffort: true` 才允许降级，且拒绝仍记进事实 |
| 事实 | `seam.facts()` 记每次调用（命令、域、策略、退出码、拒绝域/路径、是否自愈） |

## 还剩什么在缝外

只有两类，都**不在宿主进程内的调用点**：

1. **启动前的 launcher / seed 脚本**：dsh 还没起来，没有执行缝可谈（`bin/seed-workshop-windows.mjs`、
   `scripts/seed-profile.sh`、profile seed 之类）。
2. **开发期工具链**：`module-tools`、`scripts/**`、selfcheck —— 它们跑在开发机 / CI，不是工作台运行时。

另外两处「看起来在缝外、其实已经收进来」的：

- **自更新 / 自举**：起脚本那一跳是 `seam.spawn`（detached + 日志）；更新脚本**内容**是生成的独立脚本，
  它在自己进程里跑 npm/plugin，作为字符串产物留在适配器里。
- **一级 argv 命令**（市场索引 git fetch、迁移脚本、`setup`）：`seam.run({ argv, intent: { kind: 'host' } })`，
  仍然是执行缝；只是宿主域不经沙箱（它写的是宿主自己的数据/网络凭据）。

## 模块：窄门面

模块（三方/DIY）不拿宿主执行缝，只拿 `deps.seam`（`UnitSeam`）：

- `run({ command, scope: 'unit' | 'workspace' })`。`unit` = 模块专属目录
  （运行时根下 `units/<unit>/`，常开、无需审批）；`workspace` = 当前会话工作区，**必须在清单
  `dsh.workbench.host.writes` 里声明**，并带会话。
- 纯读或只碰自己目录的命令用 `unit`；要写用户项目才声明 `workspace`。
- 模块清单没声明 `writes` → 不给门面。模块数据目录卸载后保留，清空另走动作。
- 明确：模块宿主代码与宿主同进程，这层门面是**约定 + 门禁 + 归因**，不是进程隔离；
  安全边界仍是「装不装模块 + 审批」。

## 脚本与自检

- `scripts/**`、`packages/*/{scripts,bin,arch}/**` 由根 [arch.config.mjs](../../arch.config.mjs) 管：
  能力表只认 `process-spawn → execa` 与 `cli-locate → which`，`node:child_process` 判红（[ARCHITECTURE.md](../../ARCHITECTURE.md) §3.4）。
- `**/selfcheck/**` 是检查基建档，仍可用 `execFileSync`。
- `selfcheck` 的「执行缝」判据：`runShell` 只许出现在执行缝模块内部；每个 `seam.*` 调用必须带 intent；
  不许吞拒绝；产品数据根只许一套算法；宿主侧起进程只有一个入口（`execa` / `node:child_process`
  只许出现在 `shared/src/host/seam/`）。
- 模块包依赖 deny `shell-quote` / `shelljs` / `zx`；模块判据还禁止直接拿原始 shell 服务或
  `node:child_process`（[module-tools](../../packages/module-tools/README.md)）。

## 已知边界

- **产品域根 = 运行时根**：凭据、会话、附件、profile 由宿主进程写，不进子进程可写范围。
  若某条命令确需写运行时根之外的产品数据，先加一个显式子域并单独决策，不许顺手放宽。
- **`/tmp` 与 `os.tmpdir()` 恒可写**（dsh 的 workspace-write 自带）。跨树操作在步骤边界拆调用，
  产品侧中间产物走 `/tmp`。
- **会话只读**只挡工作区与外部路径；产品域仍按部署上限执行。
- **`DSH_PERMISSION_MODE` 是上限**，不是答案；`danger-full-access` 时执行缝不额外收窄。
- **旧入口已删除**：`shellOf` / `WORKBENCH_SHELL` / `withSandboxPolicy` 不再存在；宿主侧只有执行缝一条路，
  模块只有 `deps.seam`。新代码再写 `runShell` / `execa` / `node:child_process` 会被 selfcheck 判红。

## 新代码的落点与验收

1. 默认在调用点加 `seam.run`，给足 `timeoutMs`；只放命令特有的 `env`。
2. 需要写工作区就传 `session` 与 `workspaceWrite()`；需要外部路径走工具审批 + `pathsWrite`。
3. 真要出缝：确认落在上面那两类里（启动脚本 / 开发期工具链）。新增类别 = 改这份文档 + 加门禁 +
   私有 ADR，落点放对应 adapter 包。
4. 验收：`pnpm run arch` 与 `pnpm --filter @dsh-workbench/core run selfcheck` 都过。

完成判据：这条命令能归到某个**写入域**或某个具名例外，并且超时、输出、环境、可写根四件事都能指出依据。
