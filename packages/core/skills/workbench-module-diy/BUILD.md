# 实现：落点、模板、命令、两个面

只管怎么落。依赖 / 安装 / 热换 / 发布见 [WIRING.md](WIRING.md)；需求见 [DESIGN.md](DESIGN.md) / [STEPS.md](STEPS.md)；
门禁见 [REVIEW.md](REVIEW.md)。

## 0 模块结构

| 半 | 文件 | 运行于 | 职责 |
|---|---|---|---|
| 宿主 | `src/host.ts` → `dist/host.js` | dsh 宿主进程（Node） | 服务、路由、agent 工具、长任务 |
| 浏览器 | `src/client.tsx` → `client.js` | 页面 | 卡片、审批明细渲染 |

两侧不互相 import，只经服务名 `workbenchUnits` 相接。

## 1 落点

```
<工作区>/                 ← `workbench_diy_status` 的 `工作区：`
  pnpm-workspace.yaml     ← 包声明
  packages/
    module-<unit>/
```

工作区可以是 monorepo、单包或空项目。模块必须位于会话的工作区内，包目录由工作区声明
（`pnpm-workspace.yaml` 的 `packages:`、`package.json` 的 `workspaces`，或根本身即包）。不要修改工作区根配置。

⚠️ 如果没有可放代码的包（没有 `package.json`，或未声明 workspace），请询问用户：在这里建立 workspace，还是使用工坊的脚手架工作区。
不要改动用户仓库的 monorepo 结构。从「创建模块」入口进入的会话已在工坊里，此时 `<dir>` 就是工坊。
工具链与外壳不是同一代时无需处理：启动时会比对并在后台同步（`workbench_diy_status` 会给出状态）。

模块内的 `pnpm build` / `pnpm exec dsh-wb-module` 与工作区根使用同一个二进制，不要在模块里另外安装（否则会静默出现两代）。

## 2 从模板开始

```bash
pnpm exec dsh-wb-module init <unit> --dir <目录> --template diy --description "<一句话>"
```

