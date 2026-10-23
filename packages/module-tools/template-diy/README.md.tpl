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

## 这个模块会不会写东西、要不要跑一会儿、靠什么跑起来

**这张卡只读** —— 上面那条 `/overview` 就是全部。要动手（提交、发布、批量改）就得再加两样，
下面三段是**最小可抄的写法**；不需要的整段删掉，别留半截。

### 会写：清单里标出来 + 认领审批

> 每个工具都写一个 `key`（代码里那个短名，lowerCamelCase），然后 `dsh-wb-module sync` 生成
> `src/declared-tools.ts`：代码写 `DECLARED_TOOLS.rebuild.name` —— 工具名的字面量只留在清单里。

```ts
tools: [{ name: 'workbench___UNIT___rebuild', writes: true, key: 'rebuild' }],

needsApproval: (call) => ({
  kind: 'ask',
  reason: '会覆盖产物',
  question: { zh: '要重建这 3 个模块吗？', en: 'Rebuild these 3 modules?' },
  fallback: { zh: '会覆盖它们的 dist 与 client.js', en: 'Overwrites their dist and client.js' },
}),

approvalDetail: async (call) => ({ zh: '会覆盖 3 个模块的产物，不碰源码', en: '…' }),
```

清单写着 `writes: true` 而不认领，外壳**当场 deny**（用户看到的是一次莫名其妙的拒绝）——
`dsh-wb-module check --only contracts` 会替你先把这条看一遍。用户侧看到的问话就是
`question` + `approvalDetail` 合起来的那几行：**一行一个事实，别写"这个操作会写数据"这种空话。**

### 跑一会儿：长任务

```ts
mount({ longTasks, ... }) {
  const runs = longTasks?.create({
    key: 'rebuild',
    run: async ({ payload, onStep, signal }) => {
      onStep({ kind: 'start', text: '开始…' });
      // signal 被 abort = 有人按了停止（用户 / agent）：每一轮都看一眼 `signal.aborted`，能收手就收手
      /* … */
      return {};
    },
    outcome: (result) => ({ why: '…' }),
    view: (snapshot) => ({ steps: String(snapshot.steps.length) }),
  });
  return { routes: {}, registerTools: () => [], ...(runs === undefined ? {} : { longTasks: runs }) };
}
```

起这一趟的那把工具里（`execute(args, exec)` 拿得到现场）记下来源：

```ts
runs.start({ workspace, target, payload, session: sessionIdOf(exec) ?? undefined });
```

`sessionIdOf`（`@dsh-workbench/shared/host`）说这次调用是哪个会话发的。**不记来源 = 用户按的**
（或这一版之前起的）—— 停它要走审批；外壳自带的那两把 `workbench_long_tasks_list` /
`workbench_long_tasks_stop` 就是这么判"谁的"（自己起的免审批，别人的 / 用户按的要审批，
不在当前工作区的直接拒绝）。

浏览器侧用 kit 那套画（`kit.hooks.useLongTask` + `<LongTaskRow …/>`）：状态有五种 ——
`running` 进行中 / `needs-login` 要登录 / `stopped` 停下的（用户按停）/ `ok` 完成 / `failed` 出错。

要给用户那颗停止钮，就在卡片上给那一行的 `LongTaskRow` 传 `stop`
（词与取值照 dsh 任务列表那行：aria `停止任务 {label}` → 上膛 → 可见字 `确认停止`、
aria `再次点击确认停止`，3 秒落膛；**失败那半是我们自己的** —— 不往钮里写「停止失败」，
而是把这次请求失败的原话画在那一行下面，`failed` 给什么画什么）；**要停就认 `signal`，不认就别画** ——
画了就是骗人：外壳只会把这一趟标成 `stopped`，你的活儿还在跑（内部是 opencli 子进程那类编排，
今天最多做到"我们不再等它"）。要用这个新 prop 就得装带这次改动的那份外壳 ——
把自己 `peerDependencies['@dsh-workbench/core']` 的下限抬到那一版。

### 存起来：他能自己配什么（`prefs`）

选一次就想让它一直算数（钉哪个环境、忽略哪些、超时多久）→ 走 `prefs` 通道：**按项目记、刷新还在**。
只是"这次看哪一种"→ 当 route 参数传，别落盘。两种都写进 `design.json` 的 `config[].persistence`
（`prefs` / `view`）—— 表里写了 `prefs`，产物里就必须真的接上（`check --only contracts` 会拦）。

