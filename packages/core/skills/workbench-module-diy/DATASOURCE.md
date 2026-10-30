# 数据源：探一条读，再固化

用户只说"我要看 X"，不提供接口。干净机器上没有现成 skill。步骤是探查，不是查手册。

## 判域

| 情况 | 域 |
|---|---|
| 用户已在浏览器登录过该系统 | DIY：用 opencli 复用登录探（下文五步） |
| 要新凭据（账号 / 密钥 / token） | 工程：停，说清谁配什么 |

判据是"要不要新凭据"，不是"要不要接新平台"。其余类型见 [DESIGN.md](DESIGN.md) §0。

## 五步

1. **问入口** —— "你平时在哪个网页 / 软件里看这个？"记下入口。不问"用 deploy 还是 jenkins"。
   把用户的需求翻成站点 / 系统关键词是你的工作。

2. **按四层找数据**：

   ① **opencli 自带**：`workbench_diy_recon`（`keyword=<站点 / 系统 / 域名>`，或 `url` 取域名）。
   返回可用能力：站点、命令、`strategy`（PUBLIC / COOKIE / INTERCEPT / UI）、是否需要用户 Chrome 登录、
   可直接复用的命令。**命中即复用，不装不审批。** 官方发现指引：`opencli skills read opencli-usage`。
   一个词可能带出多组（如 `arxiv` 带 `hf`、`semanticscholar`），看全。优先 `public`；`cookie` / `ui` /
   `intercept` 先确认用户登录状态。一张卡可有多条读（可跨站点）：`design.json` 用 `reads[]` 一条一行，
   每条写参数 / 凭据 / 未登录 / 超时，卡片按条给失败态。

   ② **这台机器另装的插件**：recon 一并列出（或 `opencli plugin list`）。参数用 `--help`，或
   `workbench_diy_spec`（`command='<site> <name>'`）取 `--help -f json` 原文（插件与内置均可）。

   ③ **官方有、这台机器没有** → 安装：`opencli plugin install github:user/repo`、`opencli external install <名>`，
   或模块清单 `needs` 里 `kind: "extension"` 的那些。安装改这台机器且执行第三方代码 → 需用户审批；优先内网或官方源。

   ④ **都没有** → 开发：一次性探用下文的 eval；长期用写 adapter（`opencli skills read opencli-adapter-author`，
   失效用 `opencli-autofix`）。

   **探**：`workbench_diy_eval`（`read=<地址>, args=["<回 JSON 的脚本>"]`；无接口给 `css=<选择器>`，
   走固定 DOM 读，返回 `{entries:[{text}]}`）。它复用用户浏览器登录，并把失败归一成阻断屏错误码；
   两拍、重启重试、平台码映射都在工具内。目标：找到承载数据的位置（列表页或其后的 XHR），
   记 URL、参数、凭据来源。

   **Desktop**：这条 `read=` 探索线照旧；Desktop 只是不能对 Electron 里的工作台页做屏调试，
   不影响站点探索。录制（`_record_*`）也照旧。

   - 不知道数据在哪：先跑 `performance.getEntriesByType('resource')`，筛 `/api/`、`.json`。
     有 → 接口读；无但页面有整块表格 → DOM 读。判断一次即可。
   - `opencli` 随工作台预装（隔离运行时 `$DSH_HOME/workbench/opencli/`，启动体检安装，不碰 `~/.opencli`）。
     未装好时工具会报"隔离运行时还没装好"；转述原文，不猜 URL。
   - 脚本约定：不在站点 → `{ ok: false, code: "not-on-site" }`；登录过期 → `{ ok: false, code: "not-logged-in" }`
     （工具归一为 `auth-required`）；成功 → `{ ok: true, ...数据 }`。
   - 新 session 的 `eval` 会静默开 `about:blank`（后台容器窗，不抢焦点）。脚本第一行判断
     `location.origin`；不在站点则 `open` 该页，等约 1 秒再 eval。在 shell 里跑 opencli 时不要自己
     拼命令前缀：`OPENCLI_WINDOW` 这类环境变量走宿主 shell 的 env 覆盖（`env` 是叠加，POSIX / pwsh 通用），
     手写 `env NAME=value` / `$env:NAME` 在另一个平台就是坏的。
   - 读与屏用不同会话：`data.read({ kind: 'browser' })` 默认读会话 `workbench-read`；`workbench` 是看 / 动族的屏会话。同名会把用户的页导航走。需要独立标签就传 `session: "<unit>"`。
   - DOM 读不要在宿主脚本里 `querySelectorAll`：宿主产物禁止 `document.`，且无法单测。探时用
     `workbench_diy_find`（`read=…, args=["--css", "<选择器>"]`）；固化用
     `data.read({ kind: 'browser', url, script })` 返回 JSON，把"切格 + 按列取值"做成两个纯函数。
   - 工作台刚重启时桥未就绪：首次读报"命令跑不起来"，等一秒重读；超时不重试。

