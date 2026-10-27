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

形状：`src/components/HelloCard.tsx` 是卡片，`src/client.tsx` 只注册，`src/host.ts` 是宿主面，
`src/messages.ts` 是文案；有纯逻辑就放 `src/model/**` 并配一份同目录测试。

## 开发与发布

开发命令见上面的六个脚本；dsh / 工作台的模块约束见工作台模块指引（随外壳出货）；agent 的工作说明见 `AGENTS.md`。

发布（维护者确认之后）：`dsh-wb-module release --target team|public|tarball|git`；
`--dry-run` 只预览，`--verify` 只核已发布的包。
