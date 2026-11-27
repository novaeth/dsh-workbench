# @dsh-workbench/module-tools

工作台**模块**的工具箱：创建骨架、构建、运行自动检查（门禁）、管理设计记录（底稿）、发布前核对清单。
模块作者只需要用这几条命令，模块包不再各自携带一份构建脚本。

## 常用命令

```bash
pnpm exec dsh-wb-module init my-unit                    # 创建骨架（唯一模板，已默认）
pnpm build        # 生成 dist/host.js 与带加载器包装的 client.js
pnpm check        # 十五条检查项（判据）
pnpm design check # 检查设计底稿的空白项、README 是否覆盖能力 / 配置 / 状态 / 审批，以及两份文档是否过期
```

发布前再运行一步 `pnpm exec dsh-wb-module publish`：运行门禁、核对 `files` 与 `npm pack` 清单，默认**只执行 dry run，不会实际发布**。
维护者确认要实际发布时运行 `pnpm exec dsh-wb-module release`：全部门禁（build / check / design / typecheck / test / selfcheck）、
验收项必须全部勾选、预检（登录 / license / git 远端）、按 `--target` 发布到团队源、公网 npm、安装包或 git，
最后从发布出口核对包（`--dry-run` 只预览，`--verify` 只核对已发布的包，`--preflight` 只做发布前检查：
不运行门禁、不写盘、不发布；工作台在显示发布审批之前先用它报出还缺什么）。配了可写 git 模块来源时，
发布完成后还会写入索引条目（`--index auto|none|<目录|git 地址>`，`artifacts-in-repo` 连同产物一起入库，
`catalog-only` 只更新索引）；索引未更新不影响包已发布，结果中会如实说明。
发布可选 `--index-source <id>` 指定发到哪个模块来源；不指定时使用唯一可发布的来源，有多个可发布来源时会要求指定。
空仓库先运行 `dsh-wb-module market-init <git 地址>`：生成索引目录 `market/` 与 README，并推送首个 commit
（使用仓库声明的默认分支；无法读取时用 `--ref` 指定）。在工作台里配了可写模块来源之后，
`release` 的默认发布出口是 `market`：产物与索引一起进入该仓库。
发布过程中每一步都写进 `$DSH_WORKBENCH_HOME/releases/<unit>.json`（默认 `~/.dsh/workbench`）；中断后带 `--resume` 继续发布
（沿用记录里的出口、版本与索引计划，产物没变就不重新运行门禁）。
该版本在 `CHANGELOG.md` 中没有记录时，带 `--changelog-note "这一版改了什么"`
（`--changelog-type` 选择分类，缺省 changed）发布一次即可写入；文件不存在时会先创建；
未提供 note 且没有记录时，`release` 会在运行任何门禁之前停止。
更新日志在确认后写入；发布失败不回滚：该版本已经记录，下一次发布直接使用。
`package.json` 缺 `files` 里的 `CHANGELOG.md` 同样会阻止发布；`author` 未填写时从本机 `git config` 补齐到 `package.json`，索引与产物都会包含。
标签只写在模块市场条目上（`metadata.labels`），**不写进 `package.json`**：清单的键是协议定死的
（`apiVersion` / `unit` / `title` / `card` / `tools` / `host` / `needs`），写入协议未定义的键会被 check 判定失败。
标签可选：`--label <短词>`（可重复，最多两个）并进索引条目的 `metadata.labels`；
不传则沿用旧清单中已有的值（`dsh.workbench.market.labels`，只在读那一侧认）。
分类 `--category <短词>` 是市场发布的要求：条目还没有分类时必须提供一个（会被工作台的发布审批拦截），
已有分类可以不带；它写入 `metadata.category`，发现页的分类标签按它汇总，新模块新增一个分类，页面会自动多一个。
标题、署名与说明保持索引中的现有内容不变。
需要更换署名时传入 `--author "姓名 <邮箱>"`（或只给姓名）：它写回 `package.json`，索引、产物与提交都用它，
`--refresh` 时也一样。**发布本身不改模块市场里的标题 / 署名 / 说明**：这些元数据只由 `--refresh`（或显式 `--author`）写，
避免一台尚未更新的机器发布新版本时覆盖别人刚修改的元数据。一个包名归第一次发布的人（条目文件里的 `owner`）：更换署名后发布同名包会被拒绝，
`--refresh` 也一样 —— 确实需要更换作者时，先修改那一条的 `owner`。
同一个市场里，一个模块 id（`dsh.workbench.unit`）只能被一个条目使用；产物目录按包名走
（`artifacts/<包名>/`）：更换包名但沿用旧 unit，或两个条目使用同一个标识或目录，都会被拒绝。

