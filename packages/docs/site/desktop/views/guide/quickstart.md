# 快速开始

三分钟就能开始使用。需要的东西不多：`dsh`、Node 与 pnpm，外加一个能安装扩展的浏览器。

## 前置

| 要有 | 为什么 |
| --- | --- |
| `dsh`（≥ `0.2.2-rc.1`） | 本体。版本太旧会被拒绝，升级只需一条命令 |
| Node + pnpm | 用于安装与插件命令 |
| Chrome / Edge / Brave / Chromium / Vivaldi | 面板要借助你浏览器里的登录状态读取数据；第一次打开时需要安装一次 OpenCLI 扩展 |
| 可选：运行过一次 `dsh web` | 想沿用它的设置或插件时使用；没有也能创建 |

:::tip dsh 太旧会被阻止
启动器会自己比对版本，太旧就停下来说明该升到哪一版，而不是装到一半失败。
:::

## 装

推荐独立实例：它有自己的端口（`:3081`）和 profile，与 `dsh web` 的 `:3080` 并存；
会话、项目、附件是同一份。端口写在实例自己的 profile 里，所以无论用 `npx @dsh-workbench/core`
还是直接 `dsh workbench` 启动，都是同一个实例、同一个端口。

```bash
npx @dsh-workbench/core create
```

交互式创建，会询问来源、名字以及是否复制设置（会话和项目本来就是共用的，不需要复制）。想跳过问答、直接创建默认实例：

```bash
npx --yes @dsh-workbench/core@latest setup
npx @dsh-workbench/core
```

`setup` 可以重复执行，用于补充环境或升级。另外两种装法（装进 `dsh web`、装进 Desktop）见
<PagodaDocLinkToView view="guide/install">三种装法</PagodaDocLinkToView>。

:::warning Windows 上别走这条
独立实例的启动器还是 bash 脚本，`create` 与 `setup` 在 Windows 上会报找不到 `bash`。
用 `dsh web` 的插件页或 Desktop 的插件页装，效果一样。
:::

:::tip 还差一步：第一次打开前安装浏览器扩展
工作台会自己安装 opencli 的运行时，但**浏览器里的 OpenCLI 扩展需要你安装一次**，面板才能读到数据。
步骤在下一节；不安装也能进入工作台，只是依赖登录状态的面板会空白。
:::

## 第一次打开：过一遍自检

在浏览器打开 <http://localhost:3081>。第一次启动时会先出现「准备工作台」这一屏：工作台自行准备运行环境
（不会改动你本机已有的工具配置），然后依次执行自检（共 6 步）：检查运行环境、检查运行时、
安装后台工具、连接浏览器、检查 DIY 模式、连上站点。运行时放在 `~/.dsh/workbench/opencli`，
**不碰**你本机的 `~/.opencli`。

面板不自己存数据，它读取的是你浏览器里的登录状态。所以还需要在浏览器里**安装一次 OpenCLI 扩展**：

1. 打开 [OpenCLI（Chrome 应用商店）](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，点安装
2. 到扩展页确认它已启用；用平时登录这些平台的浏览器账号，保持浏览器开着
3. 回到「准备工作台」这一屏点「重试」

安装扩展后，再安装模块，并按卡片提示登录平台（登录一次即可）。自检里「连接浏览器」未连接也不影响进入工作台，
点「先进入工作台」即可；但在连接成功之前，依赖登录状态的面板取不到数据。Desktop 里还会多一个「打开浏览器」按钮。

真正用起来只有一条主路径：**左栏挑项目 → 中间对话 → 右边看面板**。

## 装一个模块

工作台本身不附带业务模块，安装什么就有什么。右侧初始是一块空看板，可以到「工作台模块市场」安装，
或者直接对 agent 说「装个缺陷面板」。

想自己创建一个？开启 DIY 模式，让 agent 现场创建并安装，不需要先学一套框架。
细节见 <PagodaDocLinkToView view="guide/modules">面板与模块</PagodaDocLinkToView>。

## 升级

```bash
npx --yes @dsh-workbench/core@latest setup
```

然后重启工作台。安装在插件页 / Desktop 的，在模块市场点更新，提示重启时重新打开即可。

## 下一步

- 想并行运行、想拥有独立设置、愿意多折腾：留在独立实例，见 <PagodaDocLinkToView view="guide/data">数据与设置</PagodaDocLinkToView>
- 只想多一列面板：<PagodaDocLinkToView view="guide/install">装进 dsh web</PagodaDocLinkToView>
- 想改动它：<PagodaDocLinkToView view="guide/architecture">架构</PagodaDocLinkToView>，再读仓库里的 `CONTRIBUTING.md`
