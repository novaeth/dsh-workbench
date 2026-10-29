# 快速开始

三分钟能跑起来。要的东西不多：一个 `dsh`、Node 与 pnpm，再加一个能装扩展的浏览器。

## 前置

| 要有 | 为什么 |
| --- | --- |
| `dsh`（≥ `0.2.1-rc.2`） | 本体。更旧的会被拒绝，升级一条命令的事 |
| Node + pnpm | 安装与插件命令要跑 |
| Chrome / Edge / Brave / Chromium / Vivaldi | 面板要借你浏览器里的登录状态读数据；第一次打开时在里面装一次 OpenCLI 扩展 |
| 可选：跑过一次 `dsh web` | 想继承它已有的设置 / 插件时；没有也能建 |

:::tip dsh 太旧会被拦下
启动器会自己比对版本，太旧就停下来说明该升到哪一版，而不是装到一半失败。
:::

## 装

推荐独立实例：它有自己的端口（`:3081`）和 profile，跟 `dsh web` 的 `:3080` 并存；
会话、项目、附件是同一份。

```bash
npx @dsh-workbench/core create
```

交互式，会问来源、名字、要不要复制设置（会话和项目本来就共用，不用复制）。想跳过问答、直接建默认的：

```bash
npx --yes @dsh-workbench/core@latest setup
npx @dsh-workbench/core
```

`setup` 可以重复跑，用来补环境或升级。另外两种装法（装进 `dsh web`、装进 Desktop）见
<PagodaDocLinkToView view="guide/install">三种装法</PagodaDocLinkToView>。

:::tip 还没完：第一次打开要装一次浏览器扩展
工作台自己会装 opencli 的运行时，但**浏览器里的 OpenCLI 扩展要你装一次**，面板才能读到数据。
步骤在下一节；不装也能进工作台，只是要靠登录状态的面板会空着。
:::

## 第一次打开：过一遍自检

浏览器开 <http://localhost:3081>。第一次启动会先出「准备工作台」这一屏：自己准备运行环境
（不改你本机已有的工具配置），然后过一遍自检 —— 装 opencli 的隔离运行时、检查浏览器连接、
检查 DIY 模式。运行时落在 `~/.dsh/workbench/opencli`，**不碰**你本机的 `~/.opencli`。

面板不自己存数据：它读的是你浏览器里的登录状态。所以还要在浏览器里**装一次 OpenCLI 扩展**：

1. 打开 [OpenCLI（Chrome 应用商店）](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，点安装
2. 到扩展页确认它已启用；用平时登录这些平台的浏览器账号，保持浏览器开着
3. 回到「准备工作台」这一屏点「重试」

装好扩展，之后装好模块再按卡片提示登录平台（登录一次就够）。自检里「连接浏览器」没连上不拦路，
可以点「先进入工作台」；但在连上之前，要靠登录状态的面板取不到数据。Desktop 里还会多一个「打开浏览器」按钮。

真正用起来只有一条主路径：**左栏挑项目 → 中间对话 → 右边看面板**。

## 装一个模块

工作台自己不带业务模块 —— 装什么有什么。右侧先是一块空看板，去「工作台模块市场」装，
或者直接跟 agent 说一句「装个缺陷面板」。

想自己做一个？开 DIY 模式，让 agent 现场做完并装上，不用先学一套框架。
细节见 <PagodaDocLinkToView view="guide/modules">面板与模块</PagodaDocLinkToView>。

## 升级

```bash
npx --yes @dsh-workbench/core@latest setup
```

然后把工作台重启。装在插件页 / Desktop 的，在市场里点更新，提示重启时重开即可。

## 下一步

- 想并行、想独立一份设置、想折腾：留在独立实例，见 <PagodaDocLinkToView view="guide/data">数据与设置</PagodaDocLinkToView>
- 只想多一列面板：<PagodaDocLinkToView view="guide/install">装进 dsh web</PagodaDocLinkToView>
- 想改动它：<PagodaDocLinkToView view="guide/architecture">架构</PagodaDocLinkToView>，再读仓库里的 `CONTRIBUTING.md`
