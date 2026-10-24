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
| `import '@/shared/…'`、`../../workbench/src/…` | `@/` 只指自己 `src/`；跨包用包名 |
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
走 `workbench_diy_publish`（`unit=…`，`target=team|public|tarball|git`）：

1. 先确认他已经在真卡片上说过「没问题」，并已跑过 `design accept`（验收 N/N 全勾）。
2. 工具调 `dsh-wb-module release`：预检（登录 / license / git 远端 / 工作区）→ 门禁
   `build` + `check` + `design check` + `typecheck` + `test` + `selfcheck` → 按出口发布 → 从出口侧核包。
3. 出口与默认：

| `target` | 什么时候 | 凭据 | 报告 |
|---|---|---|---|
| `team` | 配了团队私源（默认） | 工坊 `.npmrc` 的 registry + `_authToken` | 同事安装命令 |
| `public` | 用户明确说“公开” | npm 登录 / 2FA | 同事安装命令 |
| `tarball` | 没私源（默认）/ 用户说“给个安装包” | 无 | `.tgz` 路径 + 本机安装命令 |
| `git` | 用户说“推到 git” | git 远端 + 推送权限 | tag + `git+…#tag` 安装命令 |

4. 工具回 `needsUser` 时（`login` / `otp` / `license` / `scope` / `name` / `git-remote` / `git-dirty` /
   `git-auth` / `registry` / `acceptance`），照它那句 `text` 对用户说一句，给能照抄的命令，等他说「好了」再跑；
   **不在对话里要 token / OTP**，不把红字贴给用户。`otp` 交接后用 `workbench_diy_publish` 的 `verify=true`
（或 `release --verify`）只核不发；public 缺 license 时用户选 MIT / Apache-2.0 后，用工具的 `license=…` 重跑。
5. `dsh-wb-module publish` 仍是**发货前清单**（只 dry run）；`release --dry-run` 只预览；
   `--verify` 只核已发布的包。公网源必须显式 `--target public` + license，默认只认团队源 / 安装包。
