# __NAME__ · 作者文档

终端用户说明见 [README.md](README.md)（文案源 `readme.json`）；本文件说明实现、路由、判据与设计底稿。

`__UNIT__` 模块是一个独立的 dsh 插件包：只通过工作台提供的服务名接入，不引用工作台源码。

本文件由**唯一模板**（`--template diy`，也是默认）生成：一张读取当前项目目录的只读卡片，数据由宿主侧实际读取目录得到（`node:fs`），另带一条可运行的流程、长任务、工具与动作通道示例，不是写死的示例。

```bash
dsh-wb-module init <unit> --dir <目录>              # 生成这份骨架（只有这一个模板）
dsh-wb-module build     # 生成 dist/host.js 与带加载器包装的 client.js，并推送给运行中的工作台
dsh-wb-module build --watch   # 常驻：修改 src/** 后自动重建并推送（按 Ctrl-C 退出）
dsh-wb-module check     # 十四条判据：契约 / 声明协议 / 产物边界 / 源码边界 / 执行缝 / 架构 / dsh 原语 / kit 面 / 卡片渲染 / 独立构建 / 内部标识 / 样式归属 / 不指工作台 / 代码卫生（eslint）
dsh-wb-module check --only cards   # 十四条可以单独运行
```

包自带十个脚本（`build` / `typecheck` / `test` / `selfcheck` 是 `check` 的契约判据要求的四个；`check` 运行全部判据，`lint` 只运行源码卫生那一条，`check:duplication` 使用 jscpd 检查重复代码）：

```bash
pnpm build        # 构建产物
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest：路由实际读取 + 卡片五态 + 长任务/工具契约
pnpm selfcheck    # 构建 + 将 client.js 作为浏览器加载器运行一次 + 实际运行一次流程 + 执行 scripts/smoke.assert.mjs
pnpm check        # dsh-wb-module check
pnpm lint         # dsh-wb-module lint（`--fix` 直接写回文件；`check` 不修改文件）
pnpm run check:duplication   # jscpd 扫描 src / scripts，存在克隆即判定失败
pnpm run duplication:report  # 完整报告输出到 coverage/duplication/
pnpm design check            # 设计底稿：check / render / accept
pnpm prepack                 # 打包前构建（npm pack / publish 自动触发）
```

## 需求底稿（开始前填写，完成后逐条验证）

三张表既是要确认的需求，也是最终的验收清单 —— 表中每一格都必须在真实卡片上查看或操作过。
**空白的格表示尚未确定的事项**，不要带着空白继续。落点是同目录的 `design.json`
（`dsh-wb-module design check` 会逐格列出空白），**标记 start/end 之间的段落由它生成**
—— 要修改三张表就修改 `design.json`，再运行 `dsh-wb-module design render`；手动修改该段落会在下一次 check 中判定失败。
因此后续修改需求时不必重新开始提问。

**非生成段（这一节与下文）不会被 render 覆盖**：需求变化时修改这里，`design render` 只处理标记之间的段落。

去向与流程选择见 `SKILL.md`，方案节点见 `FLOW.md`；三张表与设计记录见 `DESIGN.md`，
确认方案的问法见 `STEPS.md`，界面、能力与联动见 `PANEL.md`、`TOOLS.md`、`LINKAGE.md`。

<!-- dsh-wb:design:start -->
（这一段由 `design.json` 生成：修改需求时修改 `design.json`，再运行 `dsh-wb-module design render`；手动修改会在下一次 check 中判定失败。）
<!-- dsh-wb:design:end -->

## 生成后的结构

**分层多文件**：层号越小越底层，上层只能 import 下层（由 `arch.config.mjs` 的 `arch` 判据检查，
`dsh-wb-module check` 会运行）。目录**按需出现**：本骨架包含状态逻辑，因此有 `model/`。
宿主侧的辅助实现放在 `src/host/`（`moduleArch()` 默认识别这一层；
`src/host.ts` 仍是对外的宿主面，两个面只认 `dsh.workbenchFaces` 中的两个文件）。