骨架自带脚本，日常无需记长命令：`build` · `typecheck` · `test` · `selfcheck` · `check` · `check:duplication` · `duplication:report` · `lint` · `design`。

## 命令

| 命令 | 作用 |
|---|---|
| `dsh-wb-module init <unit> [--dir <目录>] [--template diy] [--description "一句话"]` | 创建模块骨架（只有 `diy` 一个模板，也是默认） |
| `dsh-wb-module market-init <git 地址\|目录> [--ref <分支>] [--path <索引路径>]` | 初始化市场索引仓库：写 `market/` + README，推首个 commit |
| `dsh-wb-module build` | 生成 `dist/host.js`（单文件 ESM）与 `client.js`（带加载器包装），并推送给运行中的工作台 |
| `dsh-wb-module build --watch` | 常驻：修改 `src/**` 后自动重建并推送；按 `Ctrl-C` 退出 |
| `dsh-wb-module check [--only <判据>] [--package <包名或 unit>]` | 十五条检查项（判据）；`--only` 单独运行，也作为查询入口；`--package` 只检查这个模块 + 工作区级不变量（见下）；`--list [--json\|--markdown]` 只列判据元数据 |
| `dsh-wb-module lint [--fix]` | 使用模块自己的 `eslint.config.mjs`；`--fix` 直接修改文件 |
| `dsh-wb-module sync` | 按清单生成 `src/declared-tools.ts` 与 `src/sites.ts`（清单有站点表时），按 `design.json` 的 `key + recipe` 生成 `src/datasource.ts` |
| `dsh-wb-module design <init\|migrate\|check\|render\|accept>` | 设计底稿：填写、拆分旧 README、检查空白、生成 README 与 DEVELOPING、验收勾选 |
| `dsh-wb-module migrate [--dry-run]` | 将模块清单迁移到当前版本：`apiVersion` → 3、缺失或为空的 `workbenchFaces` 补充默认值；源码类问题只提供提示（check 会指出） |
| `dsh-wb-module changelog check [版本]` | 检查该版本是否已有记录；发布时通过 `release --changelog-note` 写入 |
| `dsh-wb-module publish` | 发布前清单：门禁 + `files` + `npm pack`（只执行 dry run） |
| `dsh-wb-module release` | 实际发布：team / public / tarball / git / market / local；发布前检查 + 全部门禁 + 验收门禁 + 发布后核对 + 更新市场索引（`--dry-run` 只预览、`--verify` 只核对、`--preflight` 只做发布前检查） |

`--cwd <目录>` 指定**工作目录**，默认当前目录。注意判据仍按**工作区**发现模块：往上找
`pnpm-workspace.yaml`（或 `package.json` 的 `workspaces`），按它声明的 glob 展开包目录
（`packages/**`、`apps/*`、多层目录都行；没有声明时退回 `packages/*`）——`--cwd` 不会把检查范围缩小到一个模块。
只查看某个模块时使用 `check --package <包名或 unit>`。

`--package` 是**单模块门禁**：单模块判据只在它上面运行；单元 id 重复、供应来源冲突、
工作台源码点名模块这三类**工作区级不变量**仍按全工作区校验。`release` / `publish` 用的就是这一档，
所以兄弟模块自己的问题（文案、审批、卡片、lint）不会挡住本模块发布。
要列整仓状态（CI、批量发版前）在仓库根跑不带 `--package` 的 `check`。
要让判据只检查一个包、且不跑工作区级不变量，用环境变量 `DSH_WB_ROOT=<包目录>`（工具链自己的自检就是这么隔离的）。

## 十五条判据

`dsh-wb-module check` 一次运行完成十五条检查项（判据），三态输出：`✔ 通过` / `○ 不适用` / `✖ 未通过`；存在未通过项时退出码为 1。

表由 `dsh-wb-module check --list --markdown` 生成；`层` 是 manifest / source / build / render / meta。

