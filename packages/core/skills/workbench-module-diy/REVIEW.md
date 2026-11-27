# 自动检查（门禁）：检查项（判据）与修法

运行 `dsh-wb-module check` 或 `check --only <判据>`。检查未通过就修复，不转给用户。

`release` / `publish` 用 `check --package <本包>`：单模块判据只跑本包，兄弟模块自己的问题不挡；
单元 id 重复、供应来源冲突、工作台源码点名模块仍按全工作区校验。整仓状态用仓库根不带 `--package` 的 `check`。

| 判据 | 检查 | 修法 |
|---|---|---|
| `contracts` | 清单 ↔ 代码 ↔ `design.json` 漂移；dsh 组合期不校验清单；站点引用 / 未用站点 / origins / 信封 | 按报错改：`unit` 重名换名；`dsh.workbenchFaces` 两个源码入口；至少保留 `build` / `typecheck` / `test` / `selfcheck` 四个脚本（模板共 10 个）；`private: true`。`dsh.workbench.tools` 与 `registerTools()` 一致；`design.json` 对键名；生成物过期时运行 `sync`。站点：配方只写 `site`，站点表不多不少；`host.origins` 由站点推导；信封路径运行 `sync` 展开 |
| `protocol` | `dsh.workbench` 版本 / 形状 / 多余键（工作台静默忽略生字段） | 补 `"apiVersion": 3`；`unit` / `title` / `card` / `tools` / `host` 写全（名字是 `{ zh, en }` 字面量；无卡片 `null`、无工具 `[]`）；删协议外键（`faces` 在 `dsh.workbenchFaces`；不写 `scope`） |
| `combo` | 工作台模块声明了 `dsh.bundle`（私有包跳过） | 删除 `dsh.bundle`；装载只走 profile 依赖 + `wb-<unit>` 行 |
| `bundles` | 运行时互串：浏览器产物含 node 内置 / 宿主产物含 DOM、react | 不 import 对方那侧 |
| `source` | 非种子 `@deepseek-ai/*`；宿主碰 dsh 浏览器包；`@/` 指工作台；根入口取运行值；客户端引 `/host`；**手写进程 / PATH / 文件锁 / 状态原子写**（import 首选库放行） | 宿主只用 Node 侧；种子词仅在 client 可达文件；`@/` 只指自己 `src/`；运行值：浏览器 `kit`、宿主 `shared/host`；进程/锁/状态写交给工作台 |
| `seam` | 子进程绕过 `deps.seam` / 直接用 `child_process`；清单 `writes` 与请求不一致 | 子进程只走 `deps.seam.run({ scope: 'unit' | 'workspace', command })`；清单补 `host.writes` |
| `primitives` | 声明 `external` 但产物无物证（原语被内联） | `dsh.client.external` 声明；devDependency 精确版对齐；产物中为 `require(...)` |
| `kit` | 用了 peer 下限工作台没有的成员（首帧 `Element type is invalid`） | 只用 peer 范围内成员；下限抬到实际使用版 |
| `cards` | 八种工作台侧输入 × `zh` / `en` 下崩溃 / 空白 / 脏值 | 五态可画；外层 `Card`；卡片自己用到的文案键双语齐（名字走清单 `title`，不再是卡片键）。不断言具体态（归 `plugin.test.ts`） |
| `standalone` | 依赖工作台源码才能构建 | 不引用工作台源码；`tsconfig.paths` 用相对路径 |
| `markers` | 私有源 / 私网地址 / 内网域名进入公开包 | 不进包；配置落到模块配置面；组织特有的词表由 `DSH_WB_INTERNAL_MARKERS` 提供 |
| `alias` | `@/` 指向工作台源码 | `@/` 只指自己 `src/` |
| `style` | 模块定义 `.wb-*`；手写行 / 操作区 / 表单（F1–F4）；`--dsw-*` / `--wb-*` 不在现读的令牌清单 | 样式走 `*.module.css`（无 `wb-` 前缀）；借工作台类用 `:global(.wb-…)`；行 / 操作区用 `FormRow(s)` / `FormActions`，表单用 `Form`（[KIT.md](KIT.md) §5）。F4：裸 `<form` 或手写 `wb-formRow` / `wb-formRows` / `wb-field`。令牌名现查：读令牌声明 |
| `arch` | 结构：巨文件 / 反向依赖 / 跨运行时 / 表外目录 / 模型无测试 / 测试住 `__tests__`；依赖白名单（含 execa / which / proper-lockfile / write-file-atomic / dayjs / zod）+ `shell-quote` / `shelljs` / `zx` deny；能力首选 dayjs / structuredClone / URLSearchParams / zod（日期已是硬门禁） | 见「第十二条」 |
| `lint` | 语法：`as any` / `console` / `debugger` / 颜色字面量 / `!important` / **直接读 `process.platform` / `versions.electron` / `dshDesktop` / `navigator.userAgent`** / react-hooks | 见「第十三条」 |

## 运行范围

用 `pnpm exec dsh-wb-module …`；命令、`--only` 判据名与模板参数看 `--help` / `check --list`，不在指引里重复。

- `check` 不会运行 `pnpm test`；状态、换算与边界测试需要自行运行。
- `check:duplication` 用 jscpd 扫 `src` / `scripts`（阈值与忽略面在 `.jscpd.json`），有克隆就红；
  `duplication:report` 把 HTML / JSON 报告出到 `coverage/duplication/`。它不在 `check` 链里，修改源码后要单独运行。