| 文件 | 是什么 | 层 |
|---|---|---|
| `package.json` | 自述清单：`dsh.workbench.unit` = `__UNIT__`、两个面（`src/host.ts` / `src/client.tsx`）、十个脚本、peer 版本下限 | — |
| `arch.config.mjs` | 本模块的架构方言：`moduleArch()`（`src/host/**` 默认在层序中）—— 层序表、两个运行时与阈值只由 `@dsh-workbench/module-tools/arch` 提供，随工具链同代 | — |
| `eslint.config.mjs` | 本模块的**语法卫生方言**，同样两行：`moduleLint()` —— 规则表只由 `@dsh-workbench/module-tools/lint` 提供（`console` / `as any` / hooks 相关规则 / 手写颜色值与 `!important`）；需要例外时使用 `moduleLint({ rules })` | — |
| `.jscpd.json` | 重复代码：扫描 `src` / `scripts` 的 TS / JS（不含测试与产物），阈值为 0 —— 存在克隆即判定失败；`pnpm run duplication:report` 输出完整报告 | — |
| `.gitignore` | 依赖（`node_modules/`）、构建产物（`dist/`、`client.js`）、`coverage/` 与本地生成的安装包；发布时 `release` 用 `git add -f` 单独添加要发布的产物 | — |
| `design.json` | 三张表、状态矩阵、数据源记录与验收清单（**唯一来源**，上面那段由它生成；`dsh-wb-module design check/render/accept` 读写它） | — |
| `src/model/overview.ts` | 纯逻辑：类型 + 五态状态机 + `formatBytes`。两个运行时都可读取，不引用 react / kit / dsh / `node:*` | 1 |
| `src/model/__tests__/overview.test.ts` | 模型层的配套测试（存在 `src/model/**` 就必须有 —— 见 `arch` 的 M08） | 99 |
| `src/model/time.ts` | 纯逻辑：时间串 → 毫秒；显示层的相对时间由工作台提供 | 1 |
| `src/model/__tests__/time.test.ts` | 时间模型的配套测试 | 99 |
| `src/model/flow.ts` | 示例流程的纯逻辑：`FlowDefinition` + 五态标题 / 是否运行中；不依赖宿主 | 1 |
| `src/model/__tests__/flow.test.ts` | 流程模型的配套测试 | 99 |
| `src/model/notes.ts` | 笔记的纯逻辑：校验 / 读回 / 最多 20 条 | 1 |
| `src/model/__tests__/notes.test.ts` | 笔记模型的配套测试 | 99 |
| `src/model/prefs.ts` | 配置的纯逻辑：按工作区保存 `limit`（1..50），非法值回默认 | 1 |
| `src/model/__tests__/prefs.test.ts` | 配置模型的配套测试 | 99 |
| `src/messages.ts` | 卡片的文案（zh / en），键带 `<unit>.` 前缀 | 1 |
| `src/declared-tools.ts` | 清单中工具名的生成文件（由 `dsh-wb-module sync` 写入；代码只引用 `DECLARED_TOOLS.run.name` / `DECLARED_TOOLS.addNote.name`，不写字面量） | 1 |
| `src/components/OverviewCard.tsx` | 卡片：`Card` 外框 + 五态 + 最大的几个文件 + 任务行 + 笔记（写）/「显示几个」配置 | 2 |
| `src/components/OverviewBody.tsx` | 五态各自的界面（待机 / 加载 / 就绪 / 空 / 出错） | 2 |
| `src/components/OverviewBody.module.css` | 就绪态「最大的几个文件」列表的布局 | 2 |
| `src/components/when.ts` | 显示层：将毫秒交给工作台的相对时间格式 | 2 |
| `src/components/RunSection.tsx` | 长任务区域：运行流程的按钮 + `LongTaskRow`（五态 / 停止） | 2 |
| `src/components/NotesSection.tsx` | 笔记区域：输入 + 保存 + 列表 | 2 |
| `src/components/PrefsSection.tsx` | 「显示几个文件」配置（`SelectField`，按工作区保存） | 2 |
| `src/components/OverviewCard.module.css` | 组件自己的样式（CSS Modules，构建时类名按路径哈希）—— **样式与组件同目录** | 2 |
| `src/components/__tests__/OverviewCard.test.ts` | 卡片五态均可渲染，写失败信息留在卡片上（测试位于同目录的 `__tests__/`）；流程、笔记与配置的接线由 `plugin.test.ts` 与 smoke 覆盖 | 99 |
| `src/host.ts` | 宿主面：接线 + 三条只读路由（`overview` / `notes` / `prefs`）+ 注册工具 / 长任务 / 动作通道 / `prefs` / 审批口径 | 10 |
| `src/host/overview.ts` | 宿主侧内部实现：`readOverview()`（实际读取目录）+ 路由响应 | 10 |
| `src/host/sample.ts` | 宿主侧内部实现：示例流程的动作、长任务、只读工具 | 10 |
| `src/host/notes.ts` | 宿主侧内部实现：笔记读写（`deps.store`）+ 写工具 + 动作通道 | 10 |
| `src/client.tsx` | 浏览器面：**只保留注册** —— 注册并把 props 交给 `components/OverviewCard` | 10 |
| `src/__tests__/plugin.test.ts` | 面注册 + 路由实际读取 + 工具注册 + 流程实际运行 + 笔记、配置与审批 | 99 |
| `scripts/smoke.mjs` | 接线自检：卡片是否注册进工作台、工具注册、流程实际运行、笔记实际写入、配置可保存；实际读取断言在 `smoke.assert.mjs` | — |
| `scripts/smoke.assert.mjs` | **本模块自己的**实际读取断言：更换数据源时修改此文件，不要删除 smoke 中的调用 | — |
| `CHANGELOG.md` | 版本记录（由 `dsh-wb-module release` 追加；包含在 `package.json` 的 `files` 中） | — |
| `tsconfig.json` / `vitest.config.ts` / `types/globals.d.ts` / `types/styles.d.ts` | 经典 JSX 运行时（`jsxFactory: h`）、vitest 别名、浏览器半侧的运行时垫片、`*.module.css` 的类名表声明 | — |
| `DEVELOPING.md` | 即本文件（作者文档；用户说明在 `README.md`） | — |

