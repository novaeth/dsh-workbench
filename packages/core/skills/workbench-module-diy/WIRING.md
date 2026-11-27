# 接工作台：依赖、禁区、安装、热换、发布

[BUILD.md](BUILD.md) 的后半。设计见 [DESIGN.md](DESIGN.md) / [STEPS.md](STEPS.md)；门禁见 [REVIEW.md](REVIEW.md)。

## 1 依赖

| 需要 | 来源 |
|---|---|
| 工作台侧纯函数 / 常量 | 优先工具 / 挂载里的 `deps`（`HostKit`）；deps 的声明与说明读 `UnitMountDeps` / `HostKit` 的 JSDoc，需要定位时用只读查询面；模块顶层常量仍从 `@dsh-workbench/shared/host` 取（`dependencies`） |
| 工作台平台信息（deployment / 能力 / 工具链） | `mount(deps)` 里的 `deps.surface`（`HostSurface`）：工具（`registerTools`）在闭包里用它；不要自己读 `process.platform` |
| 让模型查看 / 提炼结论 / 启动子 agent | `mount(deps)` 里的 `deps.ai`（`AiPort`）：[AI.md](AI.md)；不要自己 `ctx.get('llm')`，也不自己存图片 |
| 读站点数据 | `deps.data`：单跳用 `request(recipe)`，多跳（后一跳要用前一跳的结果）用 `plan({ steps })`，二进制 / DOM 才写脚本：[DATASOURCE.md](DATASOURCE.md) |
| 浏览器平台事实（Desktop / web、hostOs、能力） | `kit.hooks.usePlatform()`：`client` 现算（`primaryModifier`）、`host` 来自 health（`fileManager`；没读到按未知处理） |
| 浏览器侧 hooks / 组件 / 图标 / 文案工具 | `@dsh-workbench/core/client` 的 `kit` |
| kit 没有的 dsh 控件 / 图标 | `@deepseek-ai/dsh-client-ui-primitives`（`dsh.client.external` + 精确版 devDependency；[KIT.md](KIT.md) §8） |
| 类型 | `import type` |
| 工作台 | `@dsh-workbench/core`（peer，安装时比版本） |

成员清单用命令取，不手工复制：`check --only kit`（当前安装的工作台真实产物）、`check --only primitives`
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

纪律：样式走 `*.module.css`，类名不带 `wb-` 前缀（工作台全局类；借契约类写 `:global(.wb-…)`）；
`src/**` 零注释；用户说明写 `README.md`，作者说明写 `DEVELOPING.md` 或 spec。

## 3 安装、添加到看板

`workbench_diy_install`（`unit=<id>`）：只识别当前工作区创建的模块；安装后会在当前工作区面板中打开，不弹审批。

- 只需安装一次。包名已在工作台配置中时，再次调用会提示已经安装过；迭代开发请用 `dsh-wb-module build`。
- 安装不等于添加到看板。如果返回提示尚未打开，等它生效后再调用 `workbench_diy_show`（它只做添加到看板这一步）。
- 状态不明确时询问 `workbench_diy_status`（`unit=…`）：是否已安装 / 面板是否已识别 / 项目内是否已打开 / 产物是否齐全 /
  源码是否新于产物 / 下一步。不要自行拼合面板、工作台配置、目录三处信息；故障处理见 [LIFECYCLE.md](LIFECYCLE.md)。

DIY 族仅在选了 DIY 模式的会话出现（按模式，不按工作区）；全表 [FAMILY.md](FAMILY.md)。
普通项目安装用 `workbench_modules_install` / `workbench_modules_uninstall`。

## 4 热换

安装后不再重复安装。修改源码后执行 `dsh-wb-module build`（或 `--watch` 常驻，改完自动重建）：

- 宿主侧 → `dist/host.js`：秒级热换，不重启、不刷新。
- 客户端侧 → `client.js`：构建后刷新页面；`*.module.css` 同样经构建与刷新生效。
- 改 `package.json` 的 `dsh.client` / `exports["./client"]`：需重启（安装声明变更）。
- 模块放在自己的工作区（不在工坊）也生效：`build` 写完产物会往 `$DSH_WORKBENCH_HOME/diy/outbox/<unit>.json` 推一条，宿主收到后重新对账。

未生效、缺推送与必须重启的处理见 [LIFECYCLE.md](LIFECYCLE.md)。

## 5 发布

默认 `private: true`，不发布到任何来源。用户说「帮我发布」时，**不要手动修改 `package.json`，也不要让用户直接操作 npm**，改走 `workbench_diy_publish`（`unit=…`）：

