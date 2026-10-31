# __NAME__ · agent 工作说明

工作台模块（单元 `__UNIT__`）。模块行为与数据看 `README.md`；这份只说工具链怎么用。

## 干活循环

改 `src/**` 后：

1. `pnpm build` —— 产出 `dist/host.js` + 套了 loader 壳的 `client.js`；产物由它生成。
2. `pnpm check` —— 十三条判据，读的就是上一步的产物。单跑一条用 `pnpm check --only <判据名>`；
   **全绿**才算这件活做完。怎么读红、常见红：`@dsh-workbench/core/skills/workbench-module-diy/REVIEW.md`。
3. `pnpm test` —— 与改动同目录的 `*.test.ts`；新逻辑配对应用例，**全绿**才算完。

`pnpm selfcheck` = build + `design check` + smoke；`design.json` 里的（待填）填完才绿。

## 工具链约定

- 清单是工具名唯一真相：`dsh-wb-module sync` 生成 `src/declared-tools.ts`，代码引 `DECLARED_TOOLS`。
- 判据读构建产物：改了 `src/**` 先 build 再 check。
- 发布：`dsh-wb-module release --target team|public|tarball|git`；`--dry-run` 只预览，`--verify` 只核已发布的包。

## 先读

- `README.md`：模块行为、数据源、三张表。
- `@dsh-workbench/core/skills/workbench-module-diy/`：路由 / 工具 / 卡片 / 文案的写法与约定（随外壳出货）。
