# __NAME__

`__UNIT__` 模块：一个独立的 dsh 插件包，只认外壳的服务名，不认识外壳源码。

```bash
dsh-wb-module build     # 出 dist/host.js 与套了 loader 壳的 client.js
dsh-wb-module check     # 契约 / 声明协议 / 产物边界 / 源码边界 / 架构 / dsh 原语 / kit 面 / 卡片渲染 / 独立构建 / 内部标识 / 样式归属 / 不指外壳 / 代码卫生（eslint）
dsh-wb-module check --only cards   # 十三条可以单跑
```

包自带的六个脚本（`build` / `typecheck` / `test` / `selfcheck` 是 `check` 的契约判据要求的那四个；`check` 跑全部判据，`lint` 只跑源码卫生那一条）：

```bash
pnpm build        # 构建产物
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest（src/**/*.test.ts）
pnpm selfcheck    # 构建 + 把 client.js 当浏览器加载器跑一遍，看卡片真进没进外壳
pnpm check        # dsh-wb-module check
pnpm lint         # dsh-wb-module lint（`--fix` 就地改文件；`check` 永不动手）
```

形状是**分层多文件**：`src/components/HelloCard.tsx` 是这张卡（卡壳 + 两句正文），
`src/client.tsx` 只剩面（注册 + 把 props 交给组件），`src/host.ts` 是宿主面，
`src/messages.ts` 是文案。目录**按需要出现** —— 这份没有纯逻辑，所以没有 `src/model/`；
一旦有了（换算 / 状态机 / 类型），就放 `src/model/**` 并配一份同目录测试。
两个面在第 10 层、`components/` 第 2 层、`model/` 与 `messages.ts` 第 1 层：
上层只许 import 下层的，`arch.config.mjs` 那份方言 + `check` 的 `arch` 判据会当场报
（宿主侧 import `components/**` 是跨运行时，也红）。

包根还有两份**只有两行**的方言配置，各自一条判据按"文件在不在"上车：
`arch.config.mjs`（`moduleArch()`：层序 / 反向依赖 / 跨运行时）与
`eslint.config.mjs`（`moduleLint()`：`console` / `as any` / hooks 那几条 / 手搓颜色字面量）；
要开口子都从工厂参数进，别手写一份自己的配置。

装进本地工作台：

```bash
dsh plugin --profile workbench add <本目录>
```

要加能力：`package.json` 的 `dsh.workbench.tools[]` 里每个工具写 `name` / `writes` / `key`
（`key` 是代码里那个短名，lowerCamelCase），然后跑一次

```bash
dsh-wb-module sync   # 按清单生成 src/declared-tools.ts
```

代码里写 `DECLARED_TOOLS.<key>.name` —— **工具名的字面量只留在清单这一处**。生成物过期、半写 `key`、
或源码里又写了一遍工具名字面量，`check` 都会红（`sync` 会告诉你缺哪个工具的 `key`）。

面板只读、写入只走 agent 工具；共享代码从 `@dsh-workbench/shared` 拿，
单例机制（hooks / 容器组件 / 读缝）只能从 `@dsh-workbench/core/client` 的 kit 拿。
dsh 已有的组件与样式**先从 kit 拿**，别从 DOM + CSS 重画。

要发布：把 `package.json` 里的 `private` 去掉，并显式写上发布目标
（`publishConfig.access: "public"` 或指向内网源的 `publishConfig.registry`）——
`private: true` 的包不许发到任何源，这是刻意的默认。
