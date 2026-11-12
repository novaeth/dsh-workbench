# 更新日志

仓库从这一版开始记录：`v1.1.1` 是这份历史的第一个版本。

## v1.2.6

`2026-11-12`

### core

#### ⚡ 改进

- **dsh 依赖升到 0.2.2-rc.2**：`@deepseek-ai/*` 全部跟到 rc.2，`engines.dsh`、README、包 README 与
  快速开始里的最低版本一起改成 `>=0.2.2-rc.2`，`dsh-client-ui-primitives` 与 `engines.dsh` 同代
  （自检要求这两处一致）。rc.2 撤了两个旧用法，先按新 API 改过来：工作区三点菜单改用 `Menu` 的
  `anchorPoint`（CSS anchor 定位），不再传 `getAnchorRect`；「添加模块」里的安装源浮层在触发钮上挂
  `anchor-name`，用 `position-anchor` 与 `anchor(bottom / right)` 对齐，放不下时由
  `position-try-fallbacks` 翻到上方，高度夹在视口内。升 rc.2 时还加过一个自己算坐标的兼容 hook
  （量锚点、面板与视口，再算 `top` / `left`），这里连同测试一并删掉
- **冒烟探针跟着市场页改版**：市场页重排后「添加模块」只在「已安装」页出现，发现页的
  「添加模块来源」会被宽松匹配选中，浮层永远不出现；探针先切到「已安装」页（老版本没有
  页签就照旧），失败时补写 `-add-plugin-dom.json`：市场根节点在不在、锚点数量、前 120 个
  可点节点的标签 / 文案 / aria / 选中态；失败分支还补收 `$RUNNER_TEMP/*.log`
- **慢机器上的进程组测试**：killTree 的测试在子进程退出后多等 2 秒再取基准，孙进程晚到的
  写入不再被当成没停

#### 🐛 修复

- **升级 dsh 之后启动失败：profile 里的 dsh 插件层和运行时不是同一代**。`@dsh-workbench/shared` 的
  官方 dsh 包原先放在 `dependencies` 里（发布的 `.d.ts` 用），装工作台或模块时会跟着进 profile；
  dsh 一升级，兼容性预检就把这批旧插件逐个停用（只在 stderr 里写 `disabling profile plugin ...`），
  `tools` / `sessions` / `agents` 没有提供方，启动最后只剩一句 `N required plugins did not activate`。
  现在这些包只留在 `devDependencies`，装包不会再带第二份 dsh 插件层（ADR-0112）；模块作者那边
  取官方类型的别名只保形状、引用缺失包的字段会退化成 `any`，工作台自己的 kit / 契约类型不受影响
- **自更新换完链接后按新依赖重装 profile**：以前只同步 `pnpm-lock.yaml`，旧版 shared 带进来的
  dsh 包会留在 `node_modules` 里，升完 dsh 仍可能起不来。现在翻链之后跑一次
  `pnpm install`（优先用本地 store），旧 dsh 层会被清掉；装失败不影响翻链，启动器只读对账仍会拦下
- **兜底：启动前只读对账**。启动器比较 profile 里**运行时也提供**的那批 `dsh-*` 包与
  `dsh --version`，不同代就拒绝并列出对不上的包，提示重装一次工作台（重装会按新依赖把旧 dsh
  包清掉）。第三方插件（运行时里没有同名包的）不参与比较，仍由 dsh 自己的预检处理

#### 🧱 模块契约

- **模块只拿工作台自己的类型**：`@dsh-workbench/core/contract` 不再导出 `DshHostContext` /
  `DshClientContext` / `DshToolDefinition` / `DshToolRegistry` / `DshToolRunContext`。
  `HostContext` / `ClientContext` 收成 `get` / `effect` / `logger` 的窄接口；工具声明、执行与
  注册用工作台的 `ToolDefinition` / `ToolRunContext` / `ToolRegistry`。模块要用 dsh 官方类型
  就把对应包装进自己的 `devDependencies`，装进 profile 仍然不带 dsh（ADR-0113）
- 宿主侧官方别名移到 `@dsh-workbench/shared/host`；`@dsh-workbench/shared` 根入口不再导出
  宿主类型。模块模板与 `module-hello` 已按新类型改过

#### 🗑️ 移除

- **撤掉「立即重启」与「稍后」**：工作台更新完成后那一行不再给两颗钮，只留「重启后生效」与
  「新版本已就绪，重启后生效。」；重启由用户自己退出应用（独立实例结束进程）再打开。那颗钮做的是
  "照当前命令启动一份新的自己，成功后再 `process.exit(0)`" —— 新进程启动失败时用户手上什么都不剩；
  「稍后」只是把那颗钮收起来，没有它就没有下一步。`restart-workbench` 供给动作、目标字段映射、
  `ModulePort.restartWorkbench`、`RestartRefusal` / `RestartWorkbenchStart` 与 adapter-probe 里
  那段实现一并删除，Desktop smoke 不再断言"那颗钮不该出现"（恒真）

### 📦 产物