<!-- dsh-wb-module:begin checks -->
| 判据 | 层 | 摘要 |
|---|---|---|
| `contracts` | manifest | 单元 id、两个面、四个脚本、peer 依赖存在，以及清单与代码注册对账；站点表引用 / 未用 / origins / 信封 |
| `protocol` | manifest | dsh.workbench 的 apiVersion、静态半形状与未知键 |
| `combo` | manifest | 声明了 dsh.workbench 的模块不要声明 dsh.bundle（装载只走 profile 依赖 + wb 行）；私有包跳过 |
| `bundles` | build | 宿主产物不含浏览器侧、浏览器产物不内联工作台 CSS 与夹具 |
| `source` | source | 零注释、包与运行时入口分开、不手写进程/锁/原子写 |
| `seam` | source | 子进程只通过 deps.seam 门面；不直接取原始 shell / 不直接使用 child_process；清单 writes 与请求一致 |
| `arch` | source | 模块自己的层序、运行时边界与设计系统配置 |
| `lint` | source | 模块自己的 eslint.config.mjs 与规则集 |
| `primitives` | build | dsh 包只从 kit 取，模块自己声明 external |
| `kit` | build | 模块产物对得上所装工作台的 kit 面与 peer 下限 |
| `cards` | render | 八态 × zh/en 渲染：不抛出异常、不空白、不显示裸键名 |
| `standalone` | build | 工作台源码不在场时仍能 build + typecheck |
| `markers` | meta | 公开包不含私有源、私网 IP、内部域名后缀 |
| `style` | source | 不定义 wb-* 规则；裸标签控件改用 kit；令牌名对当前读取的清单校验 |
| `alias` | source | 模块源码中没有指向工作台的 @/ 引用 |
<!-- dsh-wb-module:end checks -->

`style` 还查**令牌名**：模块源码里每个 `var(--dsw-* | --wb-*)` 都要在现读的清单里 ——
`--dsw-*` 从已安装的 dsh 主题读取、`--wb-*` 从工作台发布产物的 `client.js` 读取；无法读取的那一份不判定失败，只记录一条
「本次未验证」。拼写错误的名称按最接近的候选名称提示（`workbench_diy_surface` 的 `scope: 'tokens'` 是同一个来源）。

`style` 还有两族更窄的判据：**手写的「标签 + 控件」行与手写的操作区**判定失败（归 kit 的
`FormRow(s)` 与 `FormActions`），**裸 `<form>` 与手写整张表单**也判定失败（归 `Form`）。
现有违规收在各自的例外清单（豁免表）里，只减不增（棘轮）：迁一处删一行，表中已不再命中的行也会当场判定失败。
判据**刻意保守** —— 模块自己用 div 拼一张不借用槽类的表单不判；范围过宽会导致每次修改界面都先触发门禁。

### `seam`：模块只走命令执行入口（执行缝）的统一入口（门面）

模块在宿主侧（dsh 进程）启动子进程，只能走工作台放进 `mount(deps)` 的门面 `deps.seam`。判据查三件事：

- 宿主侧可达的源码里不许出现 `runShell` / `shellOf`、`ctx.get('shell')` / `ctx.get('workbenchShell')` /
  `ctx.get('seam')`、`node:child_process` / `child_process`；
- `dsh.workbench.host.writes` 只认 `"unit"` / `"workspace"` 两档（`protocol` 判据也检查形状，这里再检查一次）；
- 源码里以 `scope: 'unit'` / `scope: 'workspace'` 请求的档，清单 `host.writes` 里必须有。

修法：清单里写 `"host": { "inject": [], "writes": ["unit"] }`，代码里
`deps.seam?.run({ scope: 'unit', command })`。`unit` 档可写 `<运行时根>/units/<unit>/`（模块自己的数据目录，
`HOME` 与 npm/pnpm 缓存也注入在那里），`workspace` 档写当前会话工作区、还要带上会话对象；
不写 `writes` 就不会提供门面（`deps.seam` 为 `undefined`）。模块宿主代码与工作台同进程 —— 这层是
**约定 + 门禁 + 定位来源（归因）**，不是安全边界。完整写法见
[BUILD.md](../core/skills/workbench-module-diy/BUILD.md) §5。

### `arch`：模块包的分层规则集（方言）

