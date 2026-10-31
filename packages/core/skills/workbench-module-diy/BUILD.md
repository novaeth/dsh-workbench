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

工作区可以是 monorepo / 单包 / 空项目。模块必须落在会话工作区内，包目录由工作区声明
（`pnpm-workspace.yaml` 的 `packages:`、`package.json` 的 `workspaces`，或根本身即包）。不改工作区根配置。

⚠️ 无可放代码的包（无 `package.json` 或未声明 workspace）→ 问用户：在此建 workspace，还是去工坊脚手架工作区。
不改用户仓库为 monorepo。从「造一个模块」进入的会话已在工坊，`<dir>` 即工坊。
工具链与外壳不同代不用处理：启动时比对并后台同步（`workbench_diy_status` 有状态）。

模块内的 `pnpm build` / `pnpm exec dsh-wb-module` 与工作区根同一二进制，不要在模块里另装（会静默出现两代）。

## 2 从模板开始

```bash
pnpm exec dsh-wb-module init <unit> --dir <目录> --template diy --description "<一句话>"
```

`<unit>`：小写短横线，同时是单元 id、包名后缀、样式前缀；全局唯一（与已装模块、外壳单元冲突时装配抛错）。
`<目录>` 是模块落地处：在某个工作区里就选它 glob 覆盖的目录（`packages/`、`apps/`、`modules/`…都行）；
独立目录也行，那时这个包自己就是根。
骨架开箱 `check` 绿；`selfcheck` 里还含 `design check`，底稿填完才绿（脚本 8 个）。**只有一个模板**：`--template diy`（默认）——
真数据源 + 五态卡片 + 可跑的长任务 / 工具 / 动作通道样板；维护两份模板的成本没人付。

骨架分层：`src/model/**`（纯逻辑）、`src/components/**`（视图 + 同目录 `*.module.css`）、
`src/messages.ts`、`src/host.ts`（宿主面）+ `src/host/**`（宿主侧内部实现，
`moduleArch()` 默认认这一层）、`src/client.tsx`、`scripts/smoke.mjs` +
`scripts/smoke.assert.mjs`、`design.json`。模板原文可直接读。非显然项：

宿主面注册那段（`name` / `inject` / `apply`）用 `@dsh-workbench/shared/host` 的
`defineUnitHostPlugin`；写工具的审批口径用 `writeApprovalOf`；`recordOf` / `textOf` 也从那里取，
别每个宿主文件抄一份。浏览器侧注册仍是十几行样板（kit 还没有对应的收口）。

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

- `check` 不跑 `pnpm test`；状态、换算、边界测试自己跑。
- "不适用"不是"通过"：`standalone` 需外壳源码在场，`markers` 只扫公开包（DIY 模块 `private`）。
  汇总行会列出未检查项。

安装 / 上板是 agent 工具：`workbench_diy_install`、`workbench_diy_show`、`workbench_diy_status`
（[WIRING.md](WIRING.md) §3）。上板后逐条走查即验收。

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
