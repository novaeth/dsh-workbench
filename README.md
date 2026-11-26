<div align="center">

<h1>dsh-workbench</h1>

<p><strong>看板由你定义。复杂操作，交给 agent。</strong></p>

<p>平台越来越多，工作流越来越碎。<br/>
工作台只取所需，收进一屏：左栏项目与会话，中间常驻对话，右侧一块轻交互看板。<br/>
读取、编排与交付，交给 agent。动手之前，先问你。</p>

<p><sub>An agent workbench — you shape the board, the agent does the work.</sub></p>

<p>
  <a href="https://www.npmjs.com/package/@dsh-workbench/core"><img alt="npm" src="https://img.shields.io/npm/v/@dsh-workbench/core?style=flat-square&color=0ea5e9"/></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square"/>
  <img alt="status" src="https://img.shields.io/badge/status-0.3.x-f59e0b?style=flat-square"/>
</p>

<p>
  <a href="#安装"><b>安装 →</b></a>
  &nbsp;·&nbsp;
  <a href="#why">为什么是它</a>
  &nbsp;·&nbsp;
  <a href="#board">看板如何定义</a>
  &nbsp;·&nbsp;
  <a href="#常见问题">常见问题</a>
</p>

<img src="packages/core/assets/readme-hero.png" alt="工作台：左侧项目与会话，中间常驻对话，右侧一块轻交互看板" width="100%"/>

</div>

---

<a id="why"></a>
## 平台在扩张，专注在流失

| 日常 | 代价 |
|---|---|
| 在多个平台间登录、查找、比对 | 每次都要重新找回状态，思路一再中断 |
| 功能越堆越多，日常只用两三处 | 菜单、加载、通知，都是干扰 |
| 想拼一个自己的视图 | 等排期，或导出表格后手工整理 |
| 想让 AI 参与读取与操作 | 接口不开放，AI 只能停在建议层 |
| 想追溯一次变更 | 记录散落各平台，难以对齐 |

## 取。汇。通。

| | 工作台做的 | 化解 |
|---|---|---|
| **取** | 以模块为界。缺陷、构建、发布、分析，按需而装 | 功能过载 → 只留所需 |
| **汇** | 跨平台数据，汇入同一张看板。按项目开，按你的顺序排 | 多平台 → 一屏 |
| **通** | 即使平台不提供接口，也能读取；写入走看板动作或 agent 工具，留痕可查 | 封闭 → AI 进入工作流 |

平台还是原来的平台。账号、权限、数据，都不迁移。工作台只做一件事：把所需收进一屏，把复杂操作交给 agent。
平台越封闭，这种做法的价值越高：数据从你已登录的浏览器里来，动作由看板或 agent 发起，写入都有记录。谁改的、改了什么，查得到。

## 不是传统看板。也不是聊天框。

| | 传统看板 | 聊天框 | 工作台 |
|---|---|---|---|
| 看板谁定 | 厂商预设，增项等排期 | 没有看板 | 由你定义。缺什么，让 agent 创建 |
| 谁动手 | 你逐项操作 | agent 只给建议 | 单步动作你按；复杂操作 agent 执行。写入都有记录 |
| 结果在哪 | 另一个窗口，等刷新 | 散在对话记录里 | 同屏右栏，即时更新 |
| 边界 | 写操作散在按钮里 | 执行过程不可见 | 轻交互界面。写入留痕 |

> 看板只承载轻交互，这不是能力缺失，而是产品判断：**轻交互留在看板，复杂操作交给 agent。**

<a id="board"></a>
## 看板由你定义。五个动作。

| 动作 | 你做什么 |
|---|---|
| **安装** | 安装、更新、卸载模块。模块安装在本机，所有项目共用。 |
| **启用** | 每个项目启用自己需要的模块。 |
| **排序** | 拖动调整顺序，也可以交给 agent。 |
| **配置** | 每个模块都有它的设置。 |
| **创建** | 缺少的视角，让 agent 现场创建。通过检查后再添加到看板。 |

自定义，不等于随意。看板轻交互。写入都有记录。

## 和 agent，一起工作。三个同。

| 同什么 | 意味着 |
|---|---|
| **同屏** | 对话、模块、详情并排。 |
| **同事实** | agent 读取看板数据，知道哪个模块会变。 |
| **同权限** | 写入走看板动作或 agent 工具。谁改的，查得到。 |

**适合谁**：每天要在多个平台之间往返、但每个平台只用两三处功能的人；想让 AI 接手操作，又不愿放弃审批与追溯的人；以及想为团队创建一个内部工作台的人。

## 一次交代，四拍。

| 拍 | 发生什么 |
|---|---|
| **交代** | 「整理今天的发布风险。把构建模块放到最前。」 |
| **执行** | agent 读取缺陷、查看构建、撰写总结。移动模块前会先征得你的同意。 |
| **看见** | 右栏的模块与顺序即时更新。 |
| **留下** | 调了哪些工具，改了什么，都在对话里。 |

## 安装

工作台是 DeepSeek Harness 的一个插件，安装在 **Desktop（DeepSeek Harness.app）** 中。
不需要另开进程，也不需要输入命令。

前置：

| 要有 | 为什么 |
|---|---|
| Desktop（DeepSeek Harness.app） | 工作台安装在里面，会话与项目沿用它的 |
| Chrome / Edge / Brave / Chromium / Vivaldi | 面板需要借助浏览器里的登录状态读取数据；第一次打开时需要安装一次 OpenCLI 扩展 |

1. 打开 Desktop 侧栏 **Plugins → Add plugin**
2. 填 `@dsh-workbench/core`，**Install → Enable now**
3. 重新打开窗口 / 刷新

