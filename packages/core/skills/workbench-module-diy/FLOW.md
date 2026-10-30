# Workflow：先问一次性还是固化

多步、要等、要重试、要写平台的活，**不要默认造模块**。先问一句，再决定。

## 1 先问

问用户（给推荐，允许一字通过）：

> 这件事是一次性的，还是以后还要按同样步骤跑？我建议 **<一次性 / 固化>**，因为 **<重复信号 / 只此一次>**。

只问一次；用户已经说过「就这一次 / 以后都要 / 固化」，照办，不追问。

| 信号 | 建议 |
|---|---|
| 用户说「以后 / 每次 / 每周 / 按这个流程 / 固化 / 做成按钮」 | 固化 |
| 三步以上、有先后依赖 | 固化 |
| 要等、轮询、重试、取消、中途登录 | 固化 |
| 要写平台、要审批、要留痕 | 固化 |
| 只这一次、还在探、单步读 / 写 | 一次性 |
| 拿不准 | 先一次性，跑通后用户再要固化 |

- **一次性**：不建模块、不写 flow；直接用现有工具 / 命令跑完，告诉用户「这次直接跑，没固化」。
- **固化**：进入第 2 节；先画步骤链，再问一次「按这个固化吗？」。

不要问「要不要用 FlowDefinition / 怎么写代码 / 选哪个引擎」——这些是实现，用户不决定。

## 2 固化后长什么样

一条 workflow = 模块宿主半侧的一份 `FlowDefinition` + 动作表 + 长任务 + 工具（可选卡片）。
**v0 没有 flow 仓库，固化就是写进模块**，不是存一份 JSON。

跑起来用户看到一条长任务行（五态与停止钮见 [TOOLS.md](TOOLS.md) §9）：

- 写平台前有一次审批（模块清单 `writes: true` + `needsApproval`）。
- 工具返回 `runId`；再调可看同一条。

固化前给用户看一张 ASCII 步骤链 + 一句确认。画，不写句子；一张图 = 一条流程：

```
⚠ 写平台：开跑前先点一次「允许一次」；拒绝就不跑

发布（输入：环境 in.env）

  ① 拉代码 ── 读当前版本
  │
  ▼
  ② 构建 ── 每 5s 查一次 · 最多 5 次
  │        查到 done 往下；超时 → 失败停在这
  ▼
  ③ 发布 ── 写平台 · 失败重试 2 次（每次隔 3s）
  │
  ▼
● 发布完成 · 随时可停 · 再调工具按 runId 看同一条
```

- 步骤名用长任务行会显示的那句；① ② ③ 的流向就是 `steps` 的顺序。
- 等 / 轮询 / 重试写在那一步的箭头下：每隔多久、最多几次、超时往哪走（`maxMs: 0` 写「不限时」）。
- 写平台的步骤只标「写平台」；`⚠` 与审批词写在开跑那一行，审批屏另画（[DESIGN.md](DESIGN.md) §3）。
- 逐项、子流程、登录、分支在动作里，图上只标一句「动作里：…」，不画分支树。
- `when` 写「不满足就跳过」；`stopWhen` 写「命中就收工」。
- 用户改哪步就改图再问；图下只留「按这个固化吗？」，不补解释。

## 3 怎么写

只走宿主 kit（`mount(deps)` 的 `deps.flow`）与 `@dsh-workbench/core/contract` 的类型：

- `FlowDefinition` / `FlowStep` / `FlowValue` / `FlowPredicate` 从 `@dsh-workbench/core/contract` 取。
- `deps.flow.createActions()` / `deps.flow.check()` / `deps.flow.run()`。

最小宿主半侧（长任务与工具的完整签名见 [TOOLS.md](TOOLS.md) §9）：

```ts
import type { FlowDefinition, UnitModuleFace } from '@dsh-workbench/core/contract';

const flow: FlowDefinition = {
  id: 'release',
  title: '发布',
  target: { $ref: 'in.env' },
  steps: [
    { id: 'read', action: 'read' },
    {
      id: 'wait',
      action: 'wait',
      poll: {
        everyMs: 5000,
        maxMs: 300000,
        until: { $eq: [{ $ref: 'value.state' }, { $lit: 'done' }] },
      },
    },
  ],
};

export const face: UnitModuleFace = {
  unit: 'release',
  mount(deps) {
    const actions = deps.flow.createActions();
    actions.register('read', async () => ({ ok: true }));
    actions.register('wait', async () => ({ state: 'done' }));
    return { routes: {}, registerTools: () => [] };
  },
};
```

在模块 `mount` 里：

- `const runs = deps.longTasks.create({ key, run, view, outcome, stopped })`；`run` 调 `deps.flow.run`，把 `onStep` 映射到长任务的 `onStep`；返回 `status === 'failed'` 时 throw，让注册表标 failed。
- `registerTools` 返回一把工具：`execute` 里 `runs.start`，返回 `{ ok, runId, status, text }`；再按 `runId` 查。
- 写平台的工具：清单 `writes: true` + `needsApproval` / `approvalDetail`；动作里不要自己再问一遍。
- 校验：`deps.flow.check(flow, actions)`；有问题先修，不装。

### v0.1 能用的形状

| 需要 | 写法 |
|---|---|
| 等 / 轮询 | `poll: { everyMs, maxMs, until }` |
| 超时继续 | `poll.onTimeout: 'continue'`，后面用 `when: { $not: { $exists: ... } }` |
| 不限时（审核） | `poll.maxMs: 0` |
| 逐项 + 轮询 | `forEach` 与 `poll` 同一步；每项单独轮询 |
| 子流程 | `{ id, flow: subFlow, with: { ... } }`；结果在 `steps.<id>` |
| 提前结束 | `flow.stopWhen` |
| 登录 | 动作里 `ctx.login(url)`；长任务进 `needs-login`，动作自己等 / 重试 |

分支（`already_merged` / `can_merge` / `REVIEW_WAITING`）继续写在动作里；flow 只保留稳定的外层顺序。

## 4 不要做

- 为一次性任务建模块 / 写 flow；先跑。
- 不问用户就固化；也不要把「要不要固化」问成技术选型。
- 把分支、重试、登录循环全塞进 flow 配置；flow 表达不了的就放动作。
- 在 flow 里存密钥 / token；凭据走已有登录或 `needs`。
- 让 flow 绕过审批；写工具的审批在清单，不在动作里。

## 5 验收

- `deps.flow.check` 无问题；`dsh-wb-module build` / `check` 绿。
- 真跑一遍：长任务行出现、进度对、能停止、失败给原因；要登录时给链接。
- 写平台前审批屏能看到对象 / 环境 / 影响；拒绝后不跑。
- 用户只说过需求；没被问实现。
