# dsh-workbench

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **Agent 工作台**：
一个 dsh 插件包，给 dsh 换外壳（左栏 + 常驻对话 + 自研右侧数据面板），**不改 dsh 本身**。
两种装法：`setup` 出来的**独立实例**（与 `dsh web` 并存），或**直接装进 `dsh web` 自己的
profile**（插件页一条龙，见 ADR-0037）。

> 公开仓：不要提交内部主机名、私有源地址、个人绝对路径或客户数据。组织特有的词表由
> `DSH_WB_INTERNAL_MARKERS` 配在 CI，不写进仓库；`check:markers` 只兜通用规则。
> 内部规格、工单与 ADR 住在私有子仓 `private-docs/`（git submodule）：ADR 在 `private-docs/docs/adr/`，
> spec / 工单在 `private-docs/.scratch/`。公开构建与门禁不需要它；公开文档不要链进去。

## 仓库结构（pnpm workspace）

| 路径 | 是什么 |
|---|---|
| **`packages/workbench/`** | **外壳**（发布为 `@dsh-workbench/core`）。`src/**`、`scripts/**`、`bin/**`、`arch.config.mjs` 都指这个包里；下面的命令也在这个包目录里跑 |
| `packages/shared/` | 共享包（`@dsh-workbench/shared`，两个入口：`.` 浏览器侧 / `./host` 宿主侧）：契约类型 · 纯 lib · i18n · 哑组件 · 平台解析 · host 工厂。收录判据三条（无模块级可变状态 / 不依赖外壳运行时 / 不产生全局副作用），自带 `check-state` 判据 |
| `packages/module-tools/` | 模块工具包（`@dsh-workbench/module-tools`）：`build` · `check`（十三条判据，`--only <name>` 单跑）· `lint` · `init`，以及 `arch` / `lint` 两个方言入口 |
| `packages/module-hello/` | 最小可安装模块样本（`@dsh-workbench/module-hello`），同时是模块包模板 |
| `ARCHITECTURE.md` | 仓库与外壳的架构：层序、两个运行时、单元协议、槽位、数据通路、门禁 |
| `private-docs/`（私有子仓） | 内部 ADR（`docs/adr/`）与 `.scratch/` 工单；公开构建不需要它 |
| `CONTRIBUTING.md` | 环境、门禁纪律、提交约定 |

## 三条命令

```bash
cd packages/workbench
pnpm run dev                          # 开发：监听 src/** + 起工作台 :3081（已在跑就只监听）
pnpm run check                        # 门禁：整仓那一套（= `pnpm -w run check`，见下）
./bin/dsh-workbench                   # 起工作台 :3081（dsh web 在 :3080）；pnpm run dev 已经会起它
```

**门禁只有一份，两个入口跑的是同一条链**：包内这条就是 `pnpm -w run check`，也就是仓库根那条 ——
`lint:commit` → `typecheck` → `lint` → `coverage` → `arch` → `check:docs` → `check:runtimes` →
`selfcheck` → 模块工具包的十三条判据 → `check:release-artifacts`；`pnpm release` 的闸也是它。
**别在包内另串一份短的**（会漏 lint / 文档 / 模块判据）。
`pnpm run dev` / `test` 在根与包内等价（根脚本按 workspace 转发给各包）。

**同一条链不许并发跑**：`check:standalone` 会把 `src/` 整目录改名成 `src.hidden/` 再改回来，
`coverage` 会把 `packages/workbench/coverage/` 整个删了重写 —— 两个进程同时跑会撞出与你改动无关的红。
放多个 agent/多人同时改同一个仓库时，把"跑门禁"这件事串起来；要么各开分支或 git worktree。
报告"门禁绿"时要说清那次绿是不是在**冻结的树**上拿到的（跑前/跑后各记一次 `git status --short`）。

**`check:release-artifacts` 盯「发布产物里零夹具」**：默认档按 `WB_RELEASE=1` 把发布构建建到临时根
（`WB_STAGE_DIR`）再扫；`--shipped` 档扫包内真正会出货的那批文件，必须在发布构建之后跑。
它是链路最尾：这条要读 `src/`，而前面 `check:standalone` 会把 `src/` 改名藏起来再还原。

