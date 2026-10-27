# @dsh-workbench/module-tools

工作台**模块**的工具箱：建骨架、构建、过门禁、管设计底稿、发货前核清单。
模块作者只跟这几条命令打交道 —— 模块包里不再各带一份构建脚本。

## 六条命令走一遍

```bash
pnpm exec dsh-wb-module init my-unit --template diy   # 建骨架（minimal 是默认）
cd my-unit && pnpm install
pnpm build        # dist/host.js + 套了 loader 壳的 client.js
pnpm check        # 十三条判据
pnpm design check # 设计底稿有没有空格、README 有没有落后
```

要发货再加一步 `pnpm publish`：跑门禁、核 `files` 与 `npm pack` 清单，**只 dry run，不真发**。
维护者确认要真发时跑 `pnpm exec dsh-wb-module release`：全门禁（build / check / design / typecheck / test / selfcheck）、
验收必须全勾、预检（登录 / license / git 远端）、按 `--target` 发到团队源 / 公网 npm / 安装包 / git，
最后从出口侧核包（`--dry-run` 只预览，`--verify` 只核已发布的包）。配了可写 git 索引源时，
发完还会更新 `market.json`（`--index auto|none|<目录|git 地址>`，`artifacts-in-repo` 连产物一起入库，
`catalog-only` 只更索引）；索引没更上不影响包已发布这件事，结果里会如实写。
发布可选 `--index-source <id>` 指定发到哪个索引源；不指定时用唯一可发布的源，有多个可发布源会要求指定。
空仓库先跑 `dsh-wb-module market-init <git 地址>`：生成 `market.json` 与 README 并推首个 commit
（用仓库声明的默认分支，读不到时用 `--ref` 指定）。在工作台里配了可写索引源之后，
`release` 默认出口就是 `market`：产物与索引一起进那个仓库。
发布过程中每一步都写进 `~/.dsh/workbench/releases/<unit>.json`；中断后带 `--resume` 接着发
（沿用记录里的出口、版本与索引计划，产物没变就不重跑门禁）。
这一版在 `CHANGELOG.md` 里没有记录时，带 `--changelog-note "这一版改了什么"`
（`--changelog-type` 选分类，缺省 changed）发一次就写进去，文件不在会先建骨架；
没带 note 又没记录时 `release` 在跑任何门禁之前就拦下。
日志写在确认之后，发失败不回滚：这一版已经记下了，下一次发布直接用。
`package.json` 缺 `files` 里的 `CHANGELOG.md` 一样拦下；`author` 没写时从本机 `git config` 补进 manifest，索引与产物都带上。
模块的 `package.json` 可用 `dsh.workbench.market` 声明 `category` 与 `labels`（字符串数组）；
不写就不带分类和标签，索引里只留 `metadata.workbench: true` 这条身份标记。
要换署名时带 `--author "姓名 <邮箱>"`（或只给姓名）：它写回 `package.json`，索引、产物与提交都用它，
`--refresh` 时也一样。一个包名归第一次发布的人（`market.json` 里的 `owner`）：换署名发同名会被拒，
`--refresh` 也一样 —— 真要换人，先改那一条的 `owner`。
一个模块 id（`dsh.workbench.unit`）同时只归一个条目，产物目录按包名走（`packages/<包名>/`）：
换一个包名沿用旧 unit、或两个条目撞同一个产物目录，都会被拒。

骨架自带脚本，日常不用记长命令：`build` · `typecheck` · `test` · `selfcheck` · `check` · `lint` · `design`。

## 命令

| 命令 | 作用 |
|---|---|
| `dsh-wb-module init <unit> [--dir <目录>] [--template minimal\|diy] [--description "一句话"]` | 建模块骨架 |
| `dsh-wb-module market-init <git 地址\|目录> [--ref <分支>] [--path <索引路径>]` | 初始化市场索引仓库：写 `market.json` + README，推首个 commit |
| `dsh-wb-module build` | 出 `dist/host.js`（单文件 ESM）与 `client.js`（套 loader 壳） |
| `dsh-wb-module check [--only <判据>]` | 十三条判据；`--only` 单跑，也当查询口用；`--list [--json\|--markdown]` 只列判据元数据 |
| `dsh-wb-module lint [--fix]` | 用模块自己那份 `eslint.config.mjs`；`--fix` 写回文件 |
| `dsh-wb-module sync` | 按清单生成 `src/declared-tools.ts`，按 `design.json` 的 `key + recipe` 生成 `src/datasource.ts` |
| `dsh-wb-module design <init\|check\|render\|accept>` | 设计底稿：填、查空格、生成 README、验收打勾 |
| `dsh-wb-module changelog check [版本]` | 查这一版有没有记录；发布时用 `release --changelog-note` 写进去 |
| `dsh-wb-module publish` | 发货前清单：门禁 + `files` + `npm pack`（只 dry run） |
| `dsh-wb-module release` | 真发布：team / public / tarball / git；全门禁 + 验收闸 + 预检接管 + 发后核包 + 更新市场索引（`--dry-run` / `--verify`） |