卡片变复杂后，代码容易堆积在 `src/client.tsx`，宿主侧还会顺便 import 一个组件（`dist/host.js` 在 Node 里
无法加载）。边界判据无法覆盖这些，`arch` 补充这一层。模板里的配置只有一行：

```js
import { moduleArch } from '@dsh-workbench/module-tools/arch';
export default moduleArch();
```

方言只有一份，随工具链与工作台同代，不要求每个模块复制一份。层序：

| 落点 | 层 | 是什么 |
|---|---|---|
| `src/model/**` | 1 | 纯逻辑：类型 / 换算 / 状态机。不碰 react / kit / dsh / `node:*` |
| `src/messages.ts` | 1 | 文案（zh / en） |
| `src/components/**` | 2 | 浏览器侧视图件；样式与它同目录（`X.module.css`） |
| `src/host.ts` · `src/client.tsx` | 10 | 两个面 |
| `src/host/**` | 10 | 宿主侧内部实现（按需出现）：`moduleArch()` 默认识别这一层；对外仍只有 `src/host.ts` 一个面 |
| `src/**/__tests__/**` | 99 | 测试：位于**被测代码同目录**的 `__tests__/`；位于 `src/` 其他位置的 `.test.ts(x)` 会触发 S74 |

两个运行时靠另一条规则隔离：`src/components/**` 整片算浏览器面，宿主侧 import 一个组件会直接判定失败
（层号拦不住它：components 第 2 层、host 第 10 层）。`src/host/**` 与两个面同层（10），
所以浏览器面从它 import 时层号不会报告失败 —— 运行时边界需要自行维护。内置阈值比 arch-guard 默认更严：
文件与视图各 200 行、函数 80 行；`src/model/**` 有文件就必须有测试（`__tests__/` 下 —— M08），
测试文件不在 `__tests__/` 中会触发 S74。

需要例外时**通过参数配置**（不要修改判据；每个例外都有名称，评审可追溯）：

```js
export default moduleArch({
  fileLines: 300,
  deps: ['some-sdk'],
  layers: { adapters: 2 },
  roles: [{ id: 'lib:version', pattern: 'src/version.ts', layer: 1 }],
  exceptions: [{ rule: 'S16', glob: 'src/components/Legacy.tsx', reason: '待拆分，见 #123' }],
});
```

`exceptions` 每条必须写 `reason`。如何解读失败、常见失败原因与可用例外，见
[REVIEW.md](../core/skills/workbench-module-diy/REVIEW.md)。

宿主面写到 200 行仍然超出时，将内部实现拆分到 `src/host/**`（`diy` 模板就这么做，
`moduleArch()` 默认识别这一层）。**不要**把它做成第三个
`dsh.workbenchFaces` 入口 —— 两个面不可更改。

### `lint`：模块包的语法规则集（方言）

`arch` 负责结构，`lint` 负责单文件：`as any` 绕过接口约定（契约）、残留的 `console.log` / `debugger`、
TS 内联样式中的颜色字面量与 `!important`、react-hooks 相关规则。模板里的配置只有两行：

```js
import { moduleLint } from '@dsh-workbench/module-tools/lint';
export default moduleLint({ rootDir: import.meta.dirname });
```

`moduleLint()` 返回一份**标准 flat config**：它同时是判据运行的那份与编辑器 / `eslint` 认的那份，
没有第二份定义。依赖（`eslint`、`typescript-eslint`、两个 react 插件、`globals`）统一安装在 module-tools 中，
模块清单无需修改（依赖由 module-tools 自带）。

需要例外时，通过命令参数配置 `moduleLint({ rootDir, ignores, rules })`；也可以展开它再追加自己的一块：

```js
export default [
  ...moduleLint({ rootDir: import.meta.dirname, rules: { 'no-console': 'off' } }),
  { files: ['src/legacy/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
];
```

指纹逐块比对整份方言：方言的 8 个块在模块配置中必须全部存在且逐项一致；缺少一块、同名两次、
删除一条规则或修改一个值都会判定失败。只写一个同名块、`export default []`、语法错误的配置都会判定失败。
`scripts/**` 与 `*.config.*` 不判 `no-console`（脚本打印属于其职责）。

`dsh-wb-module lint --fix` 先写回文件再运行一次，查看剩余问题。**`check` 从不修改文件**：
门禁是判据，不负责修复。

