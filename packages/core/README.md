# @dsh-workbench/core

工作台本体是一个 **DeepSeek Harness 插件**，为 dsh 换一层工作台：左栏项目与会话、
中间常驻对话、右侧一列实时数据面板。dsh 本体一行不改，安装与否都只影响你自己的环境。
同仓的其他包（`shared` / `module-tools` / `module-hello` / `adapter-*` / `adapters-default`）是给**作者与实现者**的库、样本与适配器，
终端用户只需要安装这一个。

> 第一次使用请先看根目录的 [README](../../README.md)：安装方法、界面构成与适用场景。
> 这一份讲**安装完成之后**的事：数据落在哪、出问题怎么查、从源码怎么运行。

## 安装

工作台安装在 **Desktop（DeepSeek Harness.app）** 中，和其它插件一样：

1. 打开 Desktop 侧栏 **Plugins → Add plugin**
2. 填 `@dsh-workbench/core`，**Install → Enable now**
3. 重新打开窗口 / 刷新

安装后，模块市场、看板与设置都会出现；会话、项目与附件沿用 Desktop 现有的那一份。
Desktop 里页面调试不可用：站点只读探索、录制、面板与状态照旧；不带站点地址的看 / 动会被拒绝并说明下一步。

先决条件：

| 要有 | 为什么 |
|---|---|
| Desktop（DeepSeek Harness.app） | 工作台作为插件安装在里面 |
| Chrome / Edge / Brave / Chromium / Vivaldi | 面板要借助浏览器里的登录状态读取数据；第一次打开时安装一次 OpenCLI 扩展 |

还需要在浏览器里**安装一次 OpenCLI 浏览器扩展**（opencli 的浏览器插件）。工作台会自动安装 opencli 的隔离运行时，但扩展必须在浏览器里安装，因为面板要读取你浏览器里的登录状态。Chrome / Edge / Brave / Chromium / Vivaldi 都支持。请从 [Chrome 应用商店](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk) 安装并启用，安装后保持浏览器打开。不安装也能进入工作台，只是依赖登录状态的面板取不到数据；细节见下面「首次打开会自动做什么」。

## 包里有什么

`package.json` 的 `files` 是白名单：漏一项时，仓库内的检查全部通过，安装后的那一份却不生效。

| 路径 | 是什么 |
|---|---|
| `dist/host/**` | 宿主侧入口（`exports["."]`）；构建产物，不进 git |
| `dist/types/**` | 类型声明（`exports` 的 `types` 指向这里）；构建产物，不进 git |
| `client.js` | 浏览器侧 bundle，dsh 客户端按 `dsh.client` 加载 |
| `cordis.patch.yml` | 把自己插进 profile 组合图的补丁（装载） |
| `profile/` | 出厂 profile 模板：可写根那一行（启动器 `--patch` 用，seed 也抄进 profile） |
| `skills/` | 模块 DIY 指引，安装完成后提供给 agent；漏掉也不会报错，只是 agent 不知道如何创建模块 |
| `bin/` | `dsh-workbench` 启动器、隔离 opencli 的入口 |
| `scripts/` | 随包出货的脚本：`seed-profile.sh` / `seed-workshop.sh` / `create-workbench.mjs` / `clone-profile.mjs` / `share-data-root.mjs` / `patch-blocks.mjs` / `profile-dsh-layer.mjs` |
| `icon.svg` | 插件图标（dsh 插件页用） |

「工作台 DIY 模式」不在这个表里：**启动时按 dsh 当前的模式声明派生**，没有生成物。`src/shared/api/host/diy-preset.ts` 从用户选中的模式（默认标准模式 `standard`，在「工作台设置 → DIY 模式继承自」里改）克隆插件表、叠加三处差分并注册；纯规则在 `../shared/src/host/diy/diy-preset.ts`。dsh 增加工具或调整 preset 行时，派生结果随之更新；改完这项设置后，新会话开始生效。

## 数据落在哪

