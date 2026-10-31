# @dsh-workbench/shared

工作台与模块共用的**契约与纯代码**：类型、纯函数、哑组件、i18n、宿主侧工具。
它不持有状态、不依赖外壳运行时、不产生全局副作用 —— 所以外壳和每个模块都可以各自打一份，
不会打架。

对模块作者来说，这里是「不用自己重画」的那一层：卡片壳、行、表单、链接、加载态都在
`components/`，契约类型都在 `contract/`。**dsh 有的原语走 kit，工作台自己的视觉用这里的组件**，
两者拼出面板，不要从 DOM + CSS 重写一遍。

## 四个导出面

| 入口 | 谁用 | 有什么 |
|---|---|---|
| `@dsh-workbench/shared` | 浏览器侧 | 契约类型、纯函数、哑组件（样式随组件）、i18n、读通道 `apiGet` / `factOfRoute` |
| `@dsh-workbench/shared/host` | 宿主侧（Node） | 数据根、git、http、面板状态、单元声明、请求配方 composer 等，**有 `node:*`** |
| `@dsh-workbench/shared/testing` | 测试 | 宿主侧假件、从 `package.json` 读模块声明 |
| `@dsh-workbench/shared/contract/*` | 插件 / 适配器（仅类型） | 契约子路径；`exports` 里的 `./contract/*`，只给类型用 |

两条硬边界：

- **根入口是浏览器安全的**：不许出现 `node:*`。宿主侧取运行值只走 `/host`。
- **模块源码对根入口只许 `import type`**：取运行值会在浏览器里打进第二份实例，也会让
  `dist/host.js` 在 Node 里 import 不进来。这条由 module-tools 的 `source` 判据盯着。

组件样式与组件同目录（`X.css` / `X.module.css`），构建时原样搬到 `dist/` —— 消费方不用另配
CSS 处理。

## 收录判据

进这个包的东西要同时满足三条，缺一条就留在外壳里：

1. **无模块级可变状态**：顶层 `let` / `var`、被写入的顶层 `Map` / `Set` 都不行。共享包会被每个
   消费者各打一份，带状态就是各说各话。`scripts/check-state.mjs` 守这一条。
2. **不依赖外壳运行时**：不 import 外壳的代码、不假设自己在哪一列里渲染。
3. **不产生全局副作用**：import 即注册、改全局、读环境都不行；要环境就从参数或 `/host` 进。

判断不了就问一句：**这份东西被复制成两份，会有什么坏结果？** 答案不是「没有」就别放进来。

## 目录

| 落点 | 是什么 |
|---|---|
| `src/api/` | 浏览器侧接缝：读 / 写通道、平台客户端 |
| `src/contract/` | 契约：单元清单、卡片面、读 / 写通道、长任务、审批、面板状态 |
| `src/components/` | 哑组件：`Card` / `CardHead` / `Rows` / `Form` / `FormRow(s)` / `FormActions` / `Link` / `Stack` / 各态块 |
| `src/config/` | 常量与存储键 |
| `src/i18n/` | zh / en 字典、合并与设置 |
| `src/lib/` | 纯函数：文本、忙碌态、表单问题、看板事实 |
| `src/host/` | 宿主侧内核与领域：http、facts、面板状态、workspace、单元声明 |
| `src/testing/` | 测试假件与声明读取 |

`src/index.ts` 与 `src/host.ts` 是**生成的 barrel**：新增文件后跑 `pnpm run barrels`，别手抄。
它会拦重名导出（`export *` 会静默丢掉其中一个）。

## 怎么用

```ts
// 外壳
import { Card, Rows, type UnitManifest } from '@dsh-workbench/shared';
import { workbenchRoot } from '@dsh-workbench/shared/host';

// 模块
import type { UnitClientFace } from '@dsh-workbench/shared';
import { kit } from '@dsh-workbench/core/client';
```

规矩按调用方分：

- **外壳自己**从根入口取运行值（组件、`apiGet`…），它是这份代码的主人。
- **模块**的组件从 kit 取：`import { kit } from '@dsh-workbench/core/client'`，根入口只许
  `import type`。宿主侧要运行值走 `/host`，浏览器侧要纯函数走 kit —— 两侧都不该从根入口取，
  否则浏览器会打进第二份实例、宿主侧会让 `dist/host.js` 在 Node 里 import 不进来。
- 模块里只取类型时写成单独一行 `import type { … }`，别和运行值混在一条语句里 ——
  `source` 判据按语句判「是不是只取类型」。

组件是**哑的**：props 进、界面出，不取数、不读宿主、不自己决定什么时候刷新。取数在外壳的
hooks 或模块自己的 `model/` 里，所以同一张卡片在真数据和夹具下长得一样。

## 开发

```bash
pnpm --filter @dsh-workbench/shared run build      # tsc + 搬 CSS
pnpm --filter @dsh-workbench/shared run test
pnpm --filter @dsh-workbench/shared run selfcheck  # check-state：无模块级可变状态
```

两个 barrel 用 `pnpm run barrels` 重生成；`pnpm run arch` 跑这个包自己的分层配置。
代码零注释，只有公开成员的导出 JSDoc 例外（它会进 `.d.ts`，是给消费方看的）。

## 相关文档

| 想了解 | 读 |
|---|---|
| 层序、两个运行时、槽位、数据通路 | [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| 组件怎么选、kit 里有什么 | [KIT.md](../core/skills/workbench-module-diy/KIT.md) |
| 模块的构建与门禁 | [module-tools](../module-tools/README.md) |
| 最小模块样本 | [module-hello](../module-hello/README.md) |
| 环境与提交 | [CONTRIBUTING.md](../../CONTRIBUTING.md) |