模板生成三份文档：`readme.json` 是终端用户文案源（标题、简介、卡片布局草图 `shots[]`、会看到什么、能做什么、agent 能做什么、数据从哪来、排障、FAQ，后五段是短条目），`README.md` 只由它生成；`DEVELOPING.md` 是作者文档（实现、路由、判据、数据源与三张表），由 `design.json` 生成。`design render` 刷新这两份；`design check` 拦截空文案、占位符、技术词、缺绑定、缺审批图与标题不一致，全部按错误处理。`agent[]` 绑 `capabilities[].name`、`do[]` 绑 `config[].key`、`trouble[]` 绑 `states[]`，`shots[]` 用 `kind` 标卡片与审批；有写工具就必须有审批图。`release` 在 `check` 之后直接运行 `design check`。旧模块先运行 `design migrate`，它把旧 `README.md` 原样保存为 `DEVELOPING.md`，再生成 `readme.json` 与用户 README；已有 `readme.json` 的模块按上面的绑定补齐。

## `design.json`：三张设计表

面板 / 能力 / 联动三张设计表、状态矩阵、数据源记录、写通道记录与验收清单都位于模块根目录的
`design.json`，DEVELOPING.md 里那一段由它生成（夹在 `<!-- dsh-wb:design:start/end -->` 之间）。README.md 的用户文案只看模块根的 `readme.json`；其中 `agent` / `do` / `trouble` 的绑定字段与 `design.json` 的能力、配置、状态对账，`shots` 的 `kind` 与清单的写工具对账。

它是**设计底稿**：三张表与探明记录使用人话（`oneLine` / `shape` / `approvalText` / 三张表的文字）；
读源那一条可以多带 `key` 与 `recipe` 两个机器字段 —— 它们只用于生成 `src/datasource.ts`，
不改变"人话那一份"（`read` / `params` / `credentials` / `notLoggedIn` / `timeout`）照写。「这项能力在哪些工作区出现」不在底稿中，也不在清单中：由用户的面板配置决定。
`contracts` 会把底稿的能力名与清单的工具名核对键集合（不重复、不遗漏，只比较名称）；没有
`design.json` 的模块不查。

有写能力的模块另在 `writes[]` 中记录命令 / 入参 / 出参 / 预览档 / 回读 / 失败形状，
渲染成 DEVELOPING.md 里的「写通道探明记录」。没有写通道时无需填写，不会因此判定失败。
写操作也可以配置配方：`writes[]` 里加一对 `key` + `recipe`，`sync` 将其与读操作一起生成到
`DATASOURCE`（`data.submit(DATASOURCE.<key>)`）；配方无法覆盖的写操作使用 `custom: { why }`（记录一条警告）。

### 读源配方

一条读可以带 `key`（lowerCamelCase）和 `recipe`：

```json
"datasource": {
  "key": "balance",
  "recipe": {
    "origin": "https://x.example.com",
    "request": { "method": "GET", "path": "/api/balance" },
    "response": { "kind": "json", "path": "data" }
  },
  "read": "GET /api/balance（登录态 cookie）",
  "params": "无",
  "credentials": "同源 cookie",
  "notLoggedIn": "401 → auth",
  "timeout": "25 秒"
}
```

`sync` 会把它们生成成 `src/datasource.ts`（`export const DATASOURCE = { balance: … } as const`），
模块代码只写 `data.request(DATASOURCE.balance)`。一条读要一次打多条同源接口时，再加一格 `calls`：

```json
"datasource": {
  "key": "wallet",
  "recipe": { "origin": "https://x.example.com", "request": { "method": "GET", "path": "/api/subscription/self" } },
  "calls": {
    "balance": { "path": "/api/wallet/balance", "response": { "path": "data.balance" } },
    "usage": { "query": { "days": 7 } }
  }
}
```

生成的 `src/datasource.ts` 多一个 `export const DATASOURCE_CALLS = { wallet: { … } } as const`，
代码写 `data.requestMany(DATASOURCE.wallet, DATASOURCE_CALLS.wallet)`：一次复用登录态、并发请求，
每个调用各自返回结果。`calls` 的键就是结果名；`path` / `query` / `headers` / `response` 覆盖配方同名默认值。
几条规则：

