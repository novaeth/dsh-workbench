# __NAME__

`__UNIT__` 模块：一个独立的 dsh 插件包，只认外壳的服务名，不认识外壳源码。

这份是 **DIY 模板**（`--template diy`）生成的骨架：一张**读当前项目目录的只读卡**，
数据从宿主侧**真读**一个目录算出来（`node:fs`），不是一个写死的样板。

```bash
dsh-wb-module init <unit> --dir <目录> --template diy   # 生成这份骨架（默认模板是没有数据源的空壳）
dsh-wb-module build     # 出 dist/host.js 与套了 loader 壳的 client.js
dsh-wb-module check     # 十三条判据：契约 / 声明协议 / 产物边界 / 源码边界 / 架构 / dsh 原语 / kit 面 / 卡片渲染 / 独立构建 / 内部标识 / 样式归属 / 不指外壳 / 代码卫生（eslint）
dsh-wb-module check --only cards   # 十三条可以单跑
```

包自带的六个脚本（`build` / `typecheck` / `test` / `selfcheck` 是 `check` 的契约判据要求的那四个；`check` 跑全部判据，`lint` 只跑源码卫生那一条）：

```bash
pnpm build        # 构建产物
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest：路由真读数 + 卡片五态
pnpm selfcheck    # 构建 + 把 client.js 当浏览器加载器跑一遍 + 调一次 <unit>/overview 看它真读盘
pnpm check        # dsh-wb-module check
pnpm lint         # dsh-wb-module lint（`--fix` 就地改文件；`check` 永不动手）
```

## 需求底稿（做之前填，做完自己逐条走一遍）

三张表既是**要问清的需求**，也是**最后的验收单** —— 表里每一格 agent 都要在真卡片上见过或点过。
**空着的格就是还没定的事**，别带着空格往下做：落点是同目录的 `design.json`
（`dsh-wb-module design check` 会把空格一格一格列出来），**下面标了 start/end 的那一段就是由它生成的**
—— 要改三张表就改 `design.json`，再 `dsh-wb-module design render`；手改那一段会被 next 一次 check 判红。
所以下次他说"改一下"不用从头问。

怎么问、怎么填：指引 `SKILL.md` 的七步 · `DESIGN.md`（判域 / 两条分工 / 三张表）·
`STEPS.md`（每步问什么、什么时候算做完）· `PANEL.md` · `TOOLS.md` · `LINKAGE.md`。

<!-- dsh-wb:design:start -->
### 表 1 面板：他看什么、他能自己配什么

| 这一格 | 一眼能得出什么结论 | 点一下可以去哪 |
|---|---|---|
| 这个目录占了多少空间 | 该不该清、谁在占 | （本骨架没有外链；要加就把目标写这儿） |

| 能自己配的 | 管什么 | 默认是什么 | 可选值从哪来 | 选错了会怎样 |
|---|---|---|---|---|
| 列几个最大的文件 | 明细长度 | `5` | `1..50` | 夹回范围内，不报错 |

状态矩阵（每种状态：他看到什么 / 他能做什么 / agent 能接着做什么）——
图号对着下面「卡片画哪五态」那一节：

| # | 状态 | 他看到什么 | 他能做什么 | agent 能接着做什么 |
|---|---|---|---|---|
| A | 待机（没选项目） | 「先打开一个项目」，不发请求 | 去左栏开一个项目 | 说清"要先有项目" |
| B | 加载 | 「正在读目录」 | 等 | —— |
| C | 就绪 | 路径 + N 文件 / M 目录 / 总字节 + 最大的几个 | 刷新 | 读一次这一格（联动见表 3） |
| D | 就绪但空 | 「这个目录是空的」 | 换一个目录 | 同上 |
| E | 读不到 | 读不到这个目录 + 宿主的原话 | 重试 / 改路径 | 同上 |

### 表 2 agent：他能替用户做什么、哪几件要点头

| 能力 | 一句话 | 传什么 / 拿回什么（贴真实调用与返回） | 要点头吗 | 点头时他看到的"会发生什么" |
|---|---|---|---|---|
| （这份骨架故意没有能力：`dsh.workbench.tools` 是空的。要加就照这张表填，只读的不点头、动东西的要点头） | | | | |

### 表 3 联动：agent 动完，这个模块哪一格变

| 谁在动 | 面板什么时候变 | 哪一格变（投影 + 最窄那个参数） | 用户看到什么 |
|---|---|---|---|
| agent 读一次这一格 | 读完立刻 | 本单元那条只读投影（`__UNIT__/overview`），只带这个目录 | 那一格变成 agent 看到的那份数 |
| agent 只预览 / 只说了句话 | 不动 | —— | 面板没变 |
| 用户自己按刷新 | 立刻 | 同上 | 转一下，然后是新值 |