3. **试一条最小读** —— 先证明能拿到，再写模块。记录：结构化字段形状；未登录长什么样；超时 / 被墙的形状。
   产出必须是一条可重复的命令或请求。

4. **落配方** —— 把探明结果填成 `design.json` 里这条读的 `recipe`：`origin`、`request`（method / path /
   query / body / contentType）、`auth`（凭据从哪来、放到哪）、`response`（json / text、取哪一格）。
   同时把 `key` 写成 lowerCamelCase。配方与"哪条读 / 参数 / 凭据 / 没登录 / 超时 / 当时调用原文"
   并存：前两格给人看，后一格给壳用。形状见下面「配方」。
5. **固化进模块** —— 跑 `dsh-wb-module sync`，它把 `key + recipe` 生成到 `src/datasource.ts`；
   宿主半侧 `mount({ data })` 只写一行 `data.request(DATASOURCE.<key>, overrides?)`（读）或
   `data.submit(...)`（写，在工具里）。路由把 `DataResult` 摊平成 `{ ok: true, ...data }` /
   `{ ok: false, error }`，卡片只依赖这条路由。写操作走 [WRITES.md](WRITES.md)。

## 配方

```json
{
  "key": "balance",
  "recipe": {
    "origin": "https://x.example.com",
    "loginUrl": "https://x.example.com/login",
    "request": { "method": "GET", "path": "/api/balance", "query": { "scope": "self" } },
    "response": { "kind": "json", "path": "data" }
  },
  "read": "GET /api/balance（登录态 cookie）",
  "params": "scope 固定 self",
  "credentials": "复用浏览器登录：同源 cookie",
  "notLoggedIn": "401 → 阻断屏，code auth，helpUrl 指 /login",
  "timeout": "25 秒；超时归 timeout，不整卡换文案"
}
```

宿主侧：

```ts
routes: {
  'x/balance': async () => {
    const result = await data.request<Balance>(DATASOURCE.balance);
    return result.ok ? { ok: true, ...result.data } : result;
  },
}
```

六种配方：

| 配方 | 什么时候用 | `auth` |
|---|---|---|
| 公开 | 不要登录 | `{ kind: 'none' }` |
| cookie | 同源接口，cookie 就够 | 省略（默认） |
| cookie + CSRF | 表单类后台 | `source: meta / cookieValue`，`place: header` |
| bearer-refresh | 页面先换 token（如 `/api/auth/refresh`） | `source: endpoint`，`place: header` |
| bearer-page | token 在页面初始 state / storage | `source: global / storage`，`place: header` |
| custom | 签名 / WS / 多步 / 一次性 token | 不写 recipe，写 `custom: { why }`，代码里用旧的 `data.read({ kind: 'browser', script })` |

同一次读要打多条接口时（一个 refresh 换 token，再并发取余额、用量、订阅……），不要拆成 N 条配方
各调一次：一条配方 + 一格 `calls`，一次换 token、并发打，结果按键回、每格各自成败：