- `key` 与 `recipe` **要么都写、要么都不写**；只写一个不生成、也不校验（旧条目保持不变）。
- 写走同一份生成物：`writes[]` 的 `key + recipe` 也进 `DATASOURCE`；读与写的 `key` 不得重复，
  `design check` 会指出。
- `recipe` 与 `custom` 二选一。`custom: { why }` 表示"配方无法覆盖，仍用旧的 `browser` 脚本"，
  `design check` 记录一条警告，脚本留在代码里。
- `design check` 校验配方与批量：枚举、`origin` / `path`、`request.headers` 中不得写入凭据头、
  `maxBytes`、`GET` 不带 body；`calls` 非空、≤ 8 条、逐项使用同一套校验，且必须配 `recipe`。
  生成物过期会被 `contracts` 指出，运行 `sync` 刷新。
- 形状与六种配方见模块 DIY 的 [`DATASOURCE.md`](../core/skills/workbench-module-diy/DATASOURCE.md)。

```bash
dsh-wb-module design check    # 逐格列出空白项，并检查能力 / 配置 / 状态覆盖、审批图、标题，以及 README / DEVELOPING 是否过期
dsh-wb-module design render   # 用 readme.json 重新生成 README，用 design.json 刷新 DEVELOPING 那一段
dsh-wb-module design accept   # 在真实卡片上逐条验证后勾选
```

## 协议：`package.json` 里的五段

| 段 | 是什么 | 谁读 |
|---|---|---|
| `dsh.bundle.patch` | 只有**组合包**才需要：把自己插进 profile 组合图的 cordis 补丁。工作台模块**不要声明它**（由市场装成 profile 依赖 + 一行）；老包仍声明 `dsh.bundle` 时只作兼容，装载按「在不在 `dsh.profile.bundles` 里」判 | dsh 的组合器（装载） |
| `dsh.client{platform,inject,external}` | 浏览器侧接线 | dsh 的客户端组合器（dsh 不校验，错误的声明要等到浏览器 `require` 时才报错，因此由 `contracts` 检查） |
| `dsh.workbench` | **模块声明协议** | 门禁 · 市场 · 工作台 |
| `dsh.workbenchFaces{host,client}` | **工具链元数据**（不在协议里）：两个面的源码入口 | 门禁：`source` 拿它算可达性、`contracts` 查它在位；运行期不读 |
| `peerDependencies['@dsh-workbench/core']` | 服务面：工作台 provide 的服务在不在 | dsh 的兼容性预检 |

```jsonc
"workbench": {
  "apiVersion": 3,
  "unit": "hello",
  "title": { "zh": "示例模块", "en": "Sample module" },
  "card": { "order": 90 },
  "tools": [{ "name": "hello_read", "writes": false }],
  "host": { "inject": [] },
  "needs": [
    {
      "kind": "extension",
      "runtime": "opencli",
      "name": "acme-workflow",
      "commands": ["acme-read"],
      "purpose": "读写工单",
      "sources": [{ "kind": "npm", "package": "opencli-plugin-acme", "registryEnv": "ACME_REGISTRY" }]
    }
  ]
},
"workbenchFaces": { "host": "src/host.ts", "client": "src/client.tsx" }
```

五条口径：

1. **声明了 `apiVersion` = 静态半写全了**：`unit` / `title` / `card` / `tools` / `host` 五个键都要有
   （没有卡片写 `null`），`needs` 没有外部需要时省略。名字是包里的字面量（中英各一份），
   不是词表键 —— 宿主在模块载入之前就读得到它。
   `needs` 四种 `kind`：`bin` / `extension` / `lib` / `env`；每条必写 `purpose`；
   未知 `kind` 或 `sources[].kind` 判定失败，need 里未知字段只算警告（`x-` 前缀忽略）。
2. **不许有协议不认识的键**：未知字段会被工作台静默忽略（拼错一个键就等于那句话没写），
   `protocol` 先拦。`scope` 不在协议里 —— 能力出现在哪些工作区只由用户的面板配置决定。
3. **清单声明的工具 = 代码真正注册的工具**：清单是工具面的唯一来源，两边不一致就判定失败。
4. **底稿与清单只核对键集合**，只比较名称，内容各写一处。
5. **`dsh.workbenchFaces` 不是协议的一部分，但门禁必填**：它指向两半的**源码**，不能指向出货
   产物 —— 从 `dist/host.js` 无法反推是哪份源码引入了 dsh 的包。