``<unit>`：小写短横线，同时是单元 id、包名后缀与样式前缀；全局唯一（与已安装模块、外壳单元冲突时，注册会抛错）。
`<目录>` 是模块的创建位置：在某个工作区里时，选择它 glob 覆盖的目录（`packages/`、`apps/`、`modules/` 等均可）；
也可以使用独立目录，此时这个包自己就是根。
生成的骨架默认能通过 `check`；`selfcheck` 还包含 `design check`，要等设计底稿填写完成才会通过（共 8 个脚本）。**只有一个模板**：`--template diy`（默认），
包含真实数据源、五态卡片，以及可运行的长任务 / 工具 / 动作通道样板；维护两份模板的成本无人承担。

骨架分层：`src/model/**`（纯逻辑）、`src/components/**`（视图 + 同目录 `*.module.css`）、
`src/messages.ts`、`src/host.ts`（宿主面）+ `src/host/**`（宿主侧内部实现，
`moduleArch()` 默认认这一层）、`src/client.tsx`、`scripts/smoke.mjs` +
`scripts/smoke.assert.mjs`、`design.json`。模板原文可直接阅读。几个不明显的点：

宿主面注册部分（`name` / `inject` / `apply`）使用 `@dsh-workbench/shared/host` 的
`defineUnitHostPlugin`；写工具的审批口径用 `writeApprovalOf`；`recordOf` / `textOf` 也从那里获取，
不要在每个宿主文件里各抄一份。浏览器侧注册仍然是十几行样板（kit 还没有对应的封装）。

| 文件 | 要点 |
|---|---|
| `arch.config.mjs` | `moduleArch()`（`@dsh-workbench/module-tools/arch`）；层序、运行时、阈值随工具链 |
| `eslint.config.mjs` | 两行 `moduleLint({ rootDir: import.meta.dirname })`；`rootDir` 钉 tsconfig 根 |
| `types/styles.d.ts` | 用 `X.module.css` 必须有；`globals.d.ts` 是模块，其 `declare module` 不算环境声明 |
| `design.json` | 三张表 / 矩阵 / 数据源 / 验收；README 段由它生成 |

修改位置：视图改 `src/components/*.tsx` + 同目录 `*.module.css`；逻辑改 `src/model/**`；文案改 `src/messages.ts`；
`src/client.tsx` 只留注册。宿主侧不 import `src/components/**`（跨运行时，`arch` 判红）。

## 3 命令

用 `pnpm exec dsh-wb-module …`；命令、`--only` 判据名与模板参数看 `--help` / `check --list`，不在指引里抄。
`package.json` 至少保留 `build` / `typecheck` / `test` / `selfcheck` 四个脚本，`contracts` 点名缺失；
模板自带 8 个（另含 `check` / `lint` / `design` / `prepack`）。

- `check` 不会运行 `pnpm test`；状态、换算与边界测试需要自行运行。
- 「不适用」不等于「通过」：`standalone` 需要外壳源码在场，`markers` 只扫描公开包（DIY 模块 `private`）。
  汇总行会列出未检查项。

安装与添加到看板都由 agent 工具完成：`workbench_diy_install`、`workbench_diy_show`、`workbench_diy_status`
（[WIRING.md](WIRING.md) §3）。添加到看板之后，按三张表逐条走查即为验收。

## 4 两个面

宿主面（`defineUnitHostPlugin` 把 `name` / `inject` / `apply` 一起给）：

```ts
import { defineUnitHostPlugin } from '@dsh-workbench/shared/host';

const plugin = defineUnitHostPlugin({
  name: '<包名>',
  unit: '<unit>',
  face: { unit: '<unit>', mount },
});

export const name = plugin.name;
export const inject = plugin.inject;
export const apply = plugin.apply;
```

展开写就是：`inject = ['workbenchUnits']`，`apply(ctx)` 里从 `ctx.get('workbenchUnits')` 拿注册表，
再 `ctx.effect(() => units.register(face), '<unit>: 注册')`。

`mount({ data })` 的 `data` 是统一数据端口（`DataReader`）；读数据用 `data.read(...)`，不要自己 import adapter。
`mount()` 返回 `UnitMountResult`：`routes`、`registerTools()`，以及可选的 `factsOf` / `gate` / `context` / `warmReads` / `prefs` / `actions` / `provision` / `longTasks` / `approvalDetail` / `needsApproval`。`routes` 挂 `/workbench/api/<路由>`，只许 GET，
键必须在 `<unit>` 或 `<unit>/…` 之下（否则装配抛错）。错误返回
`{ ok: false, error: { code, message, hint? } }`（HTTP 200，外壳转发）。`registerTools` 提供模块工具。

浏览器面：`units.registerUnit({ unit, messages, card })`；清单由外壳从已装清单读，不在面里重复。`card` 收到
`{ t, world, refreshToken, onRefresh, onSummary }`（`world.current.workspace` 为当前项目），返回元素。
三态用 kit：加载 `kit.components.SkeletonRows`；空 `kit.components.EmptyState`（无按钮）；
错误 `kit.components.BlockerState` + `kit.lib.blockerOfError(error, t)`。

`idle` 是独立态（无工作区或 `enabled: false`），不画成空态。
卡片在任意输入下不得抛异常或出现 `undefined` / `NaN`（`check --only cards`）。

## 5 起子进程：走执行缝门面

模块要在宿主侧跑命令（构建、git、打包……）时，用外壳放进 `mount(deps)` 的执行缝门面 `deps.seam`。
`ctx.get('shell')` / `ctx.get('workbenchShell')` / `ctx.get('seam')`、`runShell` / `shellOf`、裸
`child_process` 都不给模块用，`check --only seam` 会判红。

先在清单里声明要哪几档写入域（只认两档）：

```json
{ "host": { "inject": [], "writes": ["unit"] } }
```

| 档 | 可写在哪 | 什么时候给 |
|---|---|---|
| `unit` | `<运行时根>/units/<unit>/`（模块自己的数据目录；`HOME`、npm/pnpm 缓存与日志也注入到这里） | 声明了就常开、不用审批 |
| `workspace` | 当前会话的工作区 | 声明了才给；调用时还要带上会话对象 |

不写 `writes`（或写 `[]`）= 不拿门面：`deps.seam` 是 `undefined`，代码里按可选处理。

```ts
const result = await deps.seam?.run({
  scope: 'unit',
  command: 'git rev-parse --short HEAD',
  timeoutMs: 10_000,
});
if (result === undefined || result.exitCode !== 0) {
  return { ok: false, text: '这条命令没跑通' };
}
```

- `workspace` 档的 `session` 从工具运行上下文拿（`execute(raw, exec)` 的 `exec.agent?.session`）；
  路由 / 动作这些没有会话的调用点不要请求这一档。
- 一条命令只声明一个写入域；要写两棵树就在步骤边界拆成两次调用。
- `retry: 'safe'` 只给幂等 / 只读命令（查询、列清单）；写命令用默认的 `'never'`。
- 请求没声明的档在起进程前就失败（`SeamError` 的 `scope-not-declared` / `workspace-unknown`），别吞掉。
- 这层门面是**约定 + 门禁 + 归因**，不是进程隔离：模块宿主代码与外壳同进程。真正的安全边界仍是
  「装不装模块 + 审批」。