## 长任务、工具、写通道与配置（示例）

本骨架刻意提供一组**可运行**的能力，示范五件事：

- **宿主面接线**：`name` / `inject` / `apply` 通过 `@dsh-workbench/shared/host` 的 `defineUnitHostPlugin`
  一次性提供；写工具的审批口径使用 `writeApprovalOf`；`recordOf` / `textOf` 也从那里获取，不要在每个文件中重复。
- **只读工具**：`registerTools()` 在**调用时才注册**，返回清理函数；工具名必须与 `package.json` 的
  `dsh.workbench.tools` 完全一致。`__UNIT___run` 启动一次流程，传入 `runId` 则只查看同一次运行。
- **长任务**：`deps.longTasks.create()` 返回一张注册表，在 `run` 中调用 `deps.flow.run()`，并把
  `onStep` 交给 `longTaskStepOf`（shared/host 的默认映射）；卡片用 `useLongTask` 读取，用 `LongTaskRow` 渲染。
- **写通道 + 审批**：`__UNIT___add_note` 在清单中写 `writes: true`，`mount()` 返回 `needsApproval`
  （本次需要批准）与 `headline`（具体标题）；客户端提交 `approval.plan`（对象 / 修改后 / 目标位置 / 影响范围
  四行，可加 extra），`approvalDetail` 可省。agent 调用前，工作台会拦截一次。卡片上的按钮走动作通道
  `<unit>-add-note`（点击即确认，不审批），与写工具共用同一份 `deps.store` 数据；网络或校验失败
  显示在按钮下方，不会静默失败。
- **配置（prefs）**：`mount()` 返回 `prefs: { resource, handle }`，按工作区把"显示几个文件"保存到
  `deps.store`；卡片用 `useHostWrite({ channel: 'prefs' })` 写入，用 `<unit>/prefs` 读取。
- **动作通道**：用户直接点击的单步动作走 `<unit>-…` 资源；与工具共用实现，不另外编写一份。

替换为自己的能力时，需要同时修改五处：`src/model/*` 的纯逻辑、`src/host/*` 的实现、
`src/host.ts` 的接线（路由 / 工具 / 动作 / prefs / 审批）、`src/components/OverviewCard.tsx` 的展示、
`design.json` 的三张表与能力行。

## 数据从哪里来

宿主侧由 `src/host/overview.ts` 的 `readOverview(path, limit)` 计算：

* `readdirSync(path, { withFileTypes: true })` 统计**目录数**；
* 每个普通文件调用一次 `statSync`，累加**总字节**，记录 `name / bytes / mtime`（mtime 是 ISO 字符串）；
* 按字节降序（同字节按名称）排序，取前 `limit` 个作为**最大的几个文件**。