宿主半侧在 `mount` 里返回（最好单独一个纯文件，像 `src/prefs.ts` 那样能单测）：

```ts
prefs: {
  resource: 'your-module',
  handle: (payload) => applyPref(deps.store.for(UNIT_ID, workspace), payload),
}
```

浏览器半侧：`useHostWrite({ channel: 'prefs', resource: 'your-module' })` + `FormRows` / `FormRow` /
`TextField`，外面套 `SettingsSection`，保存用 `SaveBar`；存失败留在原地。（标签、行距与输入框内边距都是
外壳给的默认，不用为这个写 CSS。）语义：没写过 ≠ 选空、清空要把文件收掉、不认识的值报错并列出还认的候选。

### 靠什么跑起来：`env`

```ts
env: {
  command: 'opencli',
  libs: [{ name: 'x-lib', registryEnv: 'DSH_WORKBENCH_X_REGISTRY', registryDefault: 'https://…/', purpose: '装它干嘛' }],
  plugins: [{ name: 'x', commands: ['a', 'b'], installSource: { kind: 'npm', package: 'opencli-plugin-x', registryEnv: '…' } }],
}
```

外壳的隔离运行时按它装、按它探（`workbench_modules_list` 里逐条看得到）。**没装好时用户看到的那句话
由你写**：`libInstallCommand({ need })` 会连源和缓存目录一起拼好，原样给他，别自己拼 npm 命令。

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

## 装进本地工作台

```bash
dsh plugin --profile workbench add <本目录>
```

## 改的时候这些是硬约束

* **只用 kit 里真有的成员**：`check:kit` 拿产物实际取的成员去对 peer 下限那份外壳的 kit，
  取了旧外壳没有的成员会在用户机器上首帧渲染就炸（peer 下限因此不许比 devDependency 旧）。
* **两个运行时不许互引**：宿主侧不许碰 DOM / react，浏览器侧不许碰 `node:` / `process.env` / `Buffer`
  （`check:bundles` 对着产物查）。所以目录读在 `src/host.ts`，卡片只管画。
  跨运行时那一条**层号拦不住**（`components/` 第 2 层、`host.ts` 第 10 层，"向下依赖"看着合法）——
  是 `arch` 判据按面判的：`src/components/**` 整片算 client 面，宿主侧 import 它当场红。
* **层序**：`src/model/**`（纯逻辑，第 1 层）谁都能读，但它**不碰** react / kit / dsh / `node:*`；
  视图在 `src/components/**`（第 2 层），只许 import 第 1 层；两个面在第 10 层。
  要加一层就在 `arch.config.mjs` 里明写（`moduleArch({ layers: … })`）—— 多出来的目录默认是 S01 红。
* **语法卫生**（第十三条）：`eslint.config.mjs` 那份方言管 `console.log` / `as any` / 手搓颜色字面量 /
  `!important` / hooks 那几条（`rules-of-hooks`、渲染期写 ref、漏依赖是 **error**，其余 recommended 是 **warn**）。
  `check` 把 error 算红、`warn` 只计数；要动手就先 `dsh-wb-module lint --fix`（`check` 一个字节都不改）。
  个别地方真要破例就在 `eslint.config.mjs` 里 `moduleLint({ rules })` 开口子，别悄悄换成手写配置
  （判据按方言指纹认它）。
* `@/` 只许指自己（`@/modules/__UNIT__/*`）；共享代码走包名；`@deepseek-ai/dsh-*` 只在客户端侧用，
  且必须同时写进 `package.json` 的 `dsh.client.external`。
* **自己的样式走 CSS Modules**（`src/x.module.css` + `import styles from './x.module.css'`）：
  类名照常写就行 —— 构建会**按文件路径哈希**（跨模块不会撞），但**别带 `wb-` 前缀**：
  `wb-*` 是外壳的全局类名，模块定义它、或借契约里没有的那一个，`check:style` 都会判红。
  要借外壳契约里的类，写 `:global(.wb-…)`，而且那个类必须在契约里。
  这份骨架带了一份最小的 `src/components/OverviewCard.module.css`（就一档列间距），
  演示"样式与组件同目录"；`types/styles.d.ts` 是它给 `tsc` 的类名表声明（少了它 `styles.largest` 直接红）。
* **源码零注释**（`src/**`）：要说的都写在这里。

要发布：把 `package.json` 里的 `private` 去掉，并显式写上发布目标
（`publishConfig.access: "public"` 或指向内网源的 `publishConfig.registry`）——
`private: true` 的包不许发到任何源，这是刻意的默认。
