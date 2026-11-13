# 接外壳：依赖、禁区、安装、热换、发布

[BUILD.md](BUILD.md) 的后半。设计见 [DESIGN.md](DESIGN.md) / [STEPS.md](STEPS.md)；门禁见 [REVIEW.md](REVIEW.md)。

## 1 依赖

| 需要 | 来源 |
|---|---|
| 宿主侧纯函数 / 常量 | 优先工具 / 挂载里的 `deps`（`HostKit`）；模块顶层常量仍从 `@dsh-workbench/shared/host` 取（`dependencies`） |
| 宿主平台事实（deployment / 能力 / 宿主机工具链） | `mount(deps)` 里的 `deps.surface`（`HostSurface`）：工具（`registerTools`）在闭包里用它；不要自己读 `process.platform` |
| 让模型看一眼 / 抽结论 / 起子 agent | `mount(deps)` 里的 `deps.ai`（`AiPort`）：[AI.md](AI.md)；不要自己 `ctx.get('llm')`，也不自己存图片 |
| 浏览器平台事实（Desktop / web、hostOs、能力） | `kit.hooks.usePlatform()`：`client` 现算、`host` 来自 health（没读到按未知处理） |
| 浏览器侧 hooks / 组件 / 图标 / 文案工具 | `@dsh-workbench/core/client` 的 `kit` |
| kit 没有的 dsh 控件 / 图标 | `@deepseek-ai/dsh-client-ui-primitives`（`dsh.client.external` + 精确版 devDependency；[KIT.md](KIT.md) §8） |
| 类型 | `import type` |
| 外壳 | `@dsh-workbench/core`（peer，安装时比版本） |

成员清单用命令取，不手抄：`check --only kit`（当前安装的外壳真实产物）、`check --only primitives`
（dsh 原语导出、与 kit 求交、需写入 `package.json` 的两行）。

⚠️ 共享包入口按运行时分离（`source` 判据）：

- 根入口只许 `import type`。浏览器侧取运行值会打包进产物（第二份实例）；宿主侧取运行值会使 `dist/host.js`
  无法 import（根 barrel 拉到 dsh 浏览器件）。浏览器运行值走 `kit`。
- `@dsh-workbench/shared/host` 仅宿主侧。含 `node:*`；浏览器侧纯函数走 `kit`。工具 / 挂载里优先用 `deps`（`HostKit`）；模块顶层常量仍从这里取。
- 契约类型（`Translate` / `ApiError`…）从根入口取，允许。

单例只能一份：kit 的 hooks 与容器组件不得复制进模块，否则表现为"agent 改完面板不自动刷新"。

## 2 会被门禁拦的写法

| 写法 | 结果 |
|---|---|
| DOM + CSS 重画 dsh 已有控件（按钮、弹窗、输入框、图标） | 第二份材质与交互；先从 `kit` 取 |
| `import '@deepseek-ai/dsh-client-ui-primitives'` | 允许，需三处齐：仅浏览器侧、`dsh.client.external` 声明、产物中为 `require`（否则被内联，`primitives` 红） |
| `import '@/shared/…'`、`../../core/src/…` | `@/` 只指自己 `src/`；跨包用包名 |
| 公开包写内网地址 / 域名 / 企业名 | `markers` 红 |

纪律：样式走 `*.module.css`，类名不带 `wb-` 前缀（外壳全局类；借契约类写 `:global(.wb-…)`）；
`src/**` 零注释；用户说明写 `README.md`，作者说明写 `DEVELOPING.md` 或 spec。

## 3 安装、添加到看板

`workbench_diy_install`（`unit=<id>`）：只识别当前工作区创建的模块；安装后会在当前工作区面板中打开，不弹审批。