`--cwd <目录>` 指定包目录，默认当前目录。

## 十三条判据

`dsh-wb-module check` 一次跑完，三态输出：`✔ 通过` / `○ 不适用` / `✖ 不过`；有任何不过就退出 1。

表由 `dsh-wb-module check --list --markdown` 生成；`层` 是 manifest / source / build / render / meta。

<!-- dsh-wb-module:begin checks -->
| 判据 | 层 | 摘要 |
|---|---|---|
| `contracts` | manifest | 单元 id、两个面、四个脚本、files、peer 下限，以及清单与代码注册对账 |
| `protocol` | manifest | dsh.workbench 的 apiVersion、静态半形状与未知键 |
| `bundles` | build | 宿主产物不含浏览器侧、浏览器产物不内联外壳 CSS 与夹具 |
| `source` | source | 零注释、包与运行时入口分开、不手写进程/锁/原子写 |
| `arch` | source | 模块自己的层序、运行时边界与设计系统配置 |
| `lint` | source | 模块自己的 eslint.config.mjs 与规则集 |
| `primitives` | build | dsh 包只从 kit 取，模块自己声明 external |
| `kit` | build | 模块产物对得上所装外壳的 kit 面与 peer 下限 |
| `cards` | render | 八态 × zh/en 渲染：不抛、不空白、不冒裸键名 |
| `standalone` | build | 外壳源码不在场时仍能 build + typecheck |
| `markers` | meta | 公开包不含私有源、私网 IP、内部域名后缀 |
| `style` | source | 不定义 wb-* 规则；裸标签控件改走 kit；令牌名对现读的清单校验 |
| `alias` | source | 模块源码里没有指向外壳 @/ 的引用 |
<!-- dsh-wb-module:end checks -->

`style` 还查**令牌名**：模块源码里每个 `var(--dsw-* | --wb-*)` 都要在现读的清单里 ——
`--dsw-*` 从装着的 dsh 主题读、`--wb-*` 从外壳出货的 `client.js` 读；读不到的那一份不判红，只记一条
「这次没验」。拼错的名字按最近的几个候选点名（`workbench_diy_components` 的 `scope: 'tokens'` 是同一个来源）。

`style` 还有两族更窄的判据：**手写的「标签 + 控件」行与手写的操作区**判红（归 kit 的
`FormRow(s)` 与 `FormActions`），**裸 `<form>` 与手写整张表单**也判红（归 `Form`）。
现存违规收在各自的豁免表里，是棘轮：迁一处删一行，表里已经不再命中的行也会当场报红。
判据**故意窄** —— 模块自己用 div 拼一张不借槽类的表单不判，判宽了就是每次改界面都先撞门禁。

### `arch`：模块包的分层方言

卡片一复杂就往 `src/client.tsx` 里堆，宿主侧顺手 import 一个组件（`dist/host.js` 在 Node 里
根本起不来）—— 边界判据拦不住这些，`arch` 补这一层。模板里的配置只有一行：

```js
import { moduleArch } from '@dsh-workbench/module-tools/arch';
export default moduleArch();
```

方言只有一份，随工具链与外壳同代，不要求每个模块抄一份。层序：

| 落点 | 层 | 是什么 |
|---|---|---|
| `src/model/**` | 1 | 纯逻辑：类型 / 换算 / 状态机。不碰 react / kit / dsh / `node:*` |
| `src/messages.ts` | 1 | 文案（zh / en） |
| `src/components/**` | 2 | 浏览器侧视图件；样式与它同目录（`X.module.css`） |
| `src/host.ts` · `src/client.tsx` | 10 | 两个面 |
| `**/*.test.ts(x)` | 99 | 测试 |

两个运行时靠另一条规则隔离：`src/components/**` 整片算浏览器面，宿主侧 import 一个组件是硬红
（层号拦不住它：components 第 2 层、host 第 10 层）。内置阈值比 arch-guard 默认更严：
文件与视图各 200 行、函数 80 行；`src/model/**` 有文件就必须有测试。

要开口子**从参数进**（别改判据；每条口子都有名字，评审看得见）：

