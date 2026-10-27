# 接外壳：依赖、禁区、安装、热换、发布

[BUILD.md](BUILD.md) 的后半。设计见 [DESIGN.md](DESIGN.md) / [STEPS.md](STEPS.md)；门禁见 [REVIEW.md](REVIEW.md)。

## 1 依赖

| 需要 | 来源 |
|---|---|
| 宿主侧纯函数 / 常量 | `@dsh-workbench/shared/host`（`dependencies`） |
| 浏览器侧 hooks / 组件 / 图标 / 文案工具 | `@dsh-workbench/core/client` 的 `kit` |
| kit 没有的 dsh 控件 / 图标 | `@deepseek-ai/dsh-client-ui-primitives`（`dsh.client.external` + 精确版 devDependency；[KIT.md](KIT.md) §8） |
| 类型 | `import type` |
| 外壳 | `@dsh-workbench/core`（peer，安装时比版本） |

成员清单用命令取，不手抄：`check --only kit`（当前安装的外壳真实产物）、`check --only primitives`
（dsh 原语导出、与 kit 求交、需写入 `package.json` 的两行）。

⚠️ 共享包入口按运行时分离（`source` 判据）：

- 根入口只许 `import type`。浏览器侧取运行值会打包进产物（第二份实例）；宿主侧取运行值会使 `dist/host.js`
  无法 import（根 barrel 拉到 dsh 浏览器件）。浏览器运行值走 `kit`。
- `@dsh-workbench/shared/host` 仅宿主侧。含 `node:*`；浏览器侧纯函数走 `kit`。
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
`src/**` 零注释；说明写 `README.md` 或 spec。

## 3 安装、上板

`workbench_diy_install`（`unit=<id>`）：只认当前工作区造好的模块；装后在当前工作区面板打开；不弹审批。

- 只装一次。包名已在 profile 后再次调用会返回"已装过"；迭代用 `dsh-wb-module build`。
- 装 ≠ 上板。返回里说未打开时，待生效后调 `workbench_diy_show`（只上板）。
- 状态不明问 `workbench_diy_status`（`unit=…`）：装没装 / 面板认没认 / 项目内开没开 / 产物齐不齐 /
  源码是否新于产物 / 下一步。不要自行拼 panels、profile、目录三处。
- 用户选「完全权限」时，需审批的调用直接过；未认领的写与 `{blocked}` 仍拒。

DIY 族仅在选了 DIY 模式的会话出现（按模式，不按工作区）；全表 [FAMILY.md](FAMILY.md)。
普通项目安装用 `workbench_modules_install` / `workbench_modules_uninstall`。

## 4 热换

装后不再安装。改源码 → `dsh-wb-module build`：

- 宿主侧 → `dist/host.js`：秒级热换，不重启、不刷新。
- 客户端侧 → `client.js`：刷新页面；`*.module.css` 就地改写 `<style>`，刷新生效。
- 改 `cordis.patch.yml`、`package.json` 的 `dsh.client` / `exports["./client"]`：需重启（安装声明变更）。
- 必须重启时说明原因与重启对象。

## 5 发布

默认 `private: true`，不发任何源。用户说「帮我发布」时，**不要手改 `package.json`、不要让他看 npm**，
走 `workbench_diy_publish`（`unit=…`）：

1. 先把这一版写进 `CHANGELOG.md`（`workbench_diy_changelog`，`note=…`），真卡片验收过（`design accept`）。
   出口、署名、标题、安装命令都由工具与审批屏处理：不用问、不用补；用户没点名出口就不传 target。
   索引源跟当前选中无关：只有一个可发布源就用它；有多个时传 `source=<id>`（`workbench_market_sources` 会给）。
   用户要换署名（或在审批屏上说作者不对）：传 `author="姓名 <邮箱>"`（或只给姓名），别手改 `package.json`，也别自己编。
   没写作者时审批屏显示推断的署名；他拒绝后说换成谁，再用 `author` 重发。
   市场里一个包名归第一次发布的人（`market.json` 的 `owner`）：换署名发同名会被拒，审批也放不过去；
   用户真是接手的人，让他先找索引维护者改那一条的 `owner`，别自己改成对方的署名去绕。
2. 工具回 `needsUser` 时照 `text` 转述，不在对话里要 token / OTP；`otp` 交接后 `verify=true` 只核不发。
3. 只改市集元数据（标题 / 作者 / 说明）不升版本：`refresh=true`（换作者时同时传 `author`，仍要过 `owner` 检查）。
