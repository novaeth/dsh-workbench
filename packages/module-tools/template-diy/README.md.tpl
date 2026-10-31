# __NAME__

`__UNIT__` 模块：一个独立的 dsh 插件包，只认外壳的服务名，不认识外壳源码。

这份是 **唯一模板**（`--template diy`，也是默认）生成的骨架：一张**读当前项目目录的只读卡**，
数据从宿主侧**真读**一个目录算出来（`node:fs`），另带一条**能跑**的流程 / 长任务 / 真工具 /
动作通道样板；不是一个写死的样板。

```bash
dsh-wb-module init <unit> --dir <目录>              # 生成这份骨架（只有这一个模板）
dsh-wb-module build     # 出 dist/host.js 与套了 loader 壳的 client.js
dsh-wb-module check     # 十三条判据：契约 / 声明协议 / 产物边界 / 源码边界 / 架构 / dsh 原语 / kit 面 / 卡片渲染 / 独立构建 / 内部标识 / 样式归属 / 不指外壳 / 代码卫生（eslint）
dsh-wb-module check --only cards   # 十三条可以单跑
```

包自带的六个脚本（`build` / `typecheck` / `test` / `selfcheck` 是 `check` 的契约判据要求的那四个；`check` 跑全部判据，`lint` 只跑源码卫生那一条）：

```bash
pnpm build        # 构建产物
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest：路由真读数 + 卡片五态 + 长任务/工具契约
pnpm selfcheck    # 构建 + 把 client.js 当浏览器加载器跑一遍 + 真跑一趟流程 + 走 scripts/smoke.assert.mjs
pnpm check        # dsh-wb-module check
pnpm lint         # dsh-wb-module lint（`--fix` 就地改文件；`check` 永不动手）
```

## 需求底稿（做之前填，做完自己逐条走一遍）

三张表既是**要问清的需求**，也是**最后的验收单** —— 表里每一格 agent 都要在真卡片上见过或点过。
**空着的格就是还没定的事**，别带着空格往下做：落点是同目录的 `design.json`
（`dsh-wb-module design check` 会把空格一格一格列出来），**下面标了 start/end 的那一段就是由它生成的**
—— 要改三张表就改 `design.json`，再 `dsh-wb-module design render`；手改那一段会被 next 一次 check 判红。
所以下次他说"改一下"不用从头问。

**非生成段（这一节与下文）不会被 render 覆盖**：需求变了要自己改这里，`design render` 只管标记之间那一段。

怎么问、怎么填：指引 `SKILL.md` 的七步 · `DESIGN.md`（判域 / 两条分工 / 三张表）·
`STEPS.md`（每步问什么、什么时候算做完）· `PANEL.md` · `TOOLS.md` · `LINKAGE.md`。

<!-- dsh-wb:design:start -->
（这一段由 `design.json` 生成：改需求改 `design.json`，再 `dsh-wb-module design render`；手改会被下一次 check 判红。）
<!-- dsh-wb:design:end -->

## 生成出来的形状

**分层多文件**，不是单文件：数字越小越底层，上层只许 import 下层的（`arch.config.mjs` 那条
`arch` 判据盯着，`dsh-wb-module check` 会跑）。目录**按需要出现**：这份有状态逻辑，所以有 `model/`。
宿主侧的辅助实现放 `src/host/`（`moduleArch()` 默认就认这一层；
`src/host.ts` 仍是对外的宿主面，两个面只认 `dsh.workbenchFaces` 里那两个文件）。