- [@dsh-workbench/core@1.2.6](https://www.npmjs.com/package/@dsh-workbench/core/v/1.2.6)

## v1.2.5

`2026-11-12`

### core

#### ⚡ 改进

- **dsh 依赖改成范围版本**：共享包的 `@deepseek-ai/*` 从精确钉住的 `0.2.2-rc.1` 改成
  `^0.2.2-rc.1`。安装时取同一 `0.2.2` 下最新的预发布（rc.2、rc.3…），不再固定在一份
  `rc.1` 副本上；`0.2.3` 及以后的版本仍不会被带进来

### 📦 产物

- [@dsh-workbench/core@1.2.5](https://www.npmjs.com/package/@dsh-workbench/core/v/1.2.5)

## v1.2.4

`2026-11-12`

### core

#### ✨ 新增

- **共用依赖也有详情页**：模块市场的「共用依赖」行名称变成可以打开的入口（`aria-label` 带依赖名），
  详情页给安装源（npm 取注册表、git 取 `url#ref`、local 取本机目录）、类型（插件 / 库）、
  当前版本、可用版本与使用它的模块；已就绪的行不挂状态标签。详情头部的动作位与列表行共用
  同一个组件，检查失败时照旧给出重试

#### ⚡ 改进

- **市场页只滚内容区**：标题与页签钉住，已安装 / 发现两个页签的内容区各自滚，发现的筛选栏
  `sticky` 在内容区顶部。模块与共用依赖的详情页也只滚内容区，详情头部钉住；打开详情回到顶部，
  返回列表恢复原来的滚动位置。加载骨架与内容列重新对齐：骨架自带的 `margin: 0` 会把子项的
  居中压掉
- **冒烟失败时带出现场**：desktop-smoke 的 `state.txt` 逐个版本目录列出七个包的 `package.json`、
  `dist/host` 与 `client.js` 在不在，日志分支额外收 `$DSH_HOME/workbench/*.log` 与
  DeepSeek Harness 自己的日志目录；市场那一步的探针跟上发现页的新入口文案「添加模块来源」，
  输入框先按 aria-label（`Index URL` / `索引 URL`）找，找不到退回弹窗里的第一个输入框
- **抢锁判据改成观察窗**：gate 在只改 changelog 的提交上偶发红，linux 腿的 selfcheck ⑫ 报「原持锁者
  的 trap 把别人的锁删了」——持锁者是后台子进程，状态落盘后还要走到 `EXIT` trap，原来只等 1 秒就
  断言。现在最多观察 5 秒：这段时间里锁消失仍是真失败，慢机器不再误报

#### 🐛 修复

- **「新版本已就绪，重启后生效」一直不消**：客户端确认启动的请求打的是
  `POST /workbench/api/workbench-boot-ok`，而宿主把这份动作资源注册在 `actions/workbenchBootOk`，
  请求 404 又被 `reportBootOk` 的 `.catch` 吞掉，确认从来没送达；marker 一直挂着 `pending-restart`，
  已经跑上新版还停在待重启。现在 `BOOT_OK_ROUTE` 改成 `actions/workbenchBootOk`，并用测试钉住它
  必须等于注册前缀拼资源名；视图侧再补一道自愈——marker 是 `pending-restart`、而启动记录里正是
  这个版本时直接读作 `ok`，老版本留下的悬挂 marker 不用等下一次更新就能收掉
- **换链之后 profile 的 lockfile 没跟上**：`package.json` 换成了 `link:`，`pnpm-lock.yaml` 的
  specifier 还是旧版本，profile 里任何一次 `pnpm install`（dsh 自己对账就会跑）都按旧 lock 把
  `node_modules` 装回上一版，界面于是显示「装在旧版、源上有新版」，同时还挂着上次的
  `pending-restart`。现在换链后用安装那一步同一个 pnpm 跑一次 `pnpm install --lockfile-only`，
  把 `link:` 规格写进 lockfile，失败只记日志、不挡流程；宿主启动时若 marker 仍是 `pending-restart`
  且正在运行的正是它说的新版，直接把 marker 落 `ok`，不再依赖客户端那次请求。工作台行上有更新可装时
  也不再叠「新版本已就绪，重启后生效」
- **落 marker 之前再验一遍版本目录**：win11 重启那条腿的现场是 `versions/<版本>` 里七个包只剩两个
  有 `package.json`，其余都是空目录，宿主半侧启动失败、`/workbench/api/*` 全 404，而 runner 的日志
  写的是「装完自检过了」——空目录出现在装完自检之后、翻链之前，中间没人再看一眼。现在写
  `pending-restart` 之前再验一次，不全就报出是哪几个包；失败现场的 `state.txt` 补上每个包目录的
  内容个数、链接类型与 `.pnpm` 条目数

### 📦 产物

- [@dsh-workbench/core@1.2.4](https://www.npmjs.com/package/@dsh-workbench/core/v/1.2.4)

## v1.2.3

`2026-11-12`

### core

#### ✨ 新增

- **工具包能力索引**：三个控制工具（`workbench_toolbox_list` / `workbench_toolbox_open` /
  `workbench_toolbox_close`）的说明里补一张能力地图：面板 / 模块 / 市场 / 长任务 → `manage`，调试 /
  录制 / 日志 / 页面 → `diy`，MCP server → `mcp:<server>`，模块或插件自身 → `unit:<id>`，并补上原先
  没有的 MCP 一类；说明总字数不增加。模型调用已收起的工具时，返回它属于哪个工具包，并提示下一步调用
  `workbench_toolbox_open`，不再只得到 `unknown tool`；同一判断在审批之前生效，被收起的写工具不再弹
  出一张通过后仍然失败的审批。agent 创建时注册运行期 skill `workbench-capabilities`，描述按当前可开
  包生成；没有 skills 服务或注册失败时，只保留工具说明里的能力地图。模块的工具闸增加可选
  `denyReason(name, context)`
- **浏览器扩展离线可用**：浏览器扩展随包自带一份（opencli 扩展 v1.0.27，Apache-2.0，允许再分发），
  启动检查不再只说「确认扩展已启用」，而是给出两种安装方式：使用工作台自带的副本
  （选择 `vendor/browser-extension` 目录），或从 Chrome 应用商店安装，商店链接仍可点。目录优先级为
  `DSH_WB_OPENCLI_EXTENSION` > `<workbench>/opencli/extension` > 包内自带。没有外网时给出三步操作：
  打开 `chrome://extensions`、开启开发者模式、加载已解压的扩展程序。升级扩展时由
  `scripts/sync-opencli-extension.mjs` 按 sha256 校验并替换，第三方声明记入 `THIRD-PARTY-NOTICES`

#### ⚡ 改进

- **设置页按官方行重排**：会话列表、MCP 按需加载、检查预发布版本改成官方一行式：标题、一句说明与右侧
  控件（`SegmentedControl` / `Switch`），删掉与控件重复的「已开启」文案。配置同步与新建工作台收进
  「高级」折叠区：摘要行给可同步项数与一句说明，展开后是内嵌面板；配置同步的 YAML 与差异经
  「查看内容」才展开，没有勾选时补一句下一步提示。新建工作台改成折叠表单，创建结果给出可复制的启动命
  令。后台适配组件不再常驻，只在显式配置或读取异常时显示状态行
- **自更新改用版本目录**：新版装进 `$DSH_HOME/workbench/versions/<版本>`，profile 里的七个包改为指向
  它的 `link:`，换版本只切换链接，profile 的 `node_modules` 只翻转七个包的链接、不再重装，也不再需要
  等宿主退出或重新拉起宿主（首次迁移到版本目录那一次除外）。首次从真目录迁移到链接只发生一次，
  旧版先搬进版本目录，避免迁移后留下悬空链接。装完核对七个包的 `package.json` 与客户端产物；
  版本目录不完整时清掉 `node_modules` 重装一遍，仍不完整则判定失败；切链接前再核一次，不全就不切。
  目录被占用时等待其退出（最长 15 分钟）再切换链接，其他错误立即报出。更新完成标记待重启，重启后
  按启动记录确认（等待 15 分钟）；确认不了只保持待重启，不算失败。`supplyPortOf` 补上
  `restartWorkbench` 转发，独立实例更新后的「立即重启」不再因缺少转发而失效；旧版本留下的排队记录
  在工作台启动时继续执行，排队超过 12 小时后「更新」按钮恢复可点
- **自更新状态收口**：工作台那一行只保留三种状态：正在更新、重启后生效、更新失败
  （再点一次「更新」重试）；行上不再展示原因分类（`occupied` / `incomplete`）、恢复方法原文与
  还原版本提示。没有「立即重启」的场合（Desktop）不再单独给「稍后」，只留状态说明。runner 已经结束
  但 marker 仍是 `running` 时读作 `failed`，界面不会一直停在「正在更新」
- **启动页只重试失败步骤**：启动页的三个「重试」（失败屏 / 桥接 / DIY）原来都发 `hard=1`，整条启动检
  查从头执行，工具链三项探测、opencli 版本探测、`opencli doctor`、DIY 预置与预热读取全部重来。预检接
  口增加 `only=<stepId>`，从该步骤开始执行，前面的步骤沿用上一次结果；启动页按桥接、DIY 或第一个失败
  步骤决定重试目标，说不出具体步骤时才退回 `hard=1`
- **dsh 契约改引官方类型**：外壳与共享包里的 dsh 契约不再手写，改成从官方 `@deepseek-ai/*` 包按类型
  引入，钉在 `0.2.2-rc.1`；宿主与浏览器两侧的服务、事件和插槽类型少抄一份，dsh 改版时不会与真实 API
  漂移。官方类型包（primitives 除外）进共享包的 `dependencies`，发布的类型面能被解析到，模块作者不用
  自己补一长串包；运行时仍由 dsh 提供，产物里没有它们的运行时导入
- **支持下限抬到 dsh 0.2.2-rc.1**：`engines.dsh` 从 `>=0.2.1-rc.5` 改成 `>=0.2.2-rc.1`。官方 Desktop
  的 latest 通道已经是 0.2.2-rc.1，新用户照旧可以安装；仍停留在 0.2.1-rc.5 的实例需先升级 dsh，启动
  器会阻止启动并给出升级命令
- **界面与工具文案统一**：界面文案中英双语按句级重写，配置同步空态改用说明色；agent 工具面 65
  个文件整句重写，日志与 CLI 术语同源；审批界面的截图基线、测试期望与重复代码基线同步
- **文案闸接入门禁**：新增 `scripts/check-copy.mjs` 与允许清单：界面与工具面按 error 报告，文档按
  warn 报告，跳过 logger、占位符与测试；`package.json` 增加 `check:copy` 与 `check:copy:strict`，串
  在 `check:docs` 之后；AGENTS、ARCHITECTURE、CONTRIBUTING 与文档站的门禁链同步
- **E2E 覆盖自更新与插件安装**：新增工作台自更新的用户视角 E2E：真实安装最新 beta 版，再改写
  版本号作为起点，点「更新」后断言界面仍在、提示「重启后生效」，重启后运行版本为新版；自更新三项断言
  从告警改为硬判据。新增 opencli 插件安装 E2E：mac、win11、win10 各起一个实例，断言插件目录在位、
  `opencli plugin list` 含目标插件。市场入口的匹配同时修正：真实入口文案取自 `panels.tab.market` 且
  只挂在按钮的 `aria-label` 上，窄栏 `innerText` 为空，点击表达式改为同时匹配 `aria-label` 并跳过
  `disabled`
- **CI 失败时带出现场**：desktop-smoke 失败时写入 `host-probe.json`
  （`/workbench/api/{health,preflight,unit-manifests}` 的状态与正文开头、`__DSH_BOOT__` 的键、页面脚
  本列表），并把 `$DSH_HOME/*.log`、`$DSH_HOME/logs/*.log` 与主进程 `stdout` / `stderr` 一起收进工作
  区；重启后那一步给一次重试，仍失败才判红。各步骤的告警不再影响整体退出码
  （`$LASTEXITCODE` 的判定统一），platform-smoke 与 desktop-smoke 失败时用 `::error` 带出用例名
  与日志尾部，证据文件名去掉重复前缀。
  夹具拒收相对路径的 `DSH_HOME`，profile 参数为空串时按自动发现处理，链接规范的断言统一先规范化再比
  较
- **维护者可直接发布**：新增 `pnpm run release:fast -- --target <版本> --yes`，等价于
  `node scripts/release.mjs --skip-gate --skip-rehearsal`：只跳过门禁与 dry-run 彩排，改版本号、构
  建、`pnpm -r publish`、提交并推送照旧执行，发布产物仍在发布时构建；用法写进 `--help`

#### 🐛 修复

- **启动即插件加载失败**：服务访问改成 `ctx.<服务名>` 之后，`inputTriggers`、`conversation`、
  `contextMenus`、`sidebarRight`、`sessions` 没有写进 `inject`；dsh 0.2.2-rc.1 的 typed ctx
  （包括 `ctx.get`）对未声明的服务直接抛错，`apply` 失败，界面停在插件页。`client.tsx` 的 `inject`
  补齐这五个服务，相关访问统一走 `ctx.get(...)`；读取仍按「有就用、没有就退」处理，外壳不绑定到某一
  份 dsh 组合
- **自检按 inject 规则校验客户端**：自检的 client 判据给 `ctx` 套严格代理，读取未写进 `inject` 的服
  务（属性访问与 `ctx.get`）都会抛错，与真实 dsh 一致；`injectedServices` 直接从
  `src/app/client.tsx` 的 `inject` 解析，避免手抄漂移。上一版只拦属性访问，漏掉了
  `ctx.get('sidebarRight')` 这一类读取
- **已安装的工具不再重装**：`probeVersion` 原来把 `--version` 非零一律判为 `missing`，opencli 已安装
  但自身无法启动时每次启动都会被重装；现在包在盘上时不再判缺失，把真实报错显示到面板。opencli 包装脚
  本优先使用 `bin/desktop` 的 node 垫片（Windows 为 `node.cmd` 的绝对路径），web 部署才退回裸
  `node`。cli 步骤在探测前记录 `installed()` 的结论；决定重装前把 `--version` 的失败原文写进步骤日
  志；安装完仍读不到时，把 toolchain 与包目录的真实内容写入日志
- **Desktop 上补 pnpm 来源**：官方 Desktop 只提供 `pnpm.cjs`，PATH 上既没有 pnpm 也没有 npm；自举脚
  本先认宿主铺好的 `DSH_WB_PNPM`，没有再退回 PATH 上的 pnpm，Windows 分支按引号拆分命令串。
  `ensureToolchain` 补一个 pnpm 包装脚本指向 Desktop 自带的 `pnpm.cjs`；Windows 分支用双引号生成
  `.cmd`，单引号不是 cmd.exe 的引号，包装脚本会不可用。工具链三项探测恢复并行，本地命令 10 秒超时
  （45 秒只留给 registry 查询）；Desktop 自带的 node 旁边没有 npm 时不再启动进程，直接记为
  `npmMissing`
- **更新检查不再退化成 latest**：官方 Desktop 的 node 不带 npm，而版本探测固定使用 `npm view`，
  `latestVersion` 永远是 `undefined`，更新于是退化成 `pkg@latest`，pnpm 解析到同一版后显示已是最新。
  探测命令改为两条探测路径：先 `npm view`，失败再试宿主铺好的 `DSH_WB_PNPM view`；两条都读不到时不再
  回落到稳定版 `latest`，按频道取 `@beta` / `@latest`；版本是否存在的判断同样依次尝试
- **Windows 上可以安装插件**：插件装卸在 `plan-run` 里增加步骤级 host 标记，只对带标记的步骤走宿主通
  道：第三方 `npm install` 的嵌套子进程在 Windows 受限令牌下会被拒绝；未提供宿主能力时按失败处理，不
  静默降级。干净机器上先建 `plugins-npm` 目录；`npm pack` 的落点从宿主临时目录改回执行缝授予的产品
  根。隔离 launcher 在 Windows 上同时替换 `USERPROFILE` / `HOMEDRIVE` / `HOMEPATH`，让
  `os.homedir()` 指向隔离 home，不再读到真实的 `.opencli` 目录
- **隔离运行时按官方源安装**：隔离运行时的 `pnpm add` 没有带 `--registry`，会跟随 profile 的私有源；
  该源没有代理 `@jackwener` 时这一步返回 404，界面只提示隔离运行时尚未安装完成。现在生成隔离运行时
  时，给 toolchain 目录写一份 `.npmrc`，把 `@jackwener` 钉到官方源
  （可用 `DSH_WB_OPENCLI_REGISTRY` 换源），其余包照旧走用户的私有源；提示改为在启动检查的 cli 步骤重
  试
- **安装失败给出原因**：opencli 插件的安装路由原来只有抛错或成功两个出口；现在与 dsh-bundle 同形，返
  回 `application:'failed'`、`stage:'install'`、`changed:false`、`target`、
  `errorCode:'operation-error'` 与 `errorDetail`，按行带上 `message`（含 `stderr` 尾部）、失败那一步
  的完整命令行与完整输出。「添加模块」弹窗的失败屏画出标题、原因与失败那一步的完整命令行
  （原文进「安装详情」），底部给出「更换安装源」与「重试」。供给通道在异常时写一条 warn 日志，包含动
  作、目标与未截断的原始错误
- **市场行先报新版**：行状态原来只要 `running != installed` 就显示「重启后生效」，与
  「有新版 → 给更新按钮」可以同时成立，用户还没更新却看到两句互相矛盾的话。现在只有安装版已是该版
  本、只是未载入时才说「重启后生效」；源上还有更新时先报新版
- **link: 安装的工作台可更新**：runner 把 profile 依赖写成 `link:` 后，`readProfilePackage` 一律判为
  本地副本，市场行不再给「更新」；把 `isManagedLinkSpec` 迁进共享包成为唯一实现，只把
  `workbench/versions` 根下的链接视为受管链接，模块行与工作台行用同一套豁免，补三条用例
- **遮罩不再自动关闭**：启动遮罩原来只有一个 5 分钟硬超时，用户正停在启动页读失败原因、复制安装命令
  或点重试时，时间一到遮罩自动关闭。现在「等用户决定」的帧（预检失败 / 桥接未连接 / DIY 缺失）不自动
  关闭，由屏幕上的「先进入工作台」与重试按钮决定；检查与安装中的帧保留 5 分钟，但用户一有点击、键盘
  或滚轮操作就重新计时
- **检查更新不再被慢速来源拖慢**：registry 查询超时原来固定 10 秒，慢的私有源常在答案到达前被切断；
  「查不到」的结果又按 10 分钟缓存，一次超时会把后续查询一起锁死。现在查询超时改为 45 秒，失败结果只
  缓存 60 秒；读本地账本的 `npm ls` 单独按 10 秒；请求被后续请求替代或没有结果时，检查状态也会收尾，
  不再一直停在检查中
- **自更新中断不再停在更新中**：runner 的 `main` 原来没有异常处理，写 marker 失败、解析计划失败或任
  何一步之外的抛出都会变成未处理异常，进程结束后 marker 停在 `running`，用户要等到 TTL 到期；现在全
  程捕获异常，崩溃时写入 `failed` 并打印恢复方法，启动时先写入自己的 pid。`selfUpdateBusy` 对
  `running` 也按 pid 判断是否仍在运行；`startSelfUpdate` 未能启动时如实返回 `started:false` 并写入
  `failed`

#### 🗑️ 移除

- **移除版本回退**：市场行不再提供「切回上一版」动作、二次确认与相关文案；动作路由不再接受
  `rollback-workbench`，契约、市场分发与宿主端口一起删除。自更新不再自动回滚：`expect-boot` 不再带
  profile 目录与链接，marker 去掉 `rolled-back` 状态与 `boot-failed` / `rollback-failed` 原因；确认
  失败只保持待重启，不再把链接切回旧版。原因是实际使用中误判多于补救：用户点击「更新」后停在插件页、
  客户端尚未挂载时被判为未启动，超过宽限期就把已安装的新版切回旧版

### docs

#### ⚡ 改进

- **文案规范成文**：新增 `.agents/skills/wording/VOICE.md`（六条语域规则、三档读者、先写句再查词与机
  械替换的五个信号）与 `TERMS.md`（名词、动词、状态三张表与双向禁词）；重写 `SKILL.md`、
  `FOR-USER.md`、`FOR-AGENT.md`、`FOR-DEV.md` 的流程与例子，`COPY.md` 与词表对齐
- **文档按句级重写**：README、core README、文档站的安装 / 快速开始 / 常见问题 / 数据 / 模块 / 架构页
  与模块 DIY 技能约 150 句按新规范重写，日志与 CLI 术语统一
- **版本与门禁口径同步**：README 与快速开始里的 dsh 版本号跟着 `engines.dsh` 改为
  0.2.2-rc.1；README 的升级说明改为「装进独立版本目录、重启后生效」，并注明第一次更新（迁移到
  版本目录）前 Desktop 需要先退出工作台；AGENTS、ARCHITECTURE、CONTRIBUTING 与文档站的门禁链
  补上 `check:copy`；ARCHITECTURE 记下工具包的 gate 契约与发现性两节；CONTRIBUTING 的 E2E
  说明去掉回退段

### 📦 产物

- [@dsh-workbench/core@1.2.3](https://www.npmjs.com/package/@dsh-workbench/core/v/1.2.3)

## v1.2.2

`2026-11-10`

### core

#### ✨ 新增

- **工作区行的更多菜单**：行尾原来只有一枚铅笔按钮，打开后只能改名；现在改为三点菜单：设置别名、
  在 Finder 中显示（非 macOS 写「在文件夹中」）、删除工作区；删除为危险色，与上面两项之间
  有分隔线。右键工作区项打开同一份菜单，位置在指针处；删除要二次确认，确认之前不发 `delete`，
  只把工作区从列表里移除，文件夹与会话记录保留。别名只改显示名、不改文件夹名，
  搜索框提示与相关文案从「中文名」改成「别名」。三点按钮照 dsh 官方补上
  `aria-expanded`，由按钮报告菜单开合状态

#### ⚡ 改进

- **门禁不依赖开发机环境**：`module-tools` 的字号判据原来以 13px 为样本（刻度来自 dsh 主题
  的 `--dsw-font-*`），全新机器上读不到 dsh 主题就误报；现在改用外壳自带的 `--wb-font-*`
  刻度（18px）。`style-shape.mjs` 里 9 处探针样板抽成 `styleCheckOf(probe)`，
  `.jscpd-baseline.json` 按干净检出重算。整链之后再以空的 `DSH_HOME` 运行一遍
  `selfcheck`，判据不许依赖机器上的 dsh 现场；工作区菜单那条判据把菜单卡片依赖的
  `.list` 类也一并固定
- **CI 的失败定位与覆盖**：新增 `gate.yml`，push 到 `main` 与每周在 linux、mac 上运行整条
  `pnpm run check`；`platform-smoke` 补上「升级现场自动修复」冒烟与自更新、taskkill 相关判据，
  PR 触发面扩到 `packages/*/scripts`、`packages/*/bin`、`package.json`、`.husky` 与
  `scripts/**`。整链失败时把关键错行连同判据明细做成注解：
  公开仓日志需要管理员权限，注解不需要

#### 🐛 修复

- **Windows 升级后 opencli 不可用**：升级到 1.2.1 后，预检提示隔离运行时尚未安装完成，浏览器
  取数、插件与依赖浏览器读数的面板全部不可用。原因是安装命令钉的下载缓存与既有
  `toolchain/node_modules` 记录的位置不一致，pnpm 报 `ERR_PNPM_UNEXPECTED_STORE`，安装时把
  `node_modules` 清到一半。现在隔离运行时的 pnpm 缓存只有一个来源：读
  `node_modules/.modules.yaml` 记录的值，读不到才回落到运行时的 `pnpm-store`，toolchain、
  插件 vendor 与共用依赖三处同源。安装失败且属于缓存位置不一致，或装完仍读不到 opencli 时，
  清掉 `toolchain/node_modules` 重装一次，错误原文保留首行；Windows 上只有
  `powershell.exe` 时也能启动安装，不再因找不到 `pwsh` 而失败
- **独立实例的端口写进 profile**：端口原来只由启动器传入的 `--port` 决定，直接运行
  `dsh workbench` 起的是同一个实例却没有 `--port`，会回落到 dsh 默认的 3080，与 `dsh web`
  冲突。现在 `setup` 把 webserver 行写进该 profile 自己的 `cordis.patch.yml`（整份 config
  重述，dsh 的 patch 是整键替换），优先级仍为 `--port` > `WORKBENCH_PORT` > `3081`；
  profile 里已有这一行就一个字节不动。`seed-profile.sh pin-port` 可单独运行，重复执行幂等
- **Windows 上自更新与内置命令**：自更新生成的子脚本改成按生成时的平台走
  `$ComSpec /d /s /c`（Node 直接执行不了 `.cmd`）；bin 探测改用 `where.exe`，不再受
  PowerShell 里 `where` 别名影响；`dev`、`create` 与 `verify` 在 Windows 上不再 ENOENT，
  改成给出明确的未移植说明与替代做法；工坊工具链的 `.mjs` 入口改由 `node` 启动，不再把
  脚本当命令发
- **Windows 上的路径与配置文件**：8 处绝对路径直接拼接进命令行改成经 `quoteShellArgFor`（根路径
  带空格时 pwsh 会截断），PATH 的段带引号时仍找得到 `pwsh.exe`；模块来源的 `source.path`
  与索引路径的反斜杠按正斜杠归一，git pathspec 用反斜杠返回零输出时不再误报「索引不在仓库
  里」；cordis 补丁分块按 `/\r?\n/` 归一，CRLF 下侧栏档位不再读反，也不再追加重复块；
  给用户的命令不再带 `cd "$DSH_HOME/…" &&`（PowerShell 里 `$DSH_HOME` 为空，`&&` 在 5.1
  下解析失败）
- **写域按真实路径判定**：判定前先 realpath，`/tmp` 与 `/private/tmp` 这类别名、macOS 与
  Windows 的大小写差异不再把域内路径判成域外；多路径求共同根时也不再向上追溯到上级目录。产品域
  环境变量一并钉 `USERPROFILE`、`HOMEDRIVE` 与 `HOMEPATH`（Windows 上 npm 与 pnpm 读的是
  它）；`EPERM` 与 `EACCES` 同口径算「写不了」，安装到不可写目录会在运行前被拒绝并说清权限
- **超时与取消终止进程树**：执行缝 host 域的超时与 abort 现在终止整棵树：win32 走
  `taskkill /pid <pid> /T /F`，POSIX 走进程组；`request.signal` 不再被丢弃，`aborted`
  返回真值，超时返回后孙进程不再继续写同一个 prefix
- **会话「更多」不再打开空菜单**：dsh 0.2.2 起会话菜单项由 `ui-workspace` 注册进共享
  上下文菜单；此前只摘掉了槽位渲染，⋯ 处留下一个空的 `Menu`，自定义左栏打开后是空菜单。现在
  ⋯ 只报告目标与位置，开合态由共享菜单派生，右键与 Shift+F10 打开同一份菜单，Enter 与
  Space 打开会话
- **工作区菜单的开合与关闭**：点三点或右键打开菜单时不再收起选择器（原来菜单一打开，刚才
  展开的工作区列表就消失），选中一项之后才收起；三点按钮改为切换，菜单打开时再点同一项即关闭，不再
  出现菜单先关闭再重开的闪烁。关闭菜单改由菜单自身处理：菜单打开时自己监听 window 捕获的
  pointerdown 与 Escape，不再受其他弹层的 `stopPropagation` 影响，选择器收起后也不再残留
  菜单；Escape 只关闭菜单，不再把选择器一起关
- **工作区菜单不再多出间距**：dsh 的 `Menu` 在 portal 模式下仍渲染一个空 `<span>`，其
  `.root` 是 `display: inline-flex`，空的 inline 级盒仍会生成行盒，于是选择器与「工作区」
  之间多出一条行距。现在给 wrapper 挂 `.anchor.anchor { display: none }` 从布局里去掉，定位
  继续走 `getAnchorRect`；菜单卡片的 `.list` 从与 `dsh-client-ui-primitives` 重复的
  `min-width` 换成 `max-width`
- **写入失败时对话框仍可关闭**：`useWorkspaceWrite` 的 `write()` 补了 reject 分支，
  原来写入抛错时 `busy` 一直为 true，删除对话框的确认、取消、Escape 与遮罩四个出口全部失效；现在失败
  落到 `failed`，对话框可以关闭并重试
- **共用依赖行与模块行对齐**：模块市场的「共用依赖」行原来只在检查时显示加载指示，检查完
  没有状态点，更新按钮也没有更新色；现在与模块行一致：状态点分进行中、已完成、警告与空闲，
  更新按钮使用更新色

### docs

#### ⚡ 改进

- **安装说明补上端口与 Windows 限制**：快速开始、三种装法与常见问题说明独立实例的端口写在
  它自己的 profile 里，`npx @dsh-workbench/core` 与直接 `dsh workbench` 起的是同一个实例、
  同一个端口，`WORKBENCH_PORT` 在两种启动方式下都生效；另注明 Windows 上独立实例的启动器
  还需要 bash，`create` 与 `setup` 会报找不到 `bash`，改用 `dsh web` 或 Desktop 的插件页
  安装。根 README 与包 README 同口径

### 📦 产物

- [@dsh-workbench/core@1.2.2](https://www.npmjs.com/package/@dsh-workbench/core/v/1.2.2)

## v1.2.1

`2026-11-09`

### core

#### ✨ 新增

- **人工干预节点**：长任务新增 `needs-human` 状态与 `LongTaskIntervention` 载荷（`title` / `hint` /
  `open-url` 或 `copy`），任务行上出现对应动作；左栏与项目下拉把需要人处理的任务升到 warning 档，
  agent 读口写「等人处理」「要人做」；`needs-login` 旧链路原样保留，不新增 kit 成员、不跨主版本
- **「我处理完了」**：注册表加 `resumable` 与 `recheck(id)`，外壳自动挂 `<单元>/runs/recheck`；
  `useLongTask` 的 feed 加 `recheck` / `rechecking` / `recheckFailed`，`needs-human` 行上出现
  「我处理完了」按钮，点击后自动刷新；模块没有提供 `recheck` 处理函数时就没有这个按钮，恢复仍靠
  模块轮询
- **干预回执与等待通知**：干预节点可带 `fields`（`text` / `secret`、`required`、`submitLabel`），
  行上出表单，`<单元>/runs/answer` 把回执交给模块；注册表按声明字段收值并校验必填，值只回模块、
  不进快照 / 不进 facts / 不进通知；`PostResource.redact` 让回执那条动作路由的 `wrote` 不记
  `args`。进入 `needs-human` 时向发起该任务的会话发「在等你处理」notice（`hold`、按 run 去重、
  不唤醒）；另加 `withInterventionRetry`，第一轮立即试、之后有界退避、单飞、永不抛错

#### 🐛 修复

- **安装计划改有序步骤**：Windows 上从界面安装插件原来会「检查到并安装中」，然后弹窗复位、实际
  什么都没装：安装计划被拼成一条 POSIX shell 串交给执行缝，win32 上执行缝走
  `pwsh -Command '& <line>'`，`pnpm add` 之后紧跟的 `rm -rf … && mkdir -p … && ln -s …` 在
  PowerShell 里第一个词不是命令，`&&` 链断掉，后续步骤一步未执行。现在计划是一组有序步骤
  （`run` / `remove` / `mkdir` / `link` / `copy`），文件操作走 `node:fs`、Windows 目录链接用
  junction，展示行在 win32 上渲染成可直接执行的命令；新增「安装计划里没有 POSIX-only 编排」判据
  与真 shell 冒烟，接进 CI 的四个 runner
- **新建工作台的启动提示**：启动提示不再手拼 `WORKBENCH_PROFILE=` 前缀，改用 `--profile`
  传参，命令行里只有命令本身；win32 上 `bin/dsh-workbench.cmd` 仍是「Windows 启动器还没移植」的
  占位脚本（`exit /b 1`），给出的命令无法执行，契约里 `command` 改成可选，界面改为一句说明
  （中英各一条词条）
- **绝对路径的包管理器也能识别**：安装前的前置权限检查原来要求命令以 `npm` / `pnpm` 开头，
  `DSH_WB_PNPM` 指向具体文件时（如 `/path/node /path/pnpm.cjs add …`）整段检查被跳过，要等真正
  执行才报错；现在按 token 找包管理器，`/` 与 `\` 分隔都认，`pnpm` / `npm` 加 `.js` / `.cjs` /
  `.mjs` / `.cmd` / `.exe` 都算，最多容忍两个启动器前缀 token

### 📦 产物

- [@dsh-workbench/core@1.2.1](https://www.npmjs.com/package/@dsh-workbench/core/v/1.2.1)

## v1.2.0

`2026-11-09`

### core

#### ✨ 新增

- **工具包按需加载**：默认工具面只保留 `workbench_toolbox_list`、`workbench_toolbox_open` 与
  `workbench_toolbox_close` 三个控制工具；`manage`、`diy` 以及每个挂在看板上的模块或插件各成一个
  `unit:<id>` 工具包，按会话开启，开启需要用户审批。清单工具可声明 `elevates`，这类调用按抬高
  工具面走审批，未认领、非法或没有挂到看板上的目标在审批前就拒绝；关闭时机由 agent 判断，开启后
  下一步即可调用。宿主侧改从 `ctx.get` 读工具面，界面文案统一为「开启工具包」「关闭工具包」
- **卡片改由外壳绘制**：模块可以把 `card` 换成 `view`（`CardView` v1，契约在
  `@dsh-workbench/core/contract`），只交读口、归一化模型与文案键，卡头、五态、阻断、刷新、
  状态点、动作排法与通用 section 由外壳绘制；
  `metrics`、`rows`、`activity`、`longTask`、`settings`、`custom` 可组合，内容塞不进 section 时用
  `customBody` 把正文整块交回模块。`apiVersion` 仍是 3，`card` 原样保留；未知版本或拼错的
  section 会被外壳拒绝并回退 `card`，schema-only 模块要在 peer 里抬到认识 `view` 的外壳版本。
  模块工具的卡片判据同步渲染 `view` 探针
- **流程与登录重试收进共享包**：`@dsh-workbench/shared/host` 新增 `createFlowTask`，把工具、长任务
  与动作通道收成一份实现，自动做 `flow.check`，`runId` 参数支持只看那一条；新增
  `withLoginRetry`，认证失败时自动调用 `ctx.login(url)` 并在原地重试
- **MCP 收成外部工具包**：初始化时从 `mcp__<server>__*` 认出 server，收成 `mcp:<server>` 外部包；
  工作台设置新增「MCP 按需加载」，默认关闭，关闭时 MCP 工具照旧全量进入上下文，打开后按需开启
  工具包并走审批，开关存在本机工作台的 `settings.json`，变化后立即重算工具面与限制。模块清单里
  的工具可写 `onDemand: false` 表示常驻、不随工具包收起。另修好开关读取缺少 `ok: true`、
  复选框一直禁用的问题
- **更新判断接官方版本表**：工作台那一行的「检查更新」改用 `pluginManager.listVersions`，版本选取与
  blocked 口径和模块行一致；官方版本表判定这一版与当前 dsh 不兼容时，行上不给更新入口，起外部
  脚本前也先拒绝。设置新增「非正式版本」开关（v1.2.3 起改名为「检查预发布版本」），默认关闭；
  打开后检查更新取整张版本表里最高的版本（含 beta / rc），工作台、模块与插件按同一开关选目标版本
- **市场发现页按分类筛选**：发现页原来的标签行换成分类（全部 + 单选），标签回到筛选菜单，卡片保留
  标签；发布审批要求填分类、标签可选，新分类在审批屏列出索引现有词表。新增
  `workbench_market_categories` 读工具，`release` 支持 `--category`，`refresh` 不丢已有分类；
  市场页布局对齐一并调整
- **kit 补三件模板**：新增 `UnitBlocker`（读口错误或能力读数 → 统一阻断屏）、`useUnitSetup` +
  `SetupShell`（初始化与配置的流程壳，setup / edit 两模式）与 `createUnitConfig`
  （`@dsh-workbench/shared/host`，单元配置读写）；`template-diy` 加 `SetupFlow` 示例。`kit.lib`
  暴露 `blockerOf`，模块可先判有没有阻断再决定整块换屏；`useUnitSetup` 支持 `initialValues`
  与免 `read` 的编辑模式

#### ⚡ 改进

- **空态统一用插画**：看板、模块页与模块市场的空态改用 dsh 的空态插画（四宫格替掉时钟），
  `EmptyIllustration` 搬进 `@dsh-workbench/shared` 并导出；`EmptyState` 不给 `icon` 时默认带插画
  （边长 72），要纯文字给 `null`，自定义图标原样透传
- **品牌标重画并改纯色**：新标在显示器里放 dsh 鲸鱼，插件图标改透明底；随后去掉 #54ECE7 →
  #658EFF 的渐变，整枚标统一 #658EFF，鲸鱼不再单独压深。`logo-color`、`logo-color-dark`、
  `logo-app` 与 `icon.svg` 同步，组件预览同步重出；`BRAND_MARK_COLORS` 收成 `{ mark }`，
  `IconBrandMarkColor` 直接铺实心色
- **审批详情列出要装的依赖**：模块安装或升级的审批详情里列出这次要装的插件与库；读不到声明时
  说「读不到这个模块要装什么」，没有依赖时说「这个模块没有声明插件与库」

#### 🐛 修复

- **卡片动作与阻断重排**：卡片动作统一排到右下角，错误重试降为 outline；阻断详情排在动作之前，
  避免左-右-左的排法；未知错误改成看得懂的说法，原文收进详情
- **启动页不再闪黑**：启动页补上品牌标；启动时先按已保存的主题铺好深浅色，等 dsh 的主题判定落定
  再交回，消除先按 system 猜测导致的闪黑
- **移动面板行审批标题**：审批标题按 `index` 参数写出面板移动到的实际位置，为 0 时写「最前面」，
  其余按 0 基换算成「第 N 位」，不再一律写「最前面」
- **契约与校验收敛到单一来源**：`fact` / `route` / `panels` 的 payload、`release` 目标、OpenCLI 与
  registry 等词表收进 `@dsh-workbench/shared` 的契约；适配器集合校验补上 `libUninstallCommand`，
  并加类型覆盖锁；门禁层表从 arch 配置派生，运行时边界与适配器包清单收敛；文档里的计数、不存在的
  方法、协议版本与字号刻度的漂移一并修正

### docs

#### ⚡ 改进

- **品牌标同步**：文档站首页的 logo（`site/static/logo.svg`）换成新品牌标

### 📦 产物

- [@dsh-workbench/core@1.2.0](https://www.npmjs.com/package/@dsh-workbench/core/v/1.2.0)

## v1.1.18

`2026-11-07`

### core

#### 🐛 修复

- **自定义左栏补回官方的「更多」**：设置里把「会话列表」选成「自定义」这一档时，面板列底部那个
  「更多」连同菜单整条没了 —— 官方的按钮与菜单挂在 `sidebar.panellist.actions` 这个座位上，
  而自定义档只声明了面板列。现在按钮回来了，菜单仍交给该座位渲染：列面板、打开、固定或收起，
  跟官方侧栏一个口径
- **展开的日志不再把人拽回底部**：准备工作台那几行展开后默认跟到最新一行；往上翻就停止跟随，
  滚回底部附近再恢复。每行日志也只在文本变了才重写

### 📦 产物

- [@dsh-workbench/core@1.1.18](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.18)

## v1.1.17

`2026-11-07`

### core

#### ✨ 新增

- **新版判断跟着 dsh 的版本表**：点「检查更新」时，最新版按 dsh 的真实版本表算（dist-tag、
  发布时间、预发布、废弃都在表里），取表内最新与探测值中较新者。dsh 判这版跟当前工作台不兼容时，
  行上写「新版本和当前的工作台不匹配，暂时不能更新」，不再给一个点了才失败的「更新」；
  工作台自己的 peer 判据仍优先
- **更新交给 dsh 一跳做完**：registry 装的模块改走 dsh 的 `updateBundle` —— 它自带检查与失败回滚；
  检查阶段就拒了的不会再另起进程换包，只有源写错了（invalid-spec）才回退到外部换包

#### ⚡ 改进

- **DIY 预设不再落文件**：删掉生成的 `preset/diy.patch.yml`，改成宿主按当时的注册表就地派生
  （注册 / 注销 + 15 秒重试窗口），不用再跟着 dsh 版本重新生成
- **升到 dsh 0.2.2-rc.1**：0.2.2 的 `ui-workspace` 自己声明会话菜单项，自定义侧栏不再重复声明 ——
  重复声明或越界渲染会让整条侧栏被槽位边界撤下
- **官方 Desktop 那一代照旧装得上**：`engines.dsh` 定在 `>=0.2.1-rc.5` —— 官方 Desktop 的
  latest 通道（0.2.2-rc.1）与还停在 0.2.1-rc.5 的那批都装得上；0.2.2 上的版本表与更新一跳按
  可选透传，宿主没有就回落旧路径

### docs

#### ⚡ 改进

- **版本口径**：README、快速开始与常见问题里的 dsh 版本号跟着 `engines.dsh` 改

### 📦 产物

- [@dsh-workbench/core@1.1.17](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.17)

## v1.1.16

`2026-11-02`

### core

#### 🐛 修复

- **Windows 上浏览器读不再拿回空对象**：base64 包装把脚本包成了一个没人调的函数，序列化出去就是
  `{}`；现在解码后按结果判断，函数调一次、别的原样回值
- **插件列表失败说清原因**：市场里那行不再只报一句「模块异常」—— 把退出码与最后三行输出带出来，
  超时说清多少秒没返回

#### ⚡ 改进

- **DIY 录制认得整段多行 JSON**：`opencli --raw` 那种多行输出也按 `entries` 过滤静态资源，
  不再整段漏进录制

### 📦 产物

- [@dsh-workbench/core@1.1.16](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.16)

## v1.1.15

`2026-11-02`

### core

#### 🐛 修复

- **发布中断不再装成成功**：两段式发布的第二段未完成（中断，或只差最后一步）时，之前被渲染成
  「已发到市场索引」，地址与安装命令都是空的，还把唯一能续跑的 staging 删了 —— 现在原样交回、
  保留 staging；市场那一步要算成功，必须带地址与安装命令；`--resume` 缺记录从运行时根补，
  续跑前先 fetch，拿不到远端就报 git-auth
- **Windows 上也能 DIY 录制**：录制与读侧那套 POSIX 壳编排（`wc` / `tail` / `grep` / `kill -0`
  等）搬进 Node，Windows 不再跑不起来；旧版本残留的 pid / reaper 文件启动时清掉
- **win32 的盘根不算写入域**：两个任意路径的共同根是 `C:\` 时，原来会把整只盘当成可写的；
  现在按盘根判，POSIX 与 win32 都拒

#### ⚡ 改进

- **引号与启动参数只有一份**：新的渲染层统一出命令与调用算子（pwsh 的行以引号开头时补 `&`），
  执行缝与首次安装都从它取；Windows 上浏览器读的 eval 脚本改走 base64 + TextDecoder
  （PowerShell 会把带引号的脚本拆坏）；部署上限按 `DSH_PERMISSION_MODE` 给，
  `danger-full-access` 不再被收窄成 `workspace-write`

### 📦 产物

- [@dsh-workbench/core@1.1.15](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.15)

## v1.1.14

`2026-11-02`

### core

#### ✨ 新增

- **体检每一步都看得见**：每行自带命令、输出尾部、超时与失败原因，点行内箭头就地展开，有新日志
  就滚到底；运行中只留一行短描述，底部的计时与全局原始输出收掉

#### ⚡ 改进

- **装东西统一走 pnpm**：插件、模块库、后台工具三条安装都走 `pnpm add`，store / cache / state
  钉在运行时根；Desktop 自带的 pnpm 直接用，没有就本地装一份（npm 兜底）。首次装后台工具不再
  依赖可写根与部署档位
- **不用再往 profile 补可写根**：工作台跑命令时自己带沙箱策略，启动器不再给 profile 打补丁；
  旧 profile 里残留的那行由 migrate 清掉，市场「被沙箱拦住」的提示也不再教用户改 profile
- **执行缝按写入域声明**：工作台与模块起进程只拿该拿的写入范围（product / workspace / paths /
  none），宿主接线另开 host 档；凭据、会话、profile 不在子进程可写范围。被拒时分三档
  （sandbox-denied / read-only / workspace-unknown），幂等命令可安全重试；模块只拿得到 unit /
  workspace 两档，清单里用 `host.writes` 声明，没声明就没有这份能力
- **模块模板只剩一份**：新建模块默认那份补齐写通道与审批、prefs、多条读、联动、卡片区块拆分；
  原来那份 minimal 模板删掉；模块按 `pnpm-workspace.yaml` 的 glob 发现，不再假设在 `packages/` 下
- **DIY 发布拆两段**：先在 workspace 域里构建、检查、git 提交，再到 product 域写市场索引与产物；
  产物与发布记录先落 staging，成功后镜像回运行时根
- **内部各只剩一个入口**：文件写、当前时间、环境变量、patch 解析、起进程都收进共享包的一处入口，
  由门禁钉住；新增重复代码检测（jscpd）

#### 🐛 修复

- **重启后卡片挂不上**：宿主路由还没起好（503）或清单里还没有刚注册的 unit 时，客户端按 1 秒
  自己再读，最多 30 次，拿到完整清单即停；有事实推送进来时把重试计数清零

### docs

#### ⚡ 改进

- **设计层边界**：新增 `DESIGN-BOUNDARIES.md` —— 按 dsh / 外壳 / 契约 / 适配器 / 模块 / 工具链 /
  环境 / 发布八层，写清各层拥有什么、公开面、跨层接缝与不拥有什么
- **命令执行**：执行缝的入口、`ShellResult.sandbox` 与无会话时策略从哪来写准，删掉文档里
  不存在的符号
- **模块 DIY**：STEPS / FLOW / TOOLS 补操作规范与示例，跟唯一那份模板对齐
- **文档事实**：门禁链、架构规则、适配器契约这些容易漂的段落改由脚本从源码生成，门禁校验

### 📦 产物

- [@dsh-workbench/core@1.1.14](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.14)

## v1.1.13

`2026-10-30`

### core

#### ⚡ 改进

- **命令没返回时说得清**：预检多一档「命令行没有返回」—— 命令发出去了结果没回来，不再当成没装
  或连不上命令行；下一步是彻底退出工作台（托盘也要退）、清掉系统临时目录里 `dsh-` 开头的残留
  再打开，反复出现就升级 dsh，并说明重装 Node / npm / pnpm 不会有帮助
- **卡住的命令不再干等**：跑 shell 有超时，结果带 `stalled` 标记；版本探测最多等 30 秒，不会
  因为一条命令卡住就一直转圈

### 📦 产物

- [@dsh-workbench/core@1.1.13](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.13)

## v1.1.12

`2026-10-30`

### core

#### ⚡ 改进

- **轮询只读本机，不问源**：切回市场、定时轮询这些刷新只读本机那份「装了什么、哪一版」；去源上问只在
  点「检查更新」时（进市场时若上次检查已过期，照旧会查一次）。打开更快，也不会被网络拖着；没查过新版的
  模块不再被标成「问不到源，稍后重试」
- **检查结果留得住**：这次读本机只补版本，不覆盖上一次检查出的「有新版本」「装不上」「要重启」；
  标记留在行上，到下次显式检查

### 📦 产物

- [@dsh-workbench/core@1.1.12](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.12)

## v1.1.11

`2026-10-30`

### core

#### ✨ 新增

- **每一行都能看它的来历**：已安装的模块与插件，点名字进一页详情 —— 安装源、注册表、依赖写法、模块标识、
  当前版本与可用版本；插件另有插件名与安装时间；从市场装的再给出模块来源、仓库、提交、目录，以及新版
  从哪装、是哪一版。动作还是那几个（装、更新、卸、设为默认），「市场」返回列表，失败卡片与提示也一并带过来

### 📦 产物

- [@dsh-workbench/core@1.1.11](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.11)

## v1.1.10

`2026-10-29`

### core

#### ⚡ 改进

- **有动静的分组浮到上面**：组内还是待审批 → 通知 → 运行中 → 无状态，整组有没有这样的人也参与排序；
  同档按工坊 → 默认工作区 → 工作区，都没动静的组沉底
- **等的时候看得见等了多久**：预检每一档等待都显示「已等待 N 秒」；在装工作台自己那份 npm / pnpm 时
  单独说明第一次要下载、慢一点正常

#### 🐛 修复

- **被系统拦住时说清是哪拦的**：市场索引、模块来源、模块的说明与更新日志、发布预览，碰到沙箱拦写不再
  只报「读不了」—— 直接说这个 profile 的可写根盖不住工作台的缓存目录，并把该补进 `cordis.patch.yml`
  的那段配置连文件路径一起给出来

### docs

#### ⚡ 改进

- **统一叫「连接浏览器」**：安装、快速开始、常见问题、模块页一起改口
- **环境步骤**：中英两份重写 —— 检查运行环境 / 检查运行时 / 安装后台工具 / 连接浏览器 / 检查 DIY 模式 /
  连上站点

### 📦 产物

- [@dsh-workbench/core@1.1.10](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.10)

## v1.1.9

`2026-10-29`

### core

#### ✨ 新增

- **多步的事可以固化成流程**：DIY 里先问一句「只做这一次，还是以后都按同样步骤跑」。要固化，就把等待、
  轮询、重试、条件、子流程写成一条 workflow（宿主半侧的 `deps.flow`），跑起来是一条长任务行 —— 到哪步、
  重试第几次、要登录、可停止；写平台之前先过一次审批。只此一次的事不建模块，直接执行
- **运行时不再写死一份**：外壳的代码与文案里不再点名具体运行时（门禁钉着）—— 插件区怎么叫、装不上怎么修、
  桥接断在哪里，都取适配器给的档案；界面按能力收：没有浏览器桥就不出浏览器那组 DIY 工具、也不出预检里的
  「连接浏览器」，没有命令行就不出「安装后台工具」，没有插件市场就不出插件分区；能力未知时照旧显示、不闪。
  默认那套拆成独立包（`@dsh-workbench/adapters-default`），是 core 的依赖，照旧装 core 一个包就能用；
  第三方照 `AdapterSet` 契约交一份，profile 里把 `adapterSet` 写成包名就能换，启动失败就回落到默认那份，
  原因写进启动日志与 `/health`

#### ⚡ 改进

- **左栏按「现在该看什么」排**：组内四档 —— 待审批 → 通知 → 运行中 → 无状态；分组还是工作区 / 默认工作区 /
  工坊，只在组内排，同档保持原来的先后
- **打开列表不再自动滚到那一行**：排序已经把该看的那行放到组内最前，那次滚动是重复的
- **预检的排障输出只有一份**：详细输出不再和失败面板各摆一份
- **门禁多钉几条**：外壳不许点名具体运行时、适配器包不许进外壳测试、测试文件一律住 `__tests__`，
  命令面也进了契约判据

#### 🐛 修复

- **老机器的预检不再卡死**：工具链清单每次启动归一 —— 清掉残留的旧条目与老的 `pnpm-workspace.yaml`；
  之前它会被一起解析、一直重试装不上，预检就停在那儿
- **发布带标签不再写脏包**：`--label` 只进市集条目，不再往 `package.json` 写；之前写完协议检查必红，
  包先被写脏了
- **「更新」按钮的颜色**：口径改成跟着文案走，`install-version` 那条也在内

#### 🗑️ 移除

- **市场行上的「问 agent」**：收掉；失败卡片里那份「复制给 agent」保留

### docs

#### ⚡ 改进

- **首页与 README 换了个说法**：从「看板由你定」改成「少切换。更专注。」，补上「为什么是它」与取 / 汇 / 通；
  看板的「轻交互」口径写进 README、`CONTEXT.md` 与 DIY 的 `PANEL.md`
- **架构**：补「第三方适配器集合」—— 契约、`adapterSet` 怎么选、失败怎么回落；测试按协议写，不按实现写
- **页脚**：「开发」那几个链接的样式收了一下

### 📦 产物

- [@dsh-workbench/core@1.1.9](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.9)

## v1.1.8

`2026-10-28`

### core

#### ✨ 新增

- **发布能带市场标签**：给模块挑 1–2 个短词（比如「发布编排」「构建状态」），发布到市场时一起写进索引，
  审批屏上也会列出这次要带的标签；模块还没有标签时先让你补，不用为一条缺标签的发布白批一次。
  每次发布对市场元数据只动标签，标题、署名、说明仍保持索引里那份

#### ⚡ 改进

- **索引一个包一个文件**：每个包的全部版本收进 `market/<包名>.json`，不再一个版本一个文件；
  发布只动这一个文件，翻索引也少一层目录
- **产物按包名放**：打包文件从按版本分的目录收进 `artifacts/<包名>/`，换版就地覆盖，不堆版本目录

#### 🐛 修复

- **迁移补回模块 id**：从旧索引里记的 git 产物路径（`packages/<目录名>`）认出模块 id 写进条目，
  旧索引迁移完不再缺 `metadata.unit`

### 📦 产物

- [@dsh-workbench/core@1.1.8](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.8)

## v1.1.7

`2026-10-28`

### core

#### ✨ 新增

- **库和面板共用一份 opencli**：模块依赖的库可以声明自己会跑 `opencli`（`runs: ["opencli"]`），
  工作台把面板正在用的那份执行器交给它 —— 同一套插件、同一份登录态，不用各自在 PATH 上找；
  旧版库没这个约定时照旧按 PATH 跑，只在日志里提醒一句

### 📦 产物

- [@dsh-workbench/core@1.1.7](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.7)

## v1.1.6

`2026-10-28`

### core

#### ✨ 新增

- **一次检查全部更新**：市场页头多了「检查全部更新」，一次对完所有模块与插件；模块区、插件区各有自己的
  检查按钮，各自的检查状态分开记，互不打断
- **用着的模块也能更新**：新版要盖掉正被加载的那一份时，另起一个进程换，换完核对盘上是哪一版；
  更新还没生效时，给一张「更新未生效」的卡片，写清盘上和源上各是哪一版，附一条粘贴到终端即可运行的命令

#### ⚡ 改进

- **发布只动自己那一条**：索引从一份 `market.json` 改成按包分的条目目录（`market/<包名>/`），
  发布时只写这个包的条目与产物，别人同时发版也动不到你这一条；打包文件也从 `packages/` 挪到 `artifacts/`，
  不再和 npm 包路径混在一起

### 📦 产物

- [@dsh-workbench/core@1.1.6](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.6)

## v1.1.5

`2026-10-28`

### core

#### ✨ 新增

- **安装失败时能看到停在哪一步**：市场里装不上时给一张卡片 —— 写清是没写入权限、磁盘满还是被系统拦住，
  各给一条下一步（权限给 `chown` / `chmod`，磁盘满给看占用的命令，认不出原因就把问题连成一段给 agent），
  复制命令并运行，完成后回来点「再检测」；安装输出也能展开
- **用不了能一键问 agent**：模块安装后却用不了时，行上多一个「问 agent」，把模块名、单元和原因
  连成一句话复制走，贴进对话就有人接手
- **缺的命令能按声明安装**：`bin` 可以写一条安装命令（按平台给），工作台照抄执行；也可以指向一个
  npm 包，装进共用运行时、接上 `.bin` —— 两样都没写就只显示缺哪条命令
- **插件命令的审批写清细节**：审批屏上多一栏「agent 说」，并列出插件、命令和它声明过的参数；
  声明之外的格子不上屏，标题只留动作
- **记得上次选的源**：「添加模块」浮层记住上次挑的模块来源与自己贴过的地址，下次打开先选中它

#### ⚡ 改进

- **装的时候不误报**：安装中与刚装完的模块算「检测中」，期间不显示缺件、待重启那类提示
- **检查结果说清差在哪**：检查更新后没查成的模块单独计数；行上写清「没配来源，未检查新版」
  或「问不到源，稍后重试」
- **卸载找得回原来的源**：每个包在装的时候记下从哪个源来的，卸载前临时把对应 scope 指回去，
  卸完还原，`.npmrc` 里别处不动
- **空白看板的按钮在窄栏改单列**：侧栏窄的时候，两个操作按钮不再挤成两截

### 📦 产物

- [@dsh-workbench/core@1.1.5](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.5)

## v1.1.4

`2026-10-27`

### core

#### ✨ 新增

- **已安装的模块从索引更新**：市场「已安装」页会对一遍模块来源，源上的版本更新就多一个「更新」，
  点了按索引里记的来源重装；带路径的 Git 依赖也能认出包名
- **Git 地址记住上次能用的那条**：同一个仓库探过 SSH 与 HTTPS，下次装它先走上次成功的那条，
  不用再从头试一遍；探过的地址也缓存着

#### ⚡ 改进

- **检查更新带上状态**：按钮旁直接写「正在检查…」「最近检查：刚刚」，没查到时说「最近一次没查到，
  检查网络后重试」，不用再靠一个只转圈的图标猜

#### 🐛 修复

- **有来源却没包名的模块**：更新退回原来那条路，不再出现一个点了就报错的按钮

### 📦 产物

- [@dsh-workbench/core@1.1.4](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.4)

## v1.1.3

`2026-10-27`

### core

#### ✨ 新增

- **从哪读这个仓库**：安装前先探一遍 Git 地址 —— SSH 与 HTTPS 各是「能读」「要凭证」还是「连不上」，
  可以换一条再装；也能贴公司镜像或别名试一下，探通了就用它
- **安装能看见、能取消**：装的时候写清正在装哪个模块，等不下去点「取消安装」；取消掉的这次不算失败
- **要凭证说清楚**：安装失败或索引读不了时，如果是缺 Git 凭据，直接给下一步 —— 先在终端里 clone 一次、
  配好凭据助手，或改用 SSH 地址

#### ⚡ 改进

- **检查更新**：转圈跟整段检查走 —— 版本的读取也算在内，几项检查叠在一起时最后一个结束才收

### 📦 产物

- [@dsh-workbench/core@1.1.3](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.3)

## v1.1.2

`2026-10-27`

### core

#### ✨ 新增

- **模块来源分可发布与只读**：「发现」页每个源都带状态标签，菜单里能来回切 —— 设为可发布，它就能当
  发布目的地；改回只读，就只用来浏览模块。http 地址的模块来源只能读。有多个源时，发布还能指定发到哪一个；
  改的是本机配置，不碰仓库
- **一个包名归第一次发布的人**：换署名发同名会被拒，理由里给出三条路 —— 换带 scope 的包名、
  用 `author` 带上原来的署名、或请索引维护者改 `market.json` 里的 `owner`。模块 id 与产物目录也一并认领；
  以前发的条目没记认领人时，按原来的署名算
- **发布时一并写更新日志**：这一版改了什么随发布写入，审批屏上看到的就是将要写进去的那段；
  批一次、落一次。文件不在会先建，这一版已有内容就不动

#### ⚡ 改进

- **右栏跟随**：dsh 界面切换时右栏即时收放，不再等下一轮轮询；把中间那列交还给 dsh 时，
  右侧边栏一并收起，不留一块空面板
- **发布前先拦**：模块 id 撞了、产物目录或包名被占、这一版还没写更新日志，都在发布前给出理由，
  不用再批一次注定失败的发布

#### 🗑️ 移除

- **单独的更新日志工具**：`workbench_diy_changelog` 与 `dsh-wb-module changelog init` /
  `dsh-wb-module changelog add` 没了 —— 建文件与写条目都并进发布（`--changelog-note`），
  `changelog check` 留着只读

### docs

#### ⚡ 改进

- **浏览器连接**：安装、快速开始、常见问题补上 OpenCLI 扩展的安装与自检；Desktop 的
  「打开浏览器」、连了多个账号怎么选也写清了
- **模块页**：补上面板数据从哪来、模块来源是什么，以及发布时的认领规则
- **修正**：数据共用（会话 / 项目 / 附件三种装法一份）、架构层图与门禁链、配置同步路径

### 📦 产物

- [@dsh-workbench/core@1.1.2](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.2)

## v1.1.1

`2026-10-27`

### core

#### ✨ 新增

- **工作台**：dsh 的 Agent 工作台 —— 左栏项目与会话，中间常驻对话，右侧一块只读看板。
  界面只读，写入只走 agent 工具，会改数据的先过审批
- **看板由你定**：装（模块市场里装、升、卸）、开（每个工作区决定开哪几张，没配过的跟随机器默认板）、
  排（拖动调整顺序，也可以让 agent 来挪）、配（每块卡片有自己的设置，改完即时生效）、
  造（DIY 模式让 agent 在工作区里现场制作一个模块并安装）
- **三种装法**：独立实例（自己的 `:3081` 与 profile）、装进 `dsh web`、装进 Desktop；
  会话、项目、附件三种装法共用一份，设置与插件各一份
- **模块**：声明协议到 v3，模块可以直接写中英名称；构建、安装、升级、卸载与十三条判据
  由 `@dsh-workbench/module-tools` 管
- **迁移**：从 1.0.0 之前的独立实例升上来，跑 `dsh-workbench migrate`，或在模块市场点「迁移旧数据」

#### ⚡ 改进

- **零注释**：全仓代码不留注释，规则落到门禁里；只有公开入口的成员允许贴导出的 JSDoc，
  该面的判定按「公开入口可达的文件」算
- **门禁**：一条链依次完成类型、lint、覆盖率、架构红线、文档、运行时隔离、接线自检、模块判据、
  发布产物；链首先 build，干净 clone 上也能一次跑通
- **提交**：接入 commitlint 与提交钩子，提交信息不合规当场被拒

### docs

#### ✨ 新增

- **文档站**：你现在看的这个站点，Pagoda CLI 搭的；指南、常见问题、架构与这份更新日志

### 📦 产物

- [@dsh-workbench/core@1.1.1](https://www.npmjs.com/package/@dsh-workbench/core/v/1.1.1)