| 内容 | 位置 |
|---|---|
| dsh 的设置与插件（模型、主题、插件） | `~/.dsh/profiles/<名字>`；Desktop 下就是 Desktop 那份 |
| 工作台自己的开关（MCP 按需加载、尝鲜版本、模块模型、DIY 模式继承） | `~/.dsh/workbench/settings.json` |
| 会话、项目列表、附件 | `~/.dsh/{sessions,storages,attachments}`；与 Desktop **共用一份** |
| 工作台运行时（opencli 隔离运行时、工坊、模块市场、自更新日志） | `~/.dsh/workbench/**` |
| 面板与模块配置 | `~/.dsh/workbench/workspaces/**` |
| API 凭据 | `~/.dsh/.credentials.yaml`；与 Desktop **有意共用**，一台机器只用一个 key |
| DIY 工坊依赖安装日志 | `~/.dsh/workbench/seed.log` |

模型、主题、插件沿用 Desktop 的那份配置，在 Settings 里改；工作台自己的开关另存在 `~/.dsh/workbench/settings.json`，只影响这份工作台。

## 日常

| 想做什么 | 怎么做 |
|---|---|
| 更新工作台 | 在模块市场的「工作台」那一行选择「更新」，完成后退出并重新打开。新版本会按依赖重新安装，旧版安装的 dsh 包会被清掉；版本目录（`~/.dsh/workbench/versions/`）只留当前和上一版 |
| 升级 dsh 之后 | 先更新工作台，再升级 Desktop；启动失败就重新安装一次工作台并重启 |
| 换左栏 | 设置 → 工作台设置 → 会话列表：默认官方；切换后会自动刷新页面生效（从旧版本更新上来的，第一次需要重启） |
| 安装模块 | 打开模块市场，或让 agent 安装 |
| 用某个模块做件事 | 在 `/` 菜单里选 `/workbench-` 加模块的 unit id（例如 `/workbench-gitops`），可以带任务；agent 会自己打开这个模块的工具集 |
| 不再使用 | 在插件页移除；浏览器里的 OpenCLI 扩展不会随之移除，到扩展页移除 |

工作台本身**不带业务模块**：右侧面板的内容来自已安装的模块，可在插件页或模块市场安装。

模块装了、在当前项目里启用之后，`/workbench-` 加模块的 unit id 才会出现在 `/` 菜单里；它就是「用这个模块的工具做件事」的入口：命令先打开这个模块的工具包，再把你的任务原样交给 agent；不点名具体工具，不用记工具名。不带任务就让 agent 先看看它能查什么。

⚠️ **不要在 Settings → 插件里关闭 `@dsh-workbench/core`**：关闭后，工作台对界面的修改会整体失效，
界面退化成原版 dsh（左栏恢复、右侧面板消失），但数据不会丢失。重新启用后恢复原样；
如果进不去设置页，按 `Meta+,`。

## 首次打开会自动做什么

- **安装 opencli 的隔离运行时**：它放在 `~/.dsh/workbench/opencli/`，通过修改 `HOME` 与插件目录与本机环境隔离，
  **完全不影响**你本机的 `~/.opencli`。安装失败时（无网络或安装源不可达），失败提示里会有一条可以直接复制到终端
  执行的命令；这条命令需要在终端里运行，因为工作台发起的命令带有文件沙箱。
- **浏览器扩展需要你安装一次**：`~/.dsh/workbench/opencli/` 里没有扩展，opencli 依赖浏览器里的
  OpenCLI 扩展获取登录状态。启动检查里「连接浏览器」未连接时会给出商店链接；安装并启用后
  保持浏览器打开，再回到「准备工作台」选择「重试」。Desktop 里还可以选择「打开浏览器」。
- **要让面板有数据，需要登录对应平台**：在模块上点击「去登录 ↗」，完成后回到工作台点击「重试」。
  工作台刻意不做自动重试，因为无法确定登录何时完成。
- 没登录或安装失败都会显示**明确的失败状态**，不会出现白屏。

## 常见问题

