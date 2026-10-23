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
2. 在 `pagoda.config.mjs` 的 `site.nav` 里挂一行 `{ title: '标题', view: 'guide/xxx' }`
3. 站内跳转用 `<PagodaDocLinkToView view="guide/xxx">…</PagodaDocLinkToView>`，别写死 `href`

## 改样子

整套样式是从 `vite-plugin-aipanel` 的文档站原样搬过来的，**不要重写**：换外观就在这两份里改值，
别另起一套命名。

- `style/css-vars.scss` —— 框架变量表（`--pd-doc-*` 那批是框架认的），品牌色 `#b39aff` 在文件顶部
- `style/index.scss` —— 首页与正文的版式（`.hero-*` / `.f-card` / `.qs-*` / `.doc-content`）
- `views/index.vue` 的 `<style>` —— 首页自己的那段，跟着模板走

品牌色、间距、圆角与 aipanel 保持同一套；两边只有文案和页面内容不同。要改主色，改
`css-vars.scss` 顶部那组 `--brand-*` 与 `--pd-doc-primary-base`，别在别处另写十六进制。

**别改 `node_modules` 里的框架样式**；要覆盖就写在这两份里。

## 一处坑：typescript 版本

`@pagoda-cli/core` 自带一份 TypeScript 6。根 `package.json` 里的 `typescript: 5.9.3` 是钉住的，
别删 —— 删掉之后 pnpm 会把根上 `@arch-guard/core` 的 peer 抬到 6，`check:docs` 直接崩在
「未知适配器面」。要升 TS，先确认 `pnpm run check:docs` 还能过。

## 发到 GitHub Pages

```bash
pnpm run build:docs
git worktree add /tmp/wb-pages gh-pages
cp -r packages/docs/site-dist/* /tmp/wb-pages/
cd /tmp/wb-pages && git add -A && git commit -m "docs: publish site" && git push origin gh-pages
```

第一次推完，在仓库 Settings → Pages 里把源指到 `gh-pages` 分支。`publicPath` 为空，所以
仓库页子路径（`/<repo>/`）也能跑。

右上角的 GitHub 入口不在 `pagoda.config.mjs` 里配：框架的 `site.links` 渲染在标题左边、还是个下拉。
它由 `site/desktop/index.js` 的 `install()` 注入到 `.pagoda-doc-header__right` 末尾，样式跟着
`index.scss` 最后那段走。要改地址就改那一个常量。
