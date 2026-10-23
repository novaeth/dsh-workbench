# 快速开始

三分钟能跑起来。要的东西不多：一个 `dsh`，再加 Node 与 pnpm。

## 前置

| 要有 | 为什么 |
| --- | --- |
| `dsh`（≥ `0.2.1-rc.2`） | 本体。更旧的会被拒绝，升级一条命令的事 |
| Node + pnpm | 安装与插件命令要跑 |
| 可选：跑过一次 `dsh web` | 想继承它已有的设置 / 插件 / 项目时；没有也能建 |

:::tip dsh 太旧会被拦下
启动器会自己比对版本，太旧就停下来说明该升到哪一版，而不是装到一半失败。
:::

## 装

推荐独立实例：它有自己的端口（`:3081`）和自己的数据，跟 `dsh web` 的 `:3080` 并存。

```bash
npx @dsh-workbench/core create
```

交互式，会问来源、名字、要复制哪些内容。想跳过问答、直接建默认的：

```bash
npx --yes @dsh-workbench/core@latest setup
npx @dsh-workbench/core
```

`setup` 可以重复跑，用来补环境或升级。另外两种装法（装进 `dsh web`、装进 Desktop）见
<PagodaDocLinkToView view="guide/install">三种装法</PagodaDocLinkToView>。

## 打开

浏览器开 <http://localhost:3081>。第一次启动它会自己准备运行环境，不动你本机已有的工具配置。

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

- 想并行、想隔离、想折腾：留在独立实例，见 <PagodaDocLinkToView view="guide/data">数据与设置</PagodaDocLinkToView>
- 只想多一列面板：<PagodaDocLinkToView view="guide/install">装进 dsh web</PagodaDocLinkToView>
- 想改动它：<PagodaDocLinkToView view="guide/architecture">架构</PagodaDocLinkToView>，再读仓库里的 `CONTRIBUTING.md`
