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
pnpm exec dsh-wb-module init <unit> --dir <工作区>/packages/module-<unit> --template diy --description "<一句话>"
```

`<unit>`：小写短横线，同时是单元 id、包名后缀、样式前缀；全局唯一（与已装模块、外壳单元冲突时装配抛错）。
骨架开箱即绿（十三条判据 + 六脚本）。

| 模板 | 内容 | 适用 |
|---|---|---|
| `minimal`（默认） | 空壳：卡壳、文案、测试；无数据源 | 已明确读什么 |
| `diy` | 样板卡：宿主一条只读路由 + 五态 | 需要可运行的数据样板（推荐） |

骨架分层：`src/model/**`（纯逻辑）、`src/components/**`（视图 + 同目录 `*.module.css`）、
`src/messages.ts`、`src/host.ts`、`src/client.tsx`、`scripts/smoke.mjs`、`design.json`。
模板原文可直接读。非显然项：

| 文件 | 要点 |
|---|---|
| `arch.config.mjs` | 一行 `moduleArch()`（`@dsh-workbench/module-tools/arch`）；层序、运行时、阈值随工具链 |
| `eslint.config.mjs` | 两行 `moduleLint({ rootDir: import.meta.dirname })`；`rootDir` 钉 tsconfig 根 |
| `types/styles.d.ts` | 用 `X.module.css` 必须有；`globals.d.ts` 是模块，其 `declare module` 不算环境声明 |
| `design.json` | 三张表 / 矩阵 / 数据源 / 验收；README 段由它生成（`minimal` 无此文件，按 [DESIGN.md](DESIGN.md) §5 建） |

修改位置：视图改 `src/components/*.tsx` + 同目录 `*.module.css`；逻辑改 `src/model/**`；文案改 `src/messages.ts`；
`src/client.tsx` 只留注册。宿主侧不 import `src/components/**`（跨运行时，`arch` 判红）。

## 3 命令

```bash
dsh-wb-module build                 # 生成 client.js 与 dist/host.js
dsh-wb-module check                 # 十三条判据
dsh-wb-module check --only cards    # 单条（contracts / protocol / bundles / source / arch / lint /
                                    #   primitives / kit / cards / standalone / markers / style / alias）
dsh-wb-module check --only primitives [--all|--json]   # 查询 dsh 原语
dsh-wb-module lint [--fix]          # 模块 eslint；--fix 写回
```

用 `pnpm exec dsh-wb-module …`。`package.json` 六个脚本（`build` / `typecheck` / `test` / `selfcheck` /
`check` / `lint`）必须保留，`contracts` 点名缺失。

- `check` 不跑 `pnpm test`；状态、换算、边界测试自己跑。
- "不适用"不是"通过"：`standalone` 需外壳源码在场，`markers` 只扫公开包（DIY 模块 `private`）。
  汇总行会列出未检查项。

安装 / 上板是 agent 工具：`workbench_diy_install`、`workbench_diy_show`、`workbench_diy_status`
（[WIRING.md](WIRING.md) §3）。上板后逐条走查即验收。

## 4 两个面

宿主面：

```ts
export const name = '<包名>';
export const inject = ['workbenchUnits'];

export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register({ manifest, mount }), '<unit>: 注册');
}
```

`mount()` 返回 `{ routes, registerTools, prefs? }`。`routes` 挂 `/workbench/api/<路由>`，只许 GET，
键必须在 `<unit>` 或 `<unit>/…` 之下（否则装配抛错）。错误返回
`{ ok: false, error: { code, message, hint? } }`（HTTP 200，外壳转发）。`registerTools` 提供模块工具。

浏览器面：`units.registerUnit({ manifest, messages, card })`。`card` 收到
`{ t, world, refreshToken, onRefresh, onSummary }`（`world.current.workspace` 为当前项目），返回元素。
三态用 kit：加载 `kit.components.SkeletonRows`；空 `kit.components.EmptyState`（无按钮）；
错误 `kit.components.BlockerState` + `kit.lib.blockerOfError(error, t)`。

`idle` 是独立态（无工作区或 `enabled: false`），不画成空态。
卡片在任意输入下不得抛异常或出现 `undefined` / `NaN`（`check --only cards`）。