- 只需安装一次。包名已在 profile 中时，再次调用会返回「已装过」；迭代开发请用 `dsh-wb-module build`。
- 安装不等于添加到看板。如果返回提示尚未打开，等它生效后再调用 `workbench_diy_show`（它只做添加到看板这一步）。
- 状态不明确时询问 `workbench_diy_status`（`unit=…`）：是否已安装 / 面板是否已识别 / 项目内是否已打开 / 产物是否齐全 /
  源码是否新于产物 / 下一步。不要自行拼合 panels、profile、目录三处信息。
- 用户选「完全权限」时，需审批的调用直接过；未认领的写与 `{blocked}` 仍拒。

DIY 族仅在选了 DIY 模式的会话出现（按模式，不按工作区）；全表 [FAMILY.md](FAMILY.md)。
普通项目安装用 `workbench_modules_install` / `workbench_modules_uninstall`。

## 4 热换

安装后不再重复安装。修改源码后执行 `dsh-wb-module build`：

- 宿主侧 → `dist/host.js`：秒级热换，不重启、不刷新。
- 客户端侧 → `client.js`：刷新页面；`*.module.css` 就地改写 `<style>`，刷新生效。
- 改 `cordis.patch.yml`、`package.json` 的 `dsh.client` / `exports["./client"]`：需重启（安装声明变更）。
- 必须重启时说明原因与重启对象。

## 5 发布

默认 `private: true`，不发布到任何来源。用户说「帮我发布」时，**不要手动修改 `package.json`，也不要让用户直接操作 npm**，改走 `workbench_diy_publish`（`unit=…`）：

1. 如果这一版还没有更新日志（`workbench_diy_status` 会提示），把改动内容放进 `changelogNote`（一行一条；`changelogType` 选择分类，缺省为 changed），
   发布时一并写进 `CHANGELOG.md`（文件不存在会先创建）；审批屏会展示将要写入的那一段，用户批准后才写入。已有内容则不必传。
   真卡片验收过（`design accept`）。
   出口、署名、标题与安装命令都由工具和审批屏处理：不需要询问，也不需要补传；用户没有点名出口时不要传 target。
   模块来源跟当前选中无关：只有一个可发布源就用它；有多个时传 `source=<id>`（`workbench_market_sources` 会给）。
   用户要更换署名（或在审批屏上说作者不对）时，传 `author="姓名 <邮箱>"`（也可以只给姓名）；不要手动修改 `package.json`，也不要自行编造。
   没有写作者时，审批屏会显示推断的署名；用户拒绝后说明要换成谁，再用 `author` 重新发布。
   市场里一个包名归第一次发布的人（`market/<包名>/` 条目里的 `owner`）：换署名发同名会被拒，审批也放不过去；
   用户真是接手的人，让他先找模块来源的维护者改那一条的 `owner`，别自己改成对方的署名去绕。
   一个模块 id（`dsh.workbench.unit`）在同一个市场里只能有一个条目：更换包名时沿用旧 unit 会被拒绝，
   所以换包名时要把 unit 一起换掉，不要为了保留 id 去修改别人的条目。
   分类用 `category`（一个短词，例如「任务与协作」），发布到市场时必填：条目还没有分类时必须提供一个，
   已有分类则不必传；拿不准时先调用 `workbench_market_categories` 查看当前模块来源用过的那批，尽量沿用，不要每次发布都新增一个词。
   标签 `labels` 可选（最多两个短词，比如「发布编排」「构建状态」）：有就传，传了会替换原来的；没有不用编。
   分类会出现在发现页的 chip 行，新模块带一个新分类，页面自动多一个。
2. 工具回 `needsUser` 时照 `text` 转述，不在对话里要 token / OTP；`otp` 交接后 `verify=true` 只核不发。
3. 只改市集元数据（标题 / 作者 / 说明 / 标签）不升版本：`refresh=true`（换作者时同时传 `author`，仍要过 `owner` 检查）。
   发布新版本不会改这些元数据（工具沿用远端条目当前的值），别指望发一版顺手把标题改掉；标签是例外 —— 发布总会照模块里的标签并一次。
