# __NAME__ · agent 工作说明

这个包是工作台模块（单元 `__UNIT__`）。`README.md` 讲模块本身；这份讲 agent 在这份代码里怎么干活。

## 命令

```bash
pnpm install
pnpm build        # dist/host.js + client.js
pnpm typecheck
pnpm test
pnpm selfcheck
pnpm check        # 十三条模块判据
pnpm lint
pnpm design check
```

发布（维护者确认之后）：

```bash
dsh-wb-module release --target team|public|tarball|git
```

`--dry-run` 只预览，`--verify` 只核已发布的包。

## 不要

- 手改 `client.js` / `dist/**`：构建产物，改 `src/**` 后重新 build。

## 先读

- `README.md`：模块行为与数据源。
- 工作台模块指引：`@dsh-workbench/core/skills/workbench-module-diy/`（dsh / 工作台的约束随外壳出货）。