1. 如果这一版还没有更新日志（`workbench_diy_status` 会提示），把改动内容放进 `changelogNote`（一行一条；`changelogType` 选择分类，缺省为 changed），
   发布时一并写进 `CHANGELOG.md`（文件不存在会先创建）；审批屏会展示将要写入的那一段，用户批准后才写入。已有内容则不必传。
   真卡片验收过（`design accept`）。
   出口、署名、标题与安装命令都由工具和审批屏处理：不需要询问，也不需要补传；用户没有点名出口时不要传 target。
   模块来源跟当前选中无关：只有一个可发布源就用它；有多个可发布源或需要查询来源 id 时，转到普通会话完成发布，不在 DIY 会话里猜来源。
   用户要更换署名（或在审批屏上说作者不对）时，传 `author="姓名 <邮箱>"`（也可以只给姓名）；不要手动修改 `package.json`，也不要自行编造。
   没有写作者时，审批屏会显示推断的署名；用户拒绝后说明要换成谁，再用 `author` 重新发布。
   模块市场中一个包名归第一次发布的人（`market/<包名>/` 条目里的 `owner`）：换署名发同名会被拒，审批也无法通过；
   用户确实是接手的人，请用户先找模块来源的维护者修改那一条的 `owner`，不要修改成对方的署名来绕过检查。
   一个模块标识（`dsh.workbench.unit`）在同一个模块市场中只能有一个条目：更换包名时沿用旧 unit 会被拒绝，
   所以换包名时要把 unit 一起换掉，不要为了保留 id 去修改别人的条目。
   分类用 `category`（一个短词，例如「任务与协作」），发布到模块市场时必填：条目还没有分类时必须提供一个，
   已有分类则不必传；需要查看当前来源已有分类时，转到普通会话完成发布，DIY 会话不提供来源与分类查询工具。
   标签 `labels` 可选（最多两个短词，比如「发布编排」「构建状态」）：有则传入，传入后会替换原来的标签；没有则不必填写。
   分类会出现在发现页的 chip 行，新模块带一个新分类，页面自动多一个。
2. 工具回 `needsUser` 时按 `text` 转述，不在对话里索要 token / OTP；`otp` 交接后 `verify=true` 只核不发。
   审批之前会先做一次发布前检查：登录、许可证、验收、更新日志、模块来源缺任何一项时直接拒绝，不显示审批；
   理由里写明缺什么，补完再调用一次。
3. 只修改模块市场元数据（标题 / 作者 / 说明 / 标签）不升版本：`refresh=true`（换作者时同时传 `author`，仍要过 `owner` 检查）。
   发布新版本不会改这些元数据（工具沿用远端条目当前的值），不要期望发布一个版本时顺带修改标题；标签是例外 —— 发布总会按模块里的标签覆盖一次。

## 6 运行子进程：使用命令执行入口（`deps.seam`）

模块需要在宿主侧运行命令（构建、git、打包……）时，使用工作台放进 `mount(deps)` 的 `deps.seam`。
`ctx.get('shell')` / `ctx.get('workbenchShell')` / `ctx.get('seam')`、`runShell` / `shellOf`、裸
`child_process` 都不给模块用，`check --only seam` 会判定失败。

先在清单里声明要哪几档写入域（只认两档）：

```json
{ "host": { "inject": [], "writes": ["unit"] } }
```

| 档 | 可写在哪 | 什么时候给 |
|---|---|---|
| `unit` | `<运行时根>/units/<unit>/`（模块自己的数据目录；`HOME`、npm/pnpm 缓存与日志也注入到这里） | 声明了就常开、不用审批 |
| `workspace` | 当前会话的工作区 | 声明了才给；调用时还要带上会话对象 |

字段、默认值与错误码见 `UnitSeamRequest`；这一节只留必须遵守的约束。

不写 `writes`（或写 `[]`）= 不拿门面：`deps.seam` 是 `undefined`，代码里按可选处理。

读站点数据的模块声明 `host.sites`（短名 → 站点事实），`host.origins` 由它推导；显式 `origins` 仍可写：

```json
{
  "host": {
    "inject": [],
    "sites": {
      "oa": {
        "origin": "https://oa.example.com",
        "loginUrl": "https://oa.example.com/login",
        "authLoss": { "path": "errorCode", "equals": "002" }
      }
    }
  }
}
```

声明后 `deps.data` 的 HTTP / 配方 / 计划只放行这些站点（站点 origin 并集 + 显式 origins）；未声明的 origin
直接回 `invalid-request`；path / registry 安装预检会列出「会读取这些站」。配方与计划只写 `site: 'oa'`，
运行时由宿主解析出 origin / 登录页 / 过期信号 / 会话 / 超时。
无 URL 的 `browser` 脚本与 `command` 读不在 origin 校验范围。不写 = 兼容旧模块，仍放行；写 `[]` = 一个都不许。

写计划放在 `writes: true` 的工具 `execute` 里（审批门在工具层先过）：

```ts
const out = await deps.data.submitPlan(plan, { idempotencyKey: input.idempotencyKey, confirm: () => true });
```

`confirm` 返回 false 就停；`onStep` 可把每步推成长任务行。`submitPlan` 不重复审批。

长任务本身已经是用户确认后才启动的，里面的写计划直接传 `confirm: () => true` 即可，
不要再逐步弹审批；要额外确认是产品自己的选择，不是 `submitPlan` 的默认要求。

登录丢失可先用 `authLossOf(value)` 判：401、`status:false` + 登录/超时文案、跳 `/login`（403 算没权限）；
`status:false` 单独不算，避免把业务错误误判为登录。

```ts
const result = await deps.seam?.run({
  scope: 'unit',
  command: 'git rev-parse --short HEAD',
  timeoutMs: 10_000,
});
if (result === undefined || result.exitCode !== 0) {
  return { ok: false, text: '这条命令未成功执行' };
}
```

- `workspace` 档只给有会话的调用点（工具）；路由 / 动作没有会话，不要请求这一档。
- 一条命令只声明一个写入域；要写两棵树就在步骤边界拆成两次调用。
- 请求没声明的档在启动进程前就失败（`SeamError` 的 `scope-not-declared` / `workspace-unknown`），不要吞掉。
- 这层门面是**接口约定 + 自动检查 + 定位来源**，不是进程隔离：模块宿主代码与工作台同进程。真正的安全边界仍是
  「是否安装模块 + 审批」。