- 「不适用」不等于「通过」：`standalone` 需要工作台源码在场，`markers` 只扫描公开包（DIY 模块 `private`）。
  汇总行会列出未检查项。

## 站点审查

- 模块里出现**字面 origin** → 指出应放进清单 `host.sites`（`contracts` 只给警告，不挡绿）。
- 站点表里的站点与配方一一对得上（不多不少）；`design.check` 与 `check --only contracts` 各报一次。
- 安装预览列出的站点就是模块实际会读写的站点（`host.origins` 由站点表推导）。

## 第十二条 `arch`

只检查带 `arch.config.mjs` 的模块；无文件 = 不适用（skip），不是红。

```js
import { moduleArch } from '@dsh-workbench/module-tools/arch';
export default moduleArch();
```

报错格式 `<包名>: <文件>:<行> <说明>（<规则>）—— <hint>`；仅 `error` 阻断（`warn` 提示）；配置 import / 语法错也红。

| 规则 | 含义 | 修法 |
|---|---|---|
| `S01` 表外目录 | 文件不在层序表（如 `src/utils/`） | 移入 `model/` / `components/`，或用 `layers` / `roles` 声明 |
| `S21` 反向依赖 | 低层引高层（组件引 `../host`） | 被引项下沉 `model/`；只依赖层号 ≤ 自身 |
| `S23` 跨运行时 | 宿主 import `src/components/**` 或反向 | 组件归 client 面；两侧经服务名 |
| `S16` 超长 | 文件 >200 行 / 函数 >80（测试豁免） | 拆；或传 `fileLines` / `functionLines`；单文件用 `exceptions` |
| `S74` 测试不在 `__tests__` | 测试文件散在 `src/` 里 | 挪进同目录的 `__tests__/`，相对路径的 import 各退一级 |
| `M08` 无测试 | `src/model/**` 无配对测试 | 补 `src/model/__tests__/X.test.ts` |
| `D12` 刻度外值 | 手写不在刻度的尺寸 | 用 `--dsw-*` 或刻度值 |
| `D09` `!important` | 只允许 `src/components/vendor/` | 改选择器 / 层级 |
| `D17` 未使用类 | `*.module.css` 定义未使用 | 删除 |

放宽项通过参数传入：`moduleArch({ fileLines, deps, layers, roles, structure, exceptions })`；`exceptions` 每条需 `reason`：

```js
export default moduleArch({
  layers: { data: 3 },
  roles: [{ id: 'lib:platform', pattern: 'src/platform/**', layer: 1 }],
  exceptions: [{ rule: 'S16', glob: 'src/host/service.ts', reason: '…' }],
});
```

层序表与 `dsh.workbenchFaces` 所指两个面不可调；改动会先红 `contracts` / `source`。

## 第十三条 `lint`

`arch` 管文件间，`lint` 管文件内。只检查带 `eslint.config.mjs` 的模块；无文件 = 不适用，不是红。

```js
import { moduleLint } from '@dsh-workbench/module-tools/lint';
export default moduleLint({ rootDir: import.meta.dirname });
```

`rootDir` 固定 typescript-eslint 的 `tsconfigRootDir`（工作区可能有其他 eslint 配置；不传会报
`No tsconfigRootDir was set…`）。

仅 `error` 算红；`warn` 计数。聚合最多 40 条，`--only lint` 全列；配置无法加载也红。

| 规则 | 含义 | 修法 |
|---|---|---|
| `no-explicit-any` | `as any` / `: any` | 写真实类型；或在 `moduleLint({ rules })` 放行 |
| `no-console` | `src/**` 的 `console.log` / `info` / `debug`（`warn` / `error` 放行） | 删除；`scripts/**` 不判 |
| `no-debugger` | 残留 `debugger` | 删除 |
| `no-restricted-syntax` | 颜色字面量（`#ff0000` / `rgb(` / `hsl(`）、字符串 `!important`、平台原始探测（`process.platform` / `versions.electron` / `dshDesktop` / `navigator.userAgent`） | 用令牌与 `*.module.css`；平台差异走能力面：**宿主面读 `deps.surface`（`HostSurface`），浏览器面读 `kit.hooks.usePlatform()`**，宿主/浏览器面分开写 |
| `react-hooks/*` | 条件 hook / 渲染期写 ref / 漏依赖 | 提到顶层；副作用进 `useEffect`；补依赖 |
| `no-unused-vars` | 死代码（`^_` 放行） | 删除或改成带前导下划线的名字 |
| 其他 `recommended` / `react/*` | 语法规则 | 按 eslint 原文 |

放宽从命名参数（`ignores` / `rules`）；按目录追加一块：

```js
export default [
  ...moduleLint({ rootDir: import.meta.dirname, rules: { 'no-console': 'off' } }),
  { files: ['src/legacy/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
];
```

不改方言：判据将 `moduleLint()` 的整份 8 块与配置逐块比（名字 / `files` / `rules`；`/overrides`、`/root` 不比），
全局 ignores 按超集比。少块、重名、改规则值、只复制名字、`export default []`、`.filter(…)` 均红。

`dsh-wb-module lint --fix` 写回可自动修项；`check` 不改文件。

## 怀疑门禁

骨架刚 `init`、尚未改动就判定失败，说明是模板或工具的问题，与模块无关。