### 数据源探明记录

`opencli` 只是**侦察兵**：探明之后固化成**一条**读，日常只走这一条
（这条就是 `src/host.ts` 里那个数据源）。改数据源时先改这张表，再改代码。

| 项 | 值（照抄，别转述） |
|---|---|
| 哪条读（命令 / URL） | 本机目录本身：`readdirSync(path)` + `statSync`（不走网络、不要凭据） |
| 参数（缺省 / 范围 / 上限） | `path` 必填（卡片给当前项目）；`limit` 默认 `5`，夹在 `1..50` |
| 凭据从哪来 | 不需要 |
| 没登录 / 凭据过期时是什么样 | 不适用（本机读盘，没有登录这回事） |
| 超时 / 连不上时是什么样 | 路径不存在 / 没权限 / 不是目录 → HTTP 200 + `ok:false`，码 `overview-unreadable` |
| 当初探明用的那次调用（原文） | `node -e "require('node:fs').readdirSync(process.cwd())"` |

<!-- dsh-wb:design:end -->

## 生成出来的形状

**分层多文件**，不是单文件：数字越小越底层，上层只许 import 下层的（`arch.config.mjs` 那条
`arch` 判据盯着，`dsh-wb-module check` 会跑）。目录**按需要出现**：这份有状态逻辑，所以有 `model/`。

| 文件 | 是什么 | 层 |
|---|---|---|
| `package.json` | 自述清单：`dsh.workbench.unit` = `__UNIT__`、两个面（`src/host.ts` / `src/client.tsx`）、六个脚本、peer 下限 | — |
| `arch.config.mjs` | 本模块的架构方言，**只有两行**（`import { moduleArch }` + `export default moduleArch()`）—— 层序表 / 两个运行时 / 阈值只有 `@dsh-workbench/module-tools/arch` 那一份，随工具链同代 | — |
| `eslint.config.mjs` | 本模块的**语法卫生方言**，同样两行：`moduleLint()` —— 规则表只有 `@dsh-workbench/module-tools/lint` 那一份（`console` / `as any` / hooks 那几条 / 手搓颜色与 `!important`）；要开口子就 `moduleLint({ rules })` | — |
| `cordis.patch.yml` | 插进 dsh 组合的补丁 | — |
| `design.json` | 三张表 + 状态矩阵 + 数据源记录 + 验收清单（**唯一真相**，上面那段由它生成；`dsh-wb-module design check/render/accept` 读写它） | — |
| `src/model/overview.ts` | 纯逻辑：类型 + 五态状态机 + `formatBytes`。两个运行时都读得到，不碰 react / kit / dsh / `node:*` | 1 |
| `src/model/overview.test.ts` | 模型层的配对测试（有 `src/model/**` 就必须有 —— `arch` 的 M08） | 99 |
| `src/messages.ts` | 卡片那几句文案（zh / en），键带 `<unit>.` 前缀 | 1 |
| `src/components/OverviewCard.tsx` | 卡片：`Card` 壳 + 五态（待机 / 加载 / 就绪 / 出错，其中"就绪但空"单列一态）+ 最大的几个文件 | 2 |
| `src/components/OverviewCard.module.css` | 这个组件自己的样式（CSS Modules，构建时类名按路径哈希）—— **样式跟组件同目录** | 2 |
| `src/components/OverviewCard.test.ts` | 这张卡五态各画得出来（测试跟着被测的东西住） | 99 |
| `src/host.ts` | 宿主面：`readOverview()`（真读目录）+ 一条只读路由 `<unit>/overview`；类型从 `./model/overview` 引 | 10 |
| `src/client.tsx` | 浏览器面：**只剩面** —— 注册 + 把 props 交给 `components/OverviewCard` | 10 |
| `src/plugin.test.ts` | 面注册 + 路由真读的断言 | 99 |
| `scripts/smoke.mjs` | 接线自检：卡片进没进外壳、路由真读没真读 | — |
| `tsconfig.json` / `vitest.config.ts` / `types/globals.d.ts` / `types/styles.d.ts` | 经典 JSX 运行时（`jsxFactory: h`）、vitest 的别名、浏览器半侧的运行时垫片、`*.module.css` 的类名表声明 | — |
| `README.md` | 就是本文 | — |

## 数据是在哪算出来的

宿主侧，`src/host.ts` 的 `readOverview(path, limit)`：

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
每个分支各对应一屏（`src/model/overview.test.ts` 直接断言这条函数，
`src/components/OverviewCard.test.ts` 再把每一屏画一遍）：

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