| 文件 | 是什么 | 层 |
|---|---|---|
| `package.json` | 自述清单：`dsh.workbench.unit` = `__UNIT__`、两个面（`src/host.ts` / `src/client.tsx`）、八个脚本、peer 下限 | — |
| `arch.config.mjs` | 本模块的架构方言：`moduleArch()`（`src/host/**` 默认在层序里）—— 层序表 / 两个运行时 / 阈值只有 `@dsh-workbench/module-tools/arch` 那一份，随工具链同代 | — |
| `eslint.config.mjs` | 本模块的**语法卫生方言**，同样两行：`moduleLint()` —— 规则表只有 `@dsh-workbench/module-tools/lint` 那一份（`console` / `as any` / hooks 那几条 / 手搓颜色与 `!important`）；要开口子就 `moduleLint({ rules })` | — |
| `cordis.patch.yml` | 插进 dsh 组合的补丁 | — |
| `design.json` | 三张表 + 状态矩阵 + 数据源记录 + 验收清单（**唯一真相**，上面那段由它生成；`dsh-wb-module design check/render/accept` 读写它） | — |
| `src/model/overview.ts` | 纯逻辑：类型 + 五态状态机 + `formatBytes`。两个运行时都读得到，不碰 react / kit / dsh / `node:*` | 1 |
| `src/model/__tests__/overview.test.ts` | 模型层的配对测试（有 `src/model/**` 就必须有 —— `arch` 的 M08） | 99 |
| `src/model/flow.ts` | 样板流程的纯逻辑：`FlowDefinition` + 五态标题 / 是否还在跑；不碰宿主 | 1 |
| `src/model/__tests__/flow.test.ts` | 流程模型的配对测试 | 99 |
| `src/model/notes.ts` | 笔记的纯逻辑：校验 / 读回 / 最多 20 条 | 1 |
| `src/model/__tests__/notes.test.ts` | 笔记模型的配对测试 | 99 |
| `src/model/prefs.ts` | 配置的纯逻辑：按工作区存 `limit`（1..50），坏值回默认 | 1 |
| `src/model/__tests__/prefs.test.ts` | 配置模型的配对测试 | 99 |
| `src/messages.ts` | 卡片那几句文案（zh / en），键带 `<unit>.` 前缀 | 1 |
| `src/declared-tools.ts` | 清单里工具名的生成物（`dsh-wb-module sync` 写；代码只引 `DECLARED_TOOLS.run.name` / `DECLARED_TOOLS.addNote.name`，不写字面量） | 1 |
| `src/components/OverviewCard.tsx` | 卡片：`Card` 壳 + 五态 + 最大的几个文件 + 长任务行 + 笔记（写）/「显示几个」配置 | 2 |
| `src/components/OverviewBody.tsx` | 五态各自那一屏（待机 / 加载 / 就绪 / 空 / 出错） | 2 |
| `src/components/OverviewBody.module.css` | 就绪态「最大的几个文件」列表的布局 | 2 |
| `src/components/RunSection.tsx` | 长任务那一块：跑流程的钮 + `LongTaskRow`（五态 / 停止） | 2 |
| `src/components/NotesSection.tsx` | 笔记那一块：输入 + 存一条 + 列表 | 2 |
| `src/components/PrefsSection.tsx` | 「最大的几个文件」配置（`SelectField`，按工作区存） | 2 |
| `src/components/OverviewCard.module.css` | 这个组件自己的样式（CSS Modules，构建时类名按路径哈希）—— **样式跟组件同目录** | 2 |
| `src/components/__tests__/OverviewCard.test.ts` | 这张卡五态各画得出来 + 写失败留在卡上（测试住同目录的 `__tests__/`）；流程 / 笔记 / 配置的接线由 `plugin.test.ts` 与 smoke 覆盖 | 99 |
| `src/host.ts` | 宿主面：接线 + 三条只读路由（`overview` / `notes` / `prefs`）+ 挂工具 / 长任务 / 动作通道 / `prefs` / 审批口径 | 10 |
| `src/host/overview.ts` | 宿主侧内部实现：`readOverview()`（真读目录）+ 路由回答 | 10 |
| `src/host/sample.ts` | 宿主侧内部实现：样板流程的动作、长任务、只读工具 | 10 |
| `src/host/notes.ts` | 宿主侧内部实现：笔记读写（`deps.store`）+ 写工具 + 动作通道 | 10 |
| `src/client.tsx` | 浏览器面：**只剩面** —— 注册 + 把 props 交给 `components/OverviewCard` | 10 |
| `src/__tests__/plugin.test.ts` | 面注册 + 路由真读 + 工具注册 + 流程真跑 + 笔记/配置/审批 | 99 |
| `scripts/smoke.mjs` | 接线自检：卡片进没进外壳、工具注册、流程真跑、笔记真写、配置存得住；真读断言在 `smoke.assert.mjs` | — |
| `scripts/smoke.assert.mjs` | **这个模块自己的**真读断言：换数据源时改这份，别删 smoke 里的调用 | — |
| `CHANGELOG.md` | 版本记录（`dsh-wb-module release` 追加；`package.json.files` 里带它） | — |
| `tsconfig.json` / `vitest.config.ts` / `types/globals.d.ts` / `types/styles.d.ts` | 经典 JSX 运行时（`jsxFactory: h`）、vitest 的别名、浏览器半侧的运行时垫片、`*.module.css` 的类名表声明 | — |
| `README.md` | 就是本文 | — |