## 模板

只有**一个**模板（`diy`，也是默认）：一份可直接运行的样板 —— 宿主侧三条只读路由实际读取磁盘、卡片五种状态（五态）与写失败提示、
预置占位（`（待填）`）的 `design.json`（填写完成后 `design check` 才能通过），外加一条可运行的长任务、两个工具（一个只读、一个可写）、动作通道与 prefs。维护两份模板的成本过高，因此不再提供 `minimal` 空模板；需要空骨架时，从 `diy` 中删除数据源相关段落。

它是**分层多文件**骨架：纯逻辑位于 `src/model/**`、视图件与同目录样式位于 `src/components/**`、
文案位于 `src/messages.ts`，测试位于被测代码同目录的 `__tests__/`，两个面只保留注册与传递 props；宿主侧内部实现位于 `src/host/**`
（`moduleArch()` 默认识别这一层）。带一份 `arch.config.mjs`、两行的
`eslint.config.mjs` 与一份 `.gitignore`（依赖、构建产物、报告与安装包）。

`init` 将模板中的 `*.tpl` 一并复制，按已知 token 名逐个替换（`__UNIT__` / `__NAME__` / `__DESC__` /
`__SHELL_RANGE__` / `__DSH_UI_VERSION__`）、移除后缀，再用 `readme.json` 生成 README、用 `design.json` 生成 DEVELOPING 那一段。
模板里的 `.gitignore` 存成 `.gitignore.tpl`：npm 打包时会排除字面 `.gitignore`（以及 `.npmignore` / `.npmrc`），
从 npm 安装到的模板就缺这份文件；`.tpl` 后缀让 `init` 去掉后缀生成它，内容里没有 token。
`__SHELL_RANGE__` 取 init 所在工程实际安装的工作台版本；无法读取时回退到 module-tools 自己的版本；
两者都读不到才保持 `^0.1.0` 并在 stderr 输出一条提示。

## 自己的自检

```bash
node scripts/selfcheck/index.mjs --shards
```

`--shards` 把判据按序号轮转切成几片并行执行，片数默认取 `min(4, CPU 核数 / 2)`；`--shards 1` 走单进程，
`--shards 8` 指定片数。`--timing` 在每条判据后打印耗时。分片各自使用独立临时目录；`packages/` 下 `.init-*`
残留那条判据固定留到父进程收尾时执行。

工具箱的回归测试：模板 `init` 一遍、运行全套（含生成的 `.gitignore`）；判据的正例与负例都要通过；打包清单不含
`.tpl` 残留、模板里没有 npm 打包会排除的点文件；`design` 的空格、README / DEVELOPING 同步、`accept`；`publish` 的清单；`release` 的验收门禁、
dry-run、实际发布后的元数据与发布失败回滚。

## 相关文档

| 想了解 | 读 |
|---|---|
| 模块怎么写、DIY 整套流程 | [workbench-module-diy](../core/skills/workbench-module-diy/SKILL.md) |
| 构建骨架、接线（bundle / client / 注册） | [BUILD.md](../core/skills/workbench-module-diy/BUILD.md) · [WIRING.md](../core/skills/workbench-module-diy/WIRING.md) |
| kit 组件与 hooks | [KIT.md](../core/skills/workbench-module-diy/KIT.md) |
| 面板、状态矩阵、界面规则 | [PANEL.md](../core/skills/workbench-module-diy/PANEL.md) |
| 工具、审批、长任务 | [TOOLS.md](../core/skills/workbench-module-diy/TOOLS.md) |
| 如何解读判据失败 | [REVIEW.md](../core/skills/workbench-module-diy/REVIEW.md) |
| 最小可安装样本 | [module-hello](../module-hello/README.md) |
| 接口约定（契约）类型与共享组件 | [shared](../shared/README.md) |

模块的 `apply(ctx)` / `mount(deps)` 只拿工作台自己的类型（`HostContext` / `ClientContext` /
`ToolDefinition` / `ToolRegistry` / `ToolRunContext`，都在 `@dsh-workbench/core/contract`）；
要用 dsh 的官方类型，把对应包放进**模块自己的** `devDependencies`，不要放进 `dependencies`。
