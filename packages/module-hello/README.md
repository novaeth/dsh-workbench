# @dsh-workbench/module-hello

工作台里**最小的可安装模块**：装上面板多一张卡片，卸掉就没了。它同时是模块包的样板 ——
两个面各注册一次、卡片只有一个标题、没有工具、没有数据源，别的一概不掺。

拿来试装试卸最省事；想知道一个模块**必须**有什么，看它的文件比看文档快。

## 装

```bash
# 装进工作台的 profile（实例名按你自己的来，默认 workbench）
dsh plugin --profile workbench add @dsh-workbench/module-hello
```

也可以在 `:3081` 的「工作台模块市场」里找到它装。装完右栏多一张「示例模块」卡片，
标题下两行字，刷新按钮接好了但没有数据源 —— 按了只会重画。

卸掉：市场里卸，或 `dsh plugin --profile workbench remove @dsh-workbench/module-hello`。

## 它演示了什么

| 东西 | 在哪 | 说明 |
|---|---|---|
| 模块声明 | `package.json` 的 `dsh.workbench` | `apiVersion: 1`、单元 id `hello`、一张卡、零工具、不注入外壳服务 |
| 宿主面 | `src/host.ts` | 把 `{ unit: 'hello', mount }` 注册进外壳的 `workbenchUnits`；`routes` 空、`registerTools` 空 |
| 浏览器面 | `src/client.tsx` | 把 `{ unit, messages, card }` 注册进外壳；卡片用 kit 的 `Card` |
| 文案 | `src/messages.ts` | zh / en 两份字典，键名以前缀分域 |
| 接线 | `cordis.patch.yml` | 把自己插进 profile 的组合图 |
| 测试 | `src/plugin.test.ts` | 断言插件名、注入面、两个面各注册一次 |

两个面都只 `inject: ['workbenchUnits']` —— 外壳交出来的那个服务。宿主侧拿不到服务时打一条
warn 就退，不会把整个 entry 拖挂。

## 文件

```text
src/
  host.ts        宿主面：注册单元
  client.tsx     浏览器面：注册卡片
  messages.ts    文案（zh / en）
  plugin.test.ts 两个面的注册测试
scripts/smoke.mjs  构建后冒烟：产物能 require、导出齐全
cordis.patch.yml   把自己插进 profile 组合图
arch.config.mjs    一行：moduleArch()
eslint.config.mjs  两行：moduleLint()
client.js / dist/  构建产物（不进 git，但必须进 npm 包）
```

## 开发与门禁

```bash
pnpm install
pnpm build     # dist/host.js + client.js
pnpm test      # 单元测试
pnpm check     # 十三条模块判据（契约 / 产物边界 / 源码边界 / 卡片渲染 / arch / lint …）
pnpm selfcheck # build + 产物冒烟
```

改了想马上看效果：重新 `pnpm build` 后刷新页面；宿主侧热换，不用重装。

## 想造自己的模块

别从这份抄起，跑工具链：

```bash
pnpm exec dsh-wb-module init my-unit --template diy
```

`diy` 模板有真数据源、五态卡片和填好的设计底稿。完整流程见
[模块 DIY 指引](../workbench/skills/workbench-module-diy/SKILL.md)，
判据与工具见 [module-tools](../module-tools/README.md)。

## 相关文档

| 想了解 | 读 |
|---|---|
| 模块怎么写、怎么装、怎么验收 | [DIY 指引](../workbench/skills/workbench-module-diy/SKILL.md) |
| 构建、接线、注册的细节 | [BUILD.md](../workbench/skills/workbench-module-diy/BUILD.md) · [WIRING.md](../workbench/skills/workbench-module-diy/WIRING.md) |
| 十三条判据、模板、设计底稿 | [module-tools](../module-tools/README.md) |
| 契约类型与共享组件 | [shared](../shared/README.md) |