**`selfcheck` 按域拆开**：`packages/workbench/scripts/selfcheck/` 下 `index.mjs` · `lib.mjs` ·
`checks/<域>.mjs`（一条判据 = 一个 `{ title, run(ctx, report) }`）。

## 六条硬约束

1. **界面只读，写入只走 agent 工具。** 面板出现写接口就是设计错了。
2. **dsh 的包：浏览器半侧直接用，宿主半侧不许。** 浏览器半侧经 dsh 的模块表 require
   `@deepseek-ai/dsh-client-ui-primitives`，**不手搓**；dsh 有的要么直接用、要么基于它扩展，
   **不许从 DOM+CSS 重画**。实测样板：dsh 自己的图标-only 钮就是 `Button variant="ghost" size="sm"`。
3. **两个运行时不许互引。** 宿主侧在 `packages/workbench/src/shared/api/host/**` 与
   `packages/workbench/src/modules/*/model/**`；浏览器侧不许进这两个前缀。
   `@dsh-workbench/shared` 的宿主侧只许从 `@dsh-workbench/shared/host` 取运行值。
4. **令牌用 `--dsw-*`。** 颜色、圆角、字号、间距引用 dsh 主题令牌，不写字面值。
   要正圆或胶囊时必须显式写 `corner-shape: round`。
5. **全仓代码零注释；只有公开入口的成员允许贴导出的 JSDoc。** 所有 `.ts` / `.tsx` / `.js` /
   `.mjs` / `.cjs` / `.css` 不留 `//`、块注释或实现里的解释。公开入口 = 模块作者拿得到的
   kit（`@dsh-workbench/core/client`）与 `@dsh-workbench/shared` 的 `.` / `/host` / `/testing`；
   判据按“公开入口可达的文件”算（shared 三个 barrel + `src/app/client.tsx` 里 kit 对象的来源），
   内部工具文件不放行。这些成员（要进 `.d.ts` 的导出）可保留紧贴 `export` 的 JSDoc；
   eslint / ts / vitest 等指令注释例外。`.css` 一格注释都不许。
   为什么写进 `私有 ADR`、`CONTEXT.md` 或对应的设计文档。
6. **界面按组件写，样式跟组件走。** 一段界面 = 一个组件；调用点只给数据与语义 prop，
   不写外观类名（布局槽例外）。组件样式写在同目录的 `.module.css`。

## 文档路由（公开）

| 触发 | 读 |
|---|---|
| 新用户怎么用 | [`packages/workbench/README.md`](packages/workbench/README.md) · [`README.md`](README.md) |
| 装 profile、起实例、排障、给别人用 | [`packages/workbench/README.md`](packages/workbench/README.md) |
| 改结构、加域、加面板模块、认清层序与两个运行时 | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 给模块作者：加一个模块 / 过门禁 / 发布 | [`packages/workbench/skills/workbench-module-diy/`](packages/workbench/skills/workbench-module-diy/SKILL.md) |
| 模块的构建、十三条判据、模板、设计底稿 | [`packages/module-tools/README.md`](packages/module-tools/README.md) |
| 共享契约、哑组件、宿主工具、收录判据 | [`packages/shared/README.md`](packages/shared/README.md) |
| 最小可安装模块样本 | [`packages/module-hello/README.md`](packages/module-hello/README.md) |
| 对某个术语拿不准 | [`CONTEXT.md`](CONTEXT.md) |
| 想知道某个选择为什么是这样 | `private-docs/docs/adr/`（需要子仓权限） |
| 模块的配置落在哪 / 给模块加一份状态 | `private-docs/docs/adr/0011-*.md` |
| 工具面 / 审批 / 界面组件 / 设计令牌 | ADR-0046 · ADR-0032 · ADR-0028 · ADR-0029 |
| 写 / 改界面文案、工具描述、报错、审批文案 | [`.agents/skills/wording/`](.agents/skills/wording/SKILL.md) |
| 写别人（或 agent）也要读的文档 | [`.agents/skills/writing-for-agents/SKILL.md`](.agents/skills/writing-for-agents/SKILL.md) |

## Agent skills

- `.agents/skills/` 随仓带着工程与写作技能；从 `mattpocock/skills` 取的那批见 `skills-lock.json`
  与 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。
- 模块设计与 DIY 的共用口径只有一份，住在 `packages/workbench/skills/workbench-module-diy/`，
  **不要在仓内再抄一份**。
