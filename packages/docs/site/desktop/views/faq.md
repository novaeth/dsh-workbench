# 常见问题

## 起不来

| 症状 | 怎么办 |
| --- | --- |
| 启动被拒，说 dsh 太旧 | `npm i -g @deepseek-ai/dsh@latest`，再重启工作台 |
| `:3081` 被占 | `WORKBENCH_PORT=3091 npx @dsh-workbench/core` |
| 起得来但页面没反应 | 换现代浏览器；看终端有没有报错；插件冲突也会这样 |

## 界面不对

| 症状 | 怎么办 |
| --- | --- |
| 左栏恢复出厂、右侧面板消失 | 插件被关了。Settings → 插件，把 `@dsh-workbench/core` 拨回来；进不去就按 `Meta+,` |
| 面板一直空着 / 一直转 | 先确认这个工作区装了模块、平台账号登了；第一次加载可能要几秒 |
| 页面白屏 / 提示插件加载失败 | 多半是插件冲突。重启工作台、检查插件开关，仍不行去仓库开 issue |

## 装进 Desktop 之后

- **没变化**：确认装的是 Desktop 那份 profile，不是另建的实例；装完要重开窗口。
- **提示要重启 / 权限**：退出并重开 Desktop，再试一次。
- **`:3081` 上的是另一个东西**：那是独立实例，跟 Desktop 不是一套数据。Desktop 不需要跑 `setup`。

## 数据对不上

- 独立实例与 `dsh web` **互不影响**，各自会话、各自设置，只有登录凭据共用。
- 装进 `dsh web` / Desktop 的，会话沿用当前的，不另开一份。
- 换了 `--profile` 就是换了整套数据 —— 先确认你起的是哪个 profile。

## 想改它

- 门禁只有一条链，跑 `pnpm run check`；环境与提交约定见仓库的 `CONTRIBUTING.md`。
- 架构与判据见 <PagodaDocLinkToView view="guide/architecture">架构</PagodaDocLinkToView>。
- 只想加个面板？开 DIY 模式让 agent 做，见 <PagodaDocLinkToView view="guide/modules">面板与模块</PagodaDocLinkToView>。