已知的取舍（不是缺陷，是本骨架刻意保持简单之处）：

* **符号链接不计数**：既不算文件也不算目录（需要跟随符号链接时，改用 `statSync` + `lstatSync` 判断）；
* **同步读取**：模板优先保证代码易于理解；接入大目录时改用 `node:fs/promises` 版本更合适；
* 只读取**直接子项**，不递归。

## 只读路由

键是 `<unit>/overview`（`__UNIT__` 就是本模块的模块标识）—— **必须位于本模块自己那一格的命名空间内**，
工作台安装、更新或卸载时需要能按名称找到它；写成其他名称会在注册时立即判定失败。

```
GET /api/__UNIT__/overview?path=<绝对路径>&limit=<1..50>
```

查询参数：

| 参数 | 缺省 | 说明 |
|---|---|---|
| `path` | 无（必填） | 要读取的目录。卡片将 `props.world.current.workspace.path` 传入；缺失时不返回数据，直接返回 `no-path` |
| `limit` | `5` | 返回多少个"最大的文件"，限制在 `1..50` 之间 |

成功：

```json
{ "ok": true, "path": "/…", "files": 128, "dirs": 12, "bytes": 3145728,
  "largest": [{ "name": "client.js", "bytes": 182400, "mtime": "2026-01-05T09:12:44.000Z" }] }
```

读取失败（路径不存在 / 无权限 / 不是目录）：**HTTP 200 + `ok:false`**，错误码 `overview-unreadable`。
完全没有提供 `path`：同样返回 `ok:false`，错误码 `no-path` —— 不要使用宿主进程的工作目录作为默认值：
否则"我没有指定要查看哪个目录"会变成"屏幕上显示的是 dsh 服务启动目录"，两者都不是用户期望的结果。
不让它抛出异常的原因是：抛出后会被工作台的传输层转成 HTTP 500，卡片上只会显示"宿主返回 HTTP 500"，
用户看不到是哪条路径出了问题。

```json
{ "ok": false, "error": { "code": "overview-unreadable", "message": "ENOENT: no such file or directory, scandir '/…'" } }
```

卡片侧读取数据的 hook 是 `kit.hooks.useApiResource`（`route` 就是 `__UNIT__/overview`）。
注意它的 `value` 是**整个响应对象**（成功时形如 `{ ok: true, ... }`），不是其中的数据字段。

## 卡片如何呈现五种状态

`src/model/overview.ts` 的 `overviewStateOf({ phase, value, error })` 是一个纯函数，
每个分支对应一个界面状态（`src/model/__tests__/overview.test.ts` 直接断言这个函数，
`src/components/__tests__/OverviewCard.test.ts` 再逐一渲染每个界面）：

| 状态 | 什么时候 | 显示什么 |
|---|---|---|
| 待机 | 没有选中工作区（`path === ''`），不会发起请求（`useApiResource(…, { enabled: false })`，`phase` 停在 `idle`） | `CenteredState`：请先打开一个项目 |
| 加载 | 还没有值（首次读取），或 `phase === 'error'` 之外没有收到任何内容 | `CenteredState`：正在读取目录 |
| 就绪 | 有值，且文件数 + 目录数 > 0 | `StateBlock`：路径 + 「N 个文件 · M 个目录 · 总字节」+ 最大的几个文件列表 |
| 就绪但空 | 有值，但文件数 = 目录数 = 0 | `EmptyState`：这个目录是空的 |
| 出错 | `phase === 'error'` | `CenteredState`：无法读取这个目录 + 宿主返回的原始信息 |

刷新时 `useApiResource` 会把 `phase` 设为 `loading`，**同时保留上一次的 `value`** ——
此时刻意继续显示旧数据（右上角的转圈由 `Card` 的 `refreshing` 表示），不退回骨架：
一次刷新不应让整张卡片闪烁。

## 开发与发布

开发命令见上面的十个脚本；dsh 与工作台的模块约束见工作台模块指引（随工作台发布）；agent 的工作说明见 `AGENTS.md`。

发布（维护者确认后）：`dsh-wb-module release --target team|public|tarball|git`；
`--dry-run` 只预览，`--verify` 只核对已发布的包。
