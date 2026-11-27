# 实现：落点、模板、两个面

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
工具链版本与同步故障见 [LIFECYCLE.md](LIFECYCLE.md)。

模块内的 `pnpm build` / `pnpm exec dsh-wb-module` 与工作区根使用同一个二进制，不要在模块里另外安装（否则会静默出现两代）。

## 2 从模板开始

```bash
pnpm exec dsh-wb-module init <unit> --dir <目录> --template diy --description "<一句话>"
```

``<unit>`：小写短横线，同时是单元 id、包名后缀与样式前缀；全局唯一（与已安装模块、工作台单元冲突时，注册会抛错）。
`<目录>` 是模块的创建位置：在某个工作区里时，选择它 glob 覆盖的目录（`packages/`、`apps/`、`modules/` 等均可）；
也可以使用独立目录，此时这个包自己就是根。
生成的骨架默认能通过 `check`；`selfcheck` 还包含 `design check`，要等设计记录（底稿）填写完成才会通过。
`package.json` 至少保留 `build` / `typecheck` / `test` / `selfcheck` 四个脚本，`contracts` 点名缺失；模板自带 10 个脚本。
**只有一个模板**：`--template diy`（默认），包含真实数据源、五种状态（五态）卡片，以及可运行的长任务 / 工具 / 动作通道样板；两份模板的维护成本过高。

骨架分层：`src/model/**`（纯逻辑）、`src/components/**`（视图 + 同目录 `*.module.css`）、
`src/messages.ts`、`src/host.ts`（宿主面）+ `src/host/**`（宿主侧内部实现，
`moduleArch()` 默认认这一层）、`src/client.tsx`、`scripts/smoke.mjs` +
`scripts/smoke.assert.mjs`、`design.json`、`.jscpd.json`、`.gitignore`。模板原文可直接阅读。几个不明显的点：

宿主面注册部分（`name` / `inject` / `apply`）使用 `@dsh-workbench/shared/host` 的
`defineUnitHostPlugin`；写工具的审批口径用 `writeApprovalOf`；`recordOf` / `textOf` 也从那里获取，
不要在每个宿主文件里各复制一份。浏览器侧注册仍然是十几行样板（kit 还没有对应的封装）。

| 文件 | 要点 |
|---|---|
| `arch.config.mjs` | `moduleArch()`（`@dsh-workbench/module-tools/arch`）；层序、运行时、阈值随工具链 |
| `eslint.config.mjs` | 两行 `moduleLint({ rootDir: import.meta.dirname })`；`rootDir` 固定 tsconfig 根 |
| `types/styles.d.ts` | 用 `X.module.css` 必须有；`globals.d.ts` 是模块，其 `declare module` 不算环境声明 |
| `design.json` | 三张表 / 矩阵 / 数据源 / 验收；DEVELOPING.md 段由它生成 |

修改位置：视图改 `src/components/*.tsx` + 同目录 `*.module.css`；逻辑改 `src/model/**`；文案改 `src/messages.ts`；
`src/client.tsx` 只留注册。宿主侧不 import `src/components/**`（跨运行时，`arch` 判定失败）。

## 3 两个面

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
`mount()` 返回 `UnitMountResult`：`routes`、`registerTools()`，以及可选的 `factsOf` / `gate` / `context` / `warmReads` / `prefs` / `actions` / `provision` / `longTasks` / `approvalDetail` / `needsApproval` / `headline`。`routes` 挂 `/workbench/api/<路由>`，只许 GET，
键必须在 `<unit>` 或 `<unit>/…` 之下（否则装配抛错）。错误返回
`{ ok: false, error: { code, message, hint? } }`（HTTP 200，工作台转发）。`registerTools` 提供模块工具。

浏览器面：`units.registerUnit({ unit, messages, card })`，写工具再加 `approval: { tools, plan, render? }`；清单由工作台从已安装清单读取，不在面里重复。`card` 收到
`{ t, world, refreshToken, onRefresh, onSummary }`（`world.current.workspace` 为当前项目），返回元素。
三态用 kit：加载 `kit.components.SkeletonRows`；空 `kit.components.EmptyState`（无按钮）；
错误 `kit.components.BlockerState` + `kit.lib.blockerOfError(error, t)`。

`idle` 是独立态（无工作区或 `enabled: false`），不画成空态。
卡片在任意输入下不得抛异常或出现 `undefined` / `NaN`（`check --only cards`）。