```js
export default moduleArch({
  fileLines: 300,
  deps: ['some-sdk'],
  layers: { adapters: 2 },
  roles: [{ id: 'lib:version', pattern: 'src/version.ts', layer: 1 }],
  exceptions: [{ rule: 'S16', glob: 'src/components/Legacy.tsx', reason: '待拆，见 #123' }],
});
```

`exceptions` 每条必须写 `reason`。怎么读红、常见红、还有哪些口子，见
[REVIEW.md](../core/skills/workbench-module-diy/REVIEW.md)。

### `lint`：模块包的语法卫生方言

`arch` 管结构，`lint` 管单文件：`as any` 绕过契约、残留的 `console.log` / `debugger`、
TS 内联样式里的颜色字面量与 `!important`、react-hooks 那几条。模板里的配置只有两行：

```js
import { moduleLint } from '@dsh-workbench/module-tools/lint';
export default moduleLint({ rootDir: import.meta.dirname });
```

`moduleLint()` 返回一份**标准 flat config**：它同时是判据跑的那份与编辑器 / `eslint` 认的那份，
没有第二份真相。依赖（`eslint`、`typescript-eslint`、两个 react 插件）装在 module-tools 一家，
模块与工坊根的清单一个字都不用改。

要开口子从命令参数进：`moduleLint({ rootDir, ignores, rules })`，或者展开它再追自己的一块：

```js
export default [
  ...moduleLint({ rootDir: import.meta.dirname, rules: { 'no-console': 'off' } }),
  { files: ['src/legacy/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
];
```

指纹是逐块比整份方言：方言那 8 块在模块配置里必须一块不少、逐项一致；少一块、同名两次、
删一条规则或改一个值都红。只写一个同名块、`export default []`、语法错的配置都会红。
`scripts/**` 与 `*.config.*` 不判 `no-console`（脚本打印是本职工作）。

`dsh-wb-module lint --fix` 先写回再跑一遍看还剩什么。**`check` 永远不动手改文件** ——
门禁是判据，不是修复器。

## `design.json`：三张表

面板 / 能力 / 联动三张表、状态矩阵、数据源记录、写通道记录、验收清单都住在模块根目录的
`design.json`，README 里那一段由它生成（夹在 `<!-- dsh-wb:design:start/end -->` 之间）。

它是**设计底稿**：三张表与探明记录装人话（`oneLine` / `shape` / `approvalText` / 三张表的文字）；
读源那一条可以多带 `key` 与 `recipe` 两个机器字段 —— 它们只用于生成 `src/datasource.ts`，
不改变"人话那一份"（`read` / `params` / `credentials` / `notLoggedIn` / `timeout`）照写。「这条能力在哪些工作区出现」不在底稿、也不在清单 —— 那是用户的面板板说了算。
`contracts` 会把底稿的能力名与清单的工具名做键集合对账（不重不漏，只对名字）；没有
`design.json` 的模块不查。

有写能力的模块另在 `writes[]` 里落命令 / 入参 / 出参 / 预览档 / 回读 / 失败形状，
渲染成 README 里的「写通道探明记录」。没有写通道就不用写，不会因此变红。
写也能落配方：`writes[]` 里加一对 `key` + `recipe`，`sync` 把它和读一起生成进
`DATASOURCE`（`data.submit(DATASOURCE.<key>)`）；配方盖不住的写写 `custom: { why }`（warn）。

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
代码写 `data.requestMany(DATASOURCE.wallet, DATASOURCE_CALLS.wallet)`：一次换登录态、并发打，
每格各自成败。`calls` 的键就是结果名；`path` / `query` / `headers` / `response` 覆盖配方同名默认值。
几条规矩：

- `key` 与 `recipe` **要么都写、要么都不写**；只写一个不生成、也不校验（旧条目一字不动）。
- 写走同一份生成物：`writes[]` 的 `key + recipe` 也进 `DATASOURCE`；读写的 `key` 不许重复，
  `design check` 点名。
- `recipe` 与 `custom` 二选一。`custom: { why }` 表示"配方盖不住，仍用旧的 `browser` 脚本"，
  `design check` 记 warn，脚本留在代码里。
- `design check` 校验配方与批量：枚举、`origin` / `path`、`request.headers` 里不许写凭据头、
  `maxBytes`、`GET` 不带 body；`calls` 非空、≤ 8 条、逐格同一套校验，且必须配 `recipe`。
  生成物过期会被 `contracts` 点名，跑 `sync` 刷新。
- 形状与六种配方见模块 DIY 的 [`DATASOURCE.md`](../core/skills/workbench-module-diy/DATASOURCE.md)。