安装后，模块市场、看板与设置都会出现；会话、项目与附件沿用 Desktop 现有的那一份，不需要迁移。
Desktop 里个别浏览器调试能力不可用；网页浏览与录制不受影响。
安装模块时遇到权限或重启提示，退出并重新打开 Desktop；仍有问题看
[packages/core/README.md](packages/core/README.md) 的常见问题。

> **第一次打开还需要安装一次浏览器扩展**
>
> 工作台会自动安装 opencli 的隔离运行时，但**浏览器里的 OpenCLI 扩展需要你安装一次**，因为面板要读取
> 你浏览器里的登录状态。用 Chrome / Edge / Brave / Chromium / Vivaldi 打开
> [OpenCLI（Chrome 应用商店）](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，
> 安装并启用后保持浏览器打开，再回到「准备工作台」选择「重试」。不安装也能选择「先进入工作台」，
> 只是依赖登录状态的面板取不到数据。
>
> **没有外网也能安装**：工作台自带一份扩展副本。在启动检查里选择「加载已解压的扩展程序」，目录以检查页面上
> 显示的为准（默认 `~/.dsh/workbench/opencli/extension`；`DSH_WORKBENCH_HOME` 指到别处时随之改变）。
> 这个路径**固定不变**：更新工作台不需要重新选择；只有扩展自身升级时，才需要在 chrome://extensions 里
> 点击一次「重新加载」。

## 第一次打开

- 首次启动会自动准备运行环境（opencli 的隔离运行时在 `~/.dsh/workbench/opencli`），不改你本机已有的工具配置。
- 浏览器里需要安装一次 **OpenCLI 扩展**，并保持浏览器打开；「准备工作台」里「连接浏览器」那一行显示已连接，表示连接成功。
- 需要登录的平台按模块提示登录，完成后回来点击「重试」。
- 右侧初始是一块空看板：到模块市场安装模块，或让 agent 代为安装。
- 失败会说明原因和下一步，不留白屏。

## 模块按需安装

看板五个动作中的「安装」与「创建」都在这里：缺陷、构建、分析等模块可以在模块市场安装、更新或卸载，
也可以交给 agent 完成。工作台本身不带业务模块，安装什么就有什么；安装在同一台机器上的模块，
所有项目共用。

需要创建模块时，开启 DIY 模式，让 agent 现场创建并安装，不需要先学一套框架。
具体做法见 [模块 DIY 指引](packages/core/skills/workbench-module-diy/SKILL.md)。

Desktop 插件页的「精选插件」标签页收录社区精选的插件：安装 dsh-featured 完整版后，
可在那里搜索、按标签筛选并查看详情。

## 数据和设置

- **会话、项目、附件**：都放在 `~/.dsh` 下，Desktop 与工作台共用这一份；安装或卸载工作台都不会修改它们。
- **设置与插件**：沿用 Desktop 的那份配置，工作台不另存一份。
- **运行时的工具**：opencli、工坊、模块市场放在 `~/.dsh/workbench`，不影响其它工具。

## 更新与卸载

- 升级 dsh：先更新工作台，再升级 Desktop；升级后如果启动失败，重新安装一次工作台并重启。
- 更新工作台：选择「更新」后，新版本会安装到旁边一份独立目录里，只修改指向它的链接，
  **不会改动正在运行的那一份**。安装完成后会提示「重启后生效」。退出后重新打开，新版本生效。
  第一次更新前，工作台仍从旧的安装目录运行，这一次需要先退出工作台（界面会提前说明）；之后再更新就不需要了。
  dsh 自带插件页里的插件更新走另一条路径（仍然就地覆盖）；更新工作台请在模块市场操作。
- 卸载：在插件页移除工作台。浏览器里的 OpenCLI 扩展不会随工作台卸载，不再使用时到扩展页移除。

## 常见问题

| 症状 | 怎么办 |
|---|---|
| 启动被拒，提示 dsh 太旧 | 升级 Desktop，再重启；仍被拒时先升级工作台 |
| 左栏恢复默认样式、右侧看板消失 | 插件被关闭了。打开 Settings → 插件，重新启用 `@dsh-workbench/core`；进不去就按 `Meta+,` |
| 启动检查提示浏览器未连接 / 看板取不到数据 | 安装一次 [OpenCLI 扩展](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)并启用，保持浏览器打开，再回到「准备工作台」选择「重试」；也可以选择「打开浏览器」 |
| 看板空白或持续加载 | 依次确认：这个工作区已安装模块、平台账号已登录、浏览器连接正常；第一次加载可能需要几秒 |
| 页面白屏 / 提示插件加载失败 | 通常是插件冲突。重启 Desktop 并检查插件开关；仍未解决就到仓库提交 issue |

## 更多文档

| 想了解 | 读 |
|---|---|
| 完整用户指南 / 首次打开 / 常见问题 | [packages/core/README.md](packages/core/README.md) |
| 文档站（本地起一个看） | [packages/docs/README.md](packages/docs/README.md) |
| 从源码构建、门禁、提交 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 架构 / 模块协议 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 写一个模块 | [模块 DIY 指引](packages/core/skills/workbench-module-diy/SKILL.md) |
| 安全 | [SECURITY.md](SECURITY.md) |

## 参与开发

从源码构建、门禁与提交约定见 [CONTRIBUTING](CONTRIBUTING.md)；
架构与模块协议见 [ARCHITECTURE](ARCHITECTURE.md)；文档路由见 [AGENTS](AGENTS.md)。

## License

[MIT](LICENSE)。随仓技能文件另见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
