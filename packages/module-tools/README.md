# @dsh-workbench/module-tools

工作台**模块**的工具箱：建骨架、构建、过门禁、管设计底稿、发货前核清单。
模块作者与替用户造模块的 agent 只跟这几条命令打交道 —— 模块包里不再各带一份构建脚本。

## 五条命令走一遍

```bash
pnpm exec dsh-wb-module init my-unit --template diy   # 建骨架（minimal 是默认）
cd my-unit && pnpm install
pnpm build        # dist/host.js + 套了 loader 壳的 client.js
pnpm check        # 十三条判据
pnpm design check # 设计底稿有没有空格、README 有没有落后
```

要发货再加一步 `pnpm publish`：跑门禁、核 `files` 与 `npm pack` 清单，只 dry run，不真发。

骨架自带脚本，日常不用记长命令：`build` · `typecheck` · `test` · `selfcheck` · `check` · `lint` · `design`。

## 命令

| 命令 | 作用 |
|---|---|
| `dsh-wb-module init <unit> [--dir <目录>] [--template minimal\|diy] [--description "一句话"]` | 建模块骨架 |
| `dsh-wb-module build` | 出 `dist/host.js`（单文件 ESM）与 `client.js`（套 loader 壳） |
| `dsh-wb-module check [--only <判据>]` | 十三条判据；`--only` 单跑，也当查询口用 |
| `dsh-wb-module lint [--fix]` | 用模块自己那份 `eslint.config.mjs`；`--fix` 写回文件 |
| `dsh-wb-module sync` | 按清单生成 `src/declared-tools.ts`（工具名只有清单一处写者） |
| `dsh-wb-module design <init\|check\|render\|accept>` | 设计底稿：填、查空格、生成 README、验收打勾 |
| `dsh-wb-module publish` | 发货前清单：门禁 + `files` + `npm pack`（只 dry run） |

`--cwd <目录>` 指定包目录，默认当前目录。

## 十三条判据

`dsh-wb-module check` 一次跑完，三态输出：`✔ 通过` / `○ 不适用` / `✖ 不过`；有任何不过就退出 1。

| 判据 | 盯什么 |
|---|---|
| `contracts` | 模块契约：单元 id 唯一、两个面、四个脚本、`files`、peer 下限；外加两处对账 —— 清单 ↔ 真正注册的工具、`design.json` ↔ 清单的能力名 |
| `protocol` | `dsh.workbench` 声明：`apiVersion` 要在、静态半形状要对、不许有协议不认识的键（`scope` 就是生字段之一） |
| `bundles` | 产物边界：宿主面里不许有浏览器侧的东西；浏览器产物里不许内联外壳 CSS；产物里出现夹具标记判红 |
| `source` | 源码边界：**模块源码零注释**；不直接引 dsh 的包、不引不是种子词的 `@deepseek-ai/*`；`@dsh-workbench/shared` 的两个入口按运行时分开（根入口只许 `import type`，`/host` 只许宿主侧取运行值） |
| `primitives` | dsh 原语只从模块表（`kit`）拿 |
| `kit` | 这份外壳的 kit 里到底有什么（缺什么当场点名） |
| `cards` | 卡片渲染：八态 × zh/en 各渲一遍（idle / loading / 刷新保留旧值 / ready / 空容器 / 三种不可读），不许抛、不许空白、不许 `undefined` / `NaN` / `[object Object]`，要套外壳的卡壳，`titleKey` 两语都有落点 |
| `standalone` | 独立构建：产物不依赖工坊里才有的东西 |
| `markers` | 公开包无内部标识（私有 npm 源 / 私网 IP / 内部域名后缀）。组织特有的词表由 `DSH_WB_INTERNAL_MARKERS` 在 CI 或本机提供，不写进仓库 |
| `style` | 样式归属：不定义外壳类 `wb-*` 的规则；裸 `<a>` 与裸 `<button>` / `<input>` / `<select>` 判红，改用 kit 的 `Link` / `Button` / `TextField` / `SelectField`（少数几何上无法替换的形态收在豁免表里） |
| `alias` | 模块不指外壳：源码里没有指向外壳 `@/` 的引用 |
| `arch` | 模块自己的**分层形状**（见下）。只跑带 `arch.config.mjs` 的模块，没有就是 `○ 不适用` |
| `lint` | 模块自己的**语法卫生**（见下）。只跑带 `eslint.config.mjs` 的模块，没有就是 `○ 不适用` |

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
[REVIEW.md](../workbench/skills/workbench-module-diy/REVIEW.md)。

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

它是**设计底稿**：只装人话（`oneLine` / `shape` / `approvalText` / 三张表的文字 / `datasource`），
不装机器字段。「这条能力在哪些工作区出现」不在底稿、也不在清单 —— 那是用户的面板板说了算。
`contracts` 会把底稿的能力名与清单的工具名做键集合对账（不重不漏，只对名字）；没有
`design.json` 的模块不查。

有写能力的模块另在 `writes[]` 里落命令 / 入参 / 出参 / 预览档 / 回读 / 失败形状，
渲染成 README 里的「写通道探明记录」。没有写通道就不用写，不会因此变红。

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
  "apiVersion": 1,
  "unit": "hello",
  "card": { "titleKey": "hello.cardTitle", "order": 90 },
  "tools": [{ "name": "hello_read", "writes": false }],
  "host": { "inject": [] },
  "env": { "command": "opencli", "plugins": [], "libs": [] }
},
"workbenchFaces": { "host": "src/host.ts", "client": "src/client.tsx" }
```

五条口径：

1. **声明了 `apiVersion` = 静态半写全了**：`unit` / `card` / `tools` / `host` 四个键都要有
   （没有卡片写 `null`），`env` 没有外部供给时省略。
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
`.tpl` 残留；`design` 的空格、README 同步、`accept`；`publish` 的清单。

## 相关文档

| 想了解 | 读 |
|---|---|
| 模块怎么写、DIY 整套流程 | [workbench-module-diy](../workbench/skills/workbench-module-diy/SKILL.md) |
| 构建骨架、接线（bundle / client / 注册） | [BUILD.md](../workbench/skills/workbench-module-diy/BUILD.md) · [WIRING.md](../workbench/skills/workbench-module-diy/WIRING.md) |
| kit 组件与 hooks | [KIT.md](../workbench/skills/workbench-module-diy/KIT.md) |
| 面板、状态矩阵、界面规则 | [PANEL.md](../workbench/skills/workbench-module-diy/PANEL.md) |
| 工具、审批、长任务 | [TOOLS.md](../workbench/skills/workbench-module-diy/TOOLS.md) |
| 判据红了怎么读 | [REVIEW.md](../workbench/skills/workbench-module-diy/REVIEW.md) |
| 最小可安装样本 | [module-hello](../module-hello/README.md) |
| 契约类型与共享组件 | [shared](../shared/README.md) |