```bash
dsh-wb-module design check    # 空着的格一格格点名叫出来 + README 有没有落后
dsh-wb-module design render   # 用 design.json 重新生成 README 那一段
dsh-wb-module design accept   # 在真卡片上逐条走通后打勾
```

## 协议：`package.json` 里的五段

| 段 | 是什么 | 谁读 |
|---|---|---|
| `dsh.bundle.patch` | 把自己插进 profile 组合图的 cordis 补丁 | dsh 的组合器（装载） |
| `dsh.client{platform,inject,external}` | 浏览器侧接线 | dsh 的客户端组合器（dsh 不校验，错的声明要等浏览器 `require` 才炸 —— 所以 `contracts` 替你查） |
| `dsh.workbench` | **模块声明协议** | 门禁 · 市场 · 外壳 |
| `dsh.workbenchFaces{host,client}` | **工具链元数据**（不在协议里）：两个面的源码入口 | 门禁：`source` 拿它算可达性、`contracts` 查它在位；运行期不读 |
| `peerDependencies['@dsh-workbench/core']` | 服务面：外壳 provide 的服务在不在 | dsh 的兼容性预检 |

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
   未知 `kind` 或 `sources[].kind` 判红，need 里未知字段只算警告（`x-` 前缀忽略）。
2. **不许有协议不认识的键**：生字段会被外壳静默忽略（拼错一个键就等于那句话没写），
   `protocol` 先拦。`scope` 不在协议里 —— 能力出现在哪些工作区只由用户的板决定。
3. **清单声明的工具 = 代码真正注册的工具**：清单是工具面的唯一来源，两边漂了就红。
4. **底稿 ↔ 清单只对账键集合**，只对名字，内容各写一处。
5. **`dsh.workbenchFaces` 不是协议的一部分，但门禁必填**：它指向两半的**源码**，不能指向出货
   产物 —— 从 `dist/host.js` 反推不出是哪份源码把 dsh 的包拖进来的。

## 两个模板

| 模板 | 是什么 |
|---|---|
| `minimal`（默认） | 空壳：卡壳、文案、测试都接好了，没有数据源 |
| `diy` | 一份真能跑的样板：宿主侧一条只读路由真读盘、卡片五态、三张表也是填好的 |

两个模板都是**分层多文件**骨架：纯逻辑住 `src/model/**`、视图件与同目录样式住
`src/components/**`、文案住 `src/messages.ts`，两个面只剩注册与交 props。目录按需要出现 ——
`minimal` 没有纯逻辑就不硬造 `model/`。各自带一份一行工厂的 `arch.config.mjs` 与两行的
`eslint.config.mjs`。

`init` 连模板里的 `*.tpl` 一起拷、按已知 token 名逐个盖章（`__UNIT__` / `__NAME__` / `__DESC__` /
`__SHELL_RANGE__`）、剥掉后缀，再用 `design.json` 生成 README 那一段。
`__SHELL_RANGE__` 取 init 所在工程实装的那份外壳版本；读不到就退回 module-tools 自己的版本；
两者都读不到才保持 `^0.1.0` 并在 stderr 上说一句。

## 自己的自检

```bash
node scripts/selfcheck/index.mjs
```

工具箱的回归网：两个模板各 `init` 一遍、各跑全套；判据的正例与负例都要对；打包清单不含
`.tpl` 残留；`design` 的空格、README 同步、`accept`；`publish` 的清单；`release` 的验收闸、
dry-run、真发后的元数据与发布失败回滚。

## 相关文档

| 想了解 | 读 |
|---|---|
| 模块怎么写、DIY 整套流程 | [workbench-module-diy](../core/skills/workbench-module-diy/SKILL.md) |
| 构建骨架、接线（bundle / client / 注册） | [BUILD.md](../core/skills/workbench-module-diy/BUILD.md) · [WIRING.md](../core/skills/workbench-module-diy/WIRING.md) |
| kit 组件与 hooks | [KIT.md](../core/skills/workbench-module-diy/KIT.md) |
| 面板、状态矩阵、界面规则 | [PANEL.md](../core/skills/workbench-module-diy/PANEL.md) |
| 工具、审批、长任务 | [TOOLS.md](../core/skills/workbench-module-diy/TOOLS.md) |
| 判据红了怎么读 | [REVIEW.md](../core/skills/workbench-module-diy/REVIEW.md) |
| 最小可安装样本 | [module-hello](../module-hello/README.md) |
| 契约类型与共享组件 | [shared](../shared/README.md) |