## 长任务、工具、写通道与配置（样板）

这份骨架故意带了一组**可跑**的能力，示范五件事：

- **宿主面接线**：`name` / `inject` / `apply` 用 `@dsh-workbench/shared/host` 的 `defineUnitHostPlugin`
  一次给齐；写工具的审批口径用 `writeApprovalOf`；`recordOf` / `textOf` 也从那里取，别每个文件抄一份。
- **只读工具**：`registerTools()` 是**调用时才注册**、返回的是清理函数；工具名必须和 `package.json` 的
  `dsh.workbench.tools` 一字不差。`__UNIT___run` 起一趟流程，传 `runId` 则只看同一趟。
- **长任务**：`deps.longTasks.create()` 交回一张注册表，`run` 里调 `deps.flow.run()` 并把
  `onStep` 交给 `longTaskStepOf`（shared/host 的默认映射）；卡片用 `useLongTask` 读、`LongTaskRow` 画。
- **写通道 + 审批**：`__UNIT___add_note` 在清单里写 `writes: true`，`mount()` 返回 `needsApproval`（这次要点头）
  与 `approvalDetail`（审批屏上那句"会写什么"）；agent 调用前壳会拦一道。卡片那颗钮走动作通道
  `<unit>-add-note`（点击即确认，不审批），与写工具共用同一份 `deps.store` 数据；网络 / 校验失败
  留在按钮下面那一行，不静默。
- **配置（prefs）**：`mount()` 返回 `prefs: { resource, handle }`，按工作区把"显示几个文件"存进
  `deps.store`；卡片用 `useHostWrite({ channel: 'prefs' })` 写、用 `<unit>/prefs` 读。
- **动作通道**：用户直接点的单步动作走 `<unit>-…` 资源；与工具共用实现，不另写一份。

换成你自己的能力时，五处一起改：`src/model/*` 的纯逻辑、`src/host/*` 的实现、
`src/host.ts` 的接线（路由 / 工具 / 动作 / prefs / 审批）、`src/components/OverviewCard.tsx` 的展示、
`design.json` 的三张表与能力行。

## 数据是在哪算出来的

宿主侧，`src/host/overview.ts` 的 `readOverview(path, limit)`：

* `readdirSync(path, { withFileTypes: true })` 数出**目录数**；
* 每个普通文件 `statSync` 一次，累加**总字节**、记下 `name / bytes / mtime`（mtime 是 ISO 串）；
* 按字节降序（同字节按名字）排，取前 `limit` 个当**最大的几个文件**。

已知的取舍（不是 bug，是这份骨架刻意保持简单的地方）：