| 症状 | 原因 / 怎么办 |
|---|---|
| 页面白屏、只显示 `Failed to load plugins` | 有插件没有激活成功。检查控制台里的 `[dsh-workbench] 客户端入口失败`，那里写明是哪个位置、哪一版、什么原因。 |
| 工作台一直打不开 | 如果工作台一直打不开，可以把它从这份工作台配置里去掉，再重启 dsh。从 package.json 的 dsh.profile.bundles 里删除 @dsh-workbench/core。 |
| 左栏恢复为默认样式、右侧没有面板 | 工作台插件在 Settings 里被关了（见上一节 ⚠️）。重新启用后恢复 |
| 面板一直空白 | 通常是尚未登录平台（见上）；也可能是这个工作区的 git `origin` 不指向它要读取的平台 |
| 打开面板或刷新时要等 5–8 秒 | 正常：opencli 每次调用约有 5 秒固定开销（启动浏览器会话）。没有缓存，数据一律实时 |
| 启动检查提示「连接浏览器 · 未连接」/ 面板取不到数据 | 扩展未安装或未启用。请从 [Chrome 应用商店](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk) 安装 OpenCLI，在扩展页确认已启用，保持浏览器打开，再回到「准备工作台」选择「重试」。有多个浏览器账号时，会要求先选择默认账号，按页面给出的命令操作 |
| 启动检查提示「连接浏览器 · 未连接」，但面板可以使用 | 本机安装的 opencli 与工作台使用的版本不一致，后台服务被替换成了另一方的版本；下一条浏览器命令会自动重启它，复检后恢复为「已连接」 |
| Desktop 里启动检查一直「未连接」 | 浏览器没有打开。「准备工作台」有「打开浏览器」，点击后才会打开上次承载扩展的那个浏览器（未记录时使用 Chrome），打开后自动复检；点击会把 Chrome 切到前台（冷启动需要抢焦点，无法静默完成）。仍然连不上，通常是扩展未安装或被禁用 |
| 准备页没有进展、提示「命令行没有返回」 | 命令已发出但结果没有返回（常见于 Windows 沙箱残留的锁文件）。请完全退出工作台（托盘图标也要退出），清掉系统临时目录里以 `dsh-` 开头的残留文件，再重新打开；如果反复出现，请升级 Desktop。 |
| 启动被拒，提示 dsh 太旧 | 升级 Desktop，安装完成后重启；仍被拒时先升级工作台 |
| 升级 dsh 之后启动失败，日志只有 `N required plugins did not activate` | dsh 的兼容性预检把旧版工作台安装的插件逐个停用了。重新安装一次工作台（插件页或模块市场），再重启 Desktop |
| 左栏没有「工作台 DIY」，模式下拉里也没有「工作台 DIY 模式」 | DIY preset 在启动时按「工作台设置 → DIY 模式继承自」选中的模式派生（默认标准模式 `standard`）。如果 dsh 太旧（没有 `loader` / `agentPresets` 的注册入口）、选中的模式不见了，或它缺 `skill-filesystem` / `tool-skill` 这两行，就无法派生；选中的模式不可用时会退回标准模式（`standard`）。dsh 的模式选择器只列出能挂载的项，因此入口会消失且不报错。启动检查会指出这一点并给出升级命令；自行核对可查看 dsh 的「设置 → Agent presets」中对应行的红标与原因。 |
| 在自己的项目里启用 DIY 模式后，面板提示没找到模块 | 模块跟随**这条会话的工作区**，不跟随工坊：① 该工作区的某个 `package.json` 要声明 `dsh.workbench`；② 从工坊带过去的模块，需要把模块目录移动或复制到那个仓库；③ 旧截图不会迁移（新的放在 `~/.dsh/workbench/artifacts/<工作区>/`）。细节见工作台模块指引 |

## 从源码运行

克隆仓库、安装依赖，运行 `pnpm run dev` 启动开发实例，命令与门禁纪律见
[CONTRIBUTING.md](../../CONTRIBUTING.md)；架构与模块协议见
[ARCHITECTURE.md](../../ARCHITECTURE.md)。

## 相关文档

| 想了解 | 读 |
|---|---|
| 安装、界面、适合谁 | [根 README](../../README.md) |
| 架构、两个运行时、槽位、数据通路、门禁 | [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| 写一个模块 | [DIY 指引](skills/workbench-module-diy/SKILL.md) |
| 模块的构建与十四条判据 | [module-tools](../module-tools/README.md) |
| 共享包（契约、哑组件、宿主工具） | [shared](../shared/README.md) |
| 最小模块样本 | [module-hello](../module-hello/README.md) |
| 环境、门禁、提交 | [CONTRIBUTING.md](../../CONTRIBUTING.md) |
