# @dsh-workbench/docs

文档站。用 [Pagoda CLI](https://www.npmjs.com/package/@pagoda-cli/core) 搭，和仓库里
`README.md`、`ARCHITECTURE.md`、各包 README 分工是：**那些写给读代码的人，站点写给用的人**。

私有包，不出货。

## 跑

```bash
pnpm run dev:docs      # 起文档站（根目录跑；改 md / vue / scss 热更新）
pnpm run build:docs    # 出静态站到 packages/docs/site-dist/
```

## 结构

```
pagoda.config.mjs          站点配置：标题、导航、布局、publicPath
site/desktop/index.js      页面行为（首页不显示右侧锚点）
site/desktop/style.js      样式入口
site/desktop/style/        css-vars.scss（色板与框架变量） + index.scss（首页与正文）
site/desktop/views/        一个文件一页：index.vue 是首页，其余是 md
site/static/               原样拷到站根（logo.svg）
```

## 加一页

1. 在 `site/desktop/views/` 下建 `xxx.md`（或 `guide/xxx.md`）
2. 在 `pagoda.config.mjs` 的 `site.nav` 里挂一行 `{ title: '标题', view: 'xxx' }`
3. 站内跳转优先用 `<PagodaDocLinkToView view="guide/xxx">…</PagodaDocLinkToView>`；只有 `views/index.vue` 这类静态首页可以直接写 `href="#/…"`

目录（`views/guide/`）的落地页必须叫 `guide/index.md`，写成 `views/guide.md` 就成了顶级页 ——
路由的 `meta.prefix` 是空的，左侧菜单不会出现。分组 `items` 里的 `view` 只写叶子名
（`quickstart`，不写 `guide/quickstart`）：前缀由框架按分组拼，写全路径会拼成
`/guide/guide/quickstart`，点了没反应。

## 一处坑：typescript 版本

`@pagoda-cli/core` 自带一份 TypeScript 6。根 `package.json` 里的 `typescript: 5.9.3` 是钉住的，
别删 —— 删掉之后 pnpm 会把根上 `@arch-guard/core` 的 peer 抬到 6，`check:docs` 直接崩在
「未知适配器面」。要升 TS，先确认 `pnpm run check:docs` 还能过。

## 发到 GitHub Pages

```bash
pnpm run deploy:docs              # 构建并推 gh-pages
pnpm run deploy:docs -- --dry-run # 只构建，不推
```

底层是 `gh-pages`：把 `site-dist/` 推到 `gh-pages` 分支，顺带写 `.nojekyll`。第一次推完，
在仓库 Settings → Pages 里把源指到 `gh-pages` 分支。`publicPath` 为空，所以仓库页子路径
（`/<repo>/`）也能跑。

右上角的 GitHub 入口不在 `pagoda.config.mjs` 里配：框架的 `site.links` 渲染在标题左边、还是个下拉。
它由 `site/desktop/index.js` 的 `install()` 注入到 `.pagoda-doc-header__right` 末尾，样式跟着
`index.scss` 最后那段走。要改地址就改那一个常量。