* **符号链接不计数**：既不算文件也不算目录（想要跟随就自己换成 `statSync` + `lstatSync` 判断）；
* **同步读**：模板优先让代码一眼看得懂；真接大目录时改成 `node:fs/promises` 版本更合适；
* 只读**直接子项**，不递归。

## 那条只读路由

键是 `<unit>/overview`（`__UNIT__` 就是本模块的单元 id）——**必须住在自己那一格的命名空间里**，
外壳装 / 升 / 卸时要能点名到它；写成别的名字注册当场就被判红。

```
GET /api/__UNIT__/overview?path=<绝对路径>&limit=<1..50>
```

查询参数：

| 参数 | 缺省 | 说明 |
|---|---|---|
| `path` | 无（必填） | 要读的目录。卡片把 `props.world.current.workspace.path` 塞进来；缺了不回数据，直接回 `no-path` |
| `limit` | `5` | 返回几个"最大的文件"，夹在 `1..50` 之间 |

成功：

```json
{ "ok": true, "path": "/…", "files": 128, "dirs": 12, "bytes": 3145728,
  "largest": [{ "name": "client.js", "bytes": 182400, "mtime": "2026-01-05T09:12:44.000Z" }] }
```

读不到（路径不存在 / 没权限 / 不是目录）：**HTTP 200 + `ok:false`**，错误码 `overview-unreadable`。
压根没给 `path`：同样 `ok:false`，错误码 `no-path` —— 别拿宿主进程的工作目录当默认值：
那会让"我没说要看哪儿"变成"屏幕上是 dsh 服务启动目录"，两个都不像用户想要的东西。
之所以不让它抛：抛出去会被外壳的传输层转成 HTTP 500，卡片只剩一句"宿主返回 HTTP 500"，
用户看不到是哪条路径出了什么事。

```json
{ "ok": false, "error": { "code": "overview-unreadable", "message": "ENOENT: no such file or directory, scandir '/…'" } }
```

卡片侧读数的 hook 是 `kit.hooks.useApiResource`（`route` 就是 `__UNIT__/overview`）。
注意它的 `value` 是**整个响应对象**（成功时形如 `{ ok: true, ...payload }`），不是 `payload` 本身。

## 卡片画哪五态

`src/model/overview.ts` 的 `overviewStateOf({ phase, value, error })` 是一条纯函数，
每个分支各对应一屏（`src/model/__tests__/overview.test.ts` 直接断言这条函数，
`src/components/__tests__/OverviewCard.test.ts` 再把每一屏画一遍）：

| 态 | 什么时候 | 画什么 |
|---|---|---|
| 待机 | 没有选中工作区（`path === ''`），请求压根不发（`useApiResource(…, { enabled: false })`，`phase` 停在 `idle`） | `CenteredState`：先打开一个项目 |
| 加载 | 还没有值（首读），或 `phase === 'error'` 之外什么都没来 | `CenteredState`：正在读目录 |
| 就绪 | 有值，且文件数 + 目录数 > 0 | `StateBlock`：路径 + 「N 个文件 · M 个目录 · 总字节」+ 最大的几个文件列表 |
| 就绪但空 | 有值，但文件数 = 目录数 = 0 | `EmptyState`：这个目录是空的 |
| 出错 | `phase === 'error'` | `CenteredState`：读不到这个目录 + 宿主的原话 |

刷新时 `useApiResource` 会把 `phase` 打成 `loading` **同时保留上一次的 `value`** ——
这时刻意继续画旧数据（右上角的转圈由 `Card` 的 `refreshing` 表示），不退回骨架：
一次刷新不该让整张卡闪一下。

## 开发与发布

开发命令见上面的六个脚本；dsh / 工作台的模块约束见工作台模块指引（随外壳出货）；agent 的工作说明见 `AGENTS.md`。

发布（维护者确认之后）：`dsh-wb-module release --target team|public|tarball|git`；
`--dry-run` 只预览，`--verify` 只核已发布的包。