```json
{
  "key": "wallet",
  "recipe": { "origin": "https://x.example.com",
              "auth": { "source": { "kind": "endpoint", "url": "/api/user/auth/refresh",
                                    "method": "POST", "body": {}, "path": "data.access_token" },
                        "place": { "in": "header", "name": "authorization", "prefix": "Bearer " } },
              "request": { "method": "GET", "path": "/api/subscription/self" } },
  "calls": {
    "balance": { "path": "/api/wallet/balance", "response": { "path": "data.balance" } },
    "usage": { "query": { "days": 7 } }
  }
}
```

`sync` 会多生成一个 `DATASOURCE_CALLS.wallet`；代码里一次调用：

```ts
const results = await data.requestMany(DATASOURCE.wallet, DATASOURCE_CALLS.wallet);
```

`calls` 的键就是结果名；配方里的 `path` / `query` / `headers` / `response` 是每条的默认值，
`calls` 里的同名格覆盖它；一次最多 8 条。`calls` 必须配 `recipe`，`design check` 逐格校验。
`requestMany` 也只读 GET —— 写仍是一条一条走 `submit`。

配方还有两个可选机器字段：`session`（这条读用哪条 opencli 会话，默认 `workbench-read`；要和屏会话分开时写）
与 `timeoutMs`（默认 25 秒）。

`custom` 只记"为什么配方盖不住"，脚本仍在代码里；`design check` 会给 warn。

探 DOM（服务端渲染的表格）不在配方里：用 `_find` 探，固化仍走老的 `data.read({ kind: 'browser', script })`
或 `browserFind`（DOM 读走 `find`，不写 eval 脚本）。

`opencli` 是**侦察兵，不是日常通道**：探明后，日常读必须是一条固定、便宜、可解释的调用
（配方就是那条调用；`eval` 只在探测和 `custom` 里出现）。

配方的**执行体由壳决定，不写在模块里**：凭据来源是 `cookie` / `cookieValue` 时，壳可能用宿主侧的
公共通道（Node fetch + 浏览器 cookie jar）而不是页面脚本；两者结果形状、错误码、三态都一样。
模块不需要知道走的是哪条 —— 照 `data.request(DATASOURCE.<key>)` 写就对了。

## 三态

拿不到数据是常态。卡片必须画得出：

| 情况 | 文案 |
|---|---|
| 没登录 / 凭据过期 | "去 XX 登录一下"（可点，指到用户常用入口） |
| 超时 / 网络不通 | "这次没读到，稍后重试" + 重试 |
| 站点改版、字段缺失 | "读到的形状和预期不一样"；不显示空白、不显示 0 |

任何输入（待机 / 在读 / 有值 / 空 / 读不到）下抛异常或出现 `undefined` / `NaN` 的卡片都会让用户认为"卡片不出来"。
`check --only cards` 拦这条（[REVIEW.md](REVIEW.md)）。

## 错误码

平台码（如 `AUTH_UNAUTHORIZED`）先映射，不透传：

| code | 用户看到 |
|---|---|
| `auth` + `helpUrl` | "需要登录 XX" + 去登录 + 重试（无 `helpUrl` 只剩重试） |
| `timeout` | 细提示（不换整卡）+ 重试 |
| `command` / `http` / `parse` | 整卡"读不到" + 重试；`hint` 写清确认什么 |
| `browser` + `helpUrl` | "没有权限" / 页面读失败 + 权限页 + 重试 |
| 其他 | 整卡显示 `message` + 重试 |

字段位置：`message` 标题、`hint` 可照做的一句、`detail` 折叠的原始输出。

## 门禁

- 数据源在宿主半侧；卡片只消费返回。
- 只读路由错误返回 `{ ok: false, error: { code, message, hint? } }`（HTTP 200，外壳转发）。
- 验收走正常 / 空 / 出错三条路；真机造不出的状态写清如何触发，并在 `plugin.test.ts` 各喂一遍。
