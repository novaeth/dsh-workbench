# Contributing

Thanks for helping. This is a pnpm workspace: the shell is
`packages/core` (published as `@dsh-workbench/core`), the shared contracts
live in `packages/shared`, module tooling in `packages/module-tools`, and
`packages/module-hello` is the smallest installable module.

Most documentation is written in Chinese; `CONTRIBUTING.md`, `SECURITY.md` and
`THIRD-PARTY-NOTICES.md` are in English. If you only need the quickest path:
install, run the gate, then read [`AGENTS.md`](AGENTS.md) for the repository
map and the six hard constraints.

## Prerequisites

- Node.js 22+ (CI uses the version in `.nvmrc`)
- pnpm 10 (`packageManager` in the root `package.json`; CI reads it, so the version lives there only)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) on `PATH`
  and at least one `dsh web` run, for the runtime/integration checks
- macOS, Linux or Windows; the shell is developed primarily on macOS

## Setup

```bash
git clone https://github.com/novaeth/dsh-workbench.git
cd dsh-workbench
pnpm install
pnpm run check
```

`pnpm run check` runs the one gate in this order:

<!-- doc-facts:begin gate-chain-inline -->
`lint:commit` → `build` → `check:deps` → `typecheck` → `lint` → `check:duplication` →
`check:swallow:strict` → `coverage` → `check:gates:target --fail-on-red` → `arch` →
`check:docs` → `check:copy:strict` → `check:runtimes` → `selfcheck` → `check:modules` →
`check:adapter-defaults` → `scripts/check-adapter-contract.mjs` →
`scripts/check-opencli-wire.mjs` → `check:release-packages` → `check:release-artifacts`
<!-- doc-facts:end gate-chain-inline -->

`pnpm run check` 默认不在第一个失败处停：互不依赖的判据照常运行，最后列出失败清单与各自的输出末尾；
依赖 `build` 的步骤在 `build` 失败时标为未运行。要恢复第一个失败就停，用 `--fail-fast`；只跑其中几条
用 `--only <名字,名字>`（没选中的依赖视为满足）。

`pnpm run dev` starts the workbench on `:3081` next to `dsh web` on `:3080` and
watches `packages/core/src/**`.

The gate builds before it typechecks: `packages/module-hello` imports the kit from
`@dsh-workbench/core/client`, and that is a build artifact (`client.js` and
`dist/types`, both ignored). `pnpm install` already runs a `prepare` that writes
the type surface, so editors and a per-package `typecheck` work right after
install; running one package's tests before any build does not, so run
`pnpm run build` once if you go that way.

Internal maintainers: the design docs and ADRs live in the private `private-docs/`
repo, cloned into the repo root as `private-docs/` (gitignored; ask a maintainer
for access). Public builds and the gate do not need it. The full command list is in
[`AGENTS.md`](AGENTS.md) and [`packages/core/README.md`](packages/core/README.md).

## Writing tests

Tests in `packages/core` describe **what the adapter protocol promises**, never how the
current adapter implements it. Use `fakeAdapterSet()` from `@dsh-workbench/shared/testing`
(or a double written against the port) and keep `@dsh-workbench/adapter-*` imports out of
`packages/core` entirely — S70 enforces this. Tests for adapter internals belong to the
adapter package that owns them. Test files live in a `__tests__/` folder next to the code
they cover — never scattered next to it (S73).

## Before you open a pull request

- Keep the change to one concern. A refactor and a behaviour change in one PR
  are hard to review.
- Run the gate on a **frozen tree**: record `git status --short` before and
  after `pnpm run check`. Do not run two gates at once — `check:standalone`
  temporarily renames `packages/core/src/`, and `coverage` rewrites
  `packages/core/coverage/`.
- Do not commit `dist/`, `coverage/`, `client.js`, probe output or machine
  specific paths. See [`.gitignore`](.gitignore).
- Commit messages follow Conventional Commits (`feat(scope): …`, `fix: …`,
  `chore: …`). A `commit-msg` hook rejects anything else, and `pnpm run check`
  lints the HEAD message through `pnpm run lint:commit`.
- New decisions get an ADR in the private `private-docs/` repo. Internal feature
  specs and work items live there too; they are not part of the public tree.
- Code comments are not allowed anywhere in the repo (JS / TS / CSS). The only
  exception is JSDoc attached to exported members of a public entry — the kit,
  `@dsh-workbench/core/contract` (types only), plus `@dsh-workbench/shared`'s
  `.` / `/host` / `/testing` — and tool
  directives (eslint / ts / vitest). The check derives that surface from the
  barrels and the kit object, so internal helper files get no exception. The
  "why" goes into an ADR, `CONTEXT.md`, or the feature spec. CSS carries none.
- UI is written as components with their own `.module.css`; dsh primitives are
  reused instead of re-drawn. See [`ARCHITECTURE.md`](ARCHITECTURE.md) §7.
- Modules must not import the shell's source, must ship a single client bundle,
  and must pass `dsh-wb-module check`. Start from
  [`packages/core/skills/workbench-module-diy/`](packages/core/skills/workbench-module-diy/SKILL.md).

## Releasing

`pnpm release` runs the full gate plus a mandatory changelog check that `--skip-gate`
cannot bypass. It applies to stable versions only: prereleases (`-beta`, `-rc`, …) skip
it. Before you start, `packages/docs/site/desktop/views/changelog.md` must
already contain a `## v<version>` section with content for the version being released;
after the release build, `packages/core/CHANGELOG.md` (shipped with
`@dsh-workbench/core`) must contain the same version. Check one version directly with
`pnpm run check:changelog -- --version <version>`.

正式版本发布成功后，`pnpm release` 会把文档站构建并推到 `gh-pages`（即
`pnpm run deploy:docs`），再提交、打 tag；预发布版跳过文档部署。
文档部署失败不回滚已发布的包：修好后 `pnpm run release:resume` 会重试部署与 git 收尾。

`pnpm release` 的 preflight 会跑 `pnpm run check:compat`：有未解决的 `compat` issue 就停。凭据先取
`GH_TOKEN` / `GITHUB_TOKEN`，都没有就回落 `gh auth token`；再取不到时终端能交互就当场跑 `gh auth login`，
非交互环境直接 fail-closed，不会静默放行。确需豁免时先跑 `pnpm run check:compat -- --waiver "原因"`，把理由记进发布记录。

`compat-watch` 每 6 小时把 Desktop / Chrome for Testing / opencli 的 latest 与
`scripts/desktop-smoke/fixture.json` 里的固定版本比较；漂了会开 `compat` issue。需要跑桌面 smoke 的
required 路径用 fixture 里的固定版本（Desktop 比两样：下载地址的 ETag，和 `content-disposition` 里的
版本号——上游可能只改文件名、产物字节不变；Chrome / opencli 用版本号校验）；升级 fixture 只走独立
bump PR，不和产品改动混在一起。

## Documentation facts

Some document blocks are generated from code, not hand-written. Change the source
(for example `scripts/gate/steps.mjs` for the gate chain, `arch.config.mjs`, or a package's `arch.config.mjs`) and run
`pnpm run doc-facts:write`; `pnpm run check:doc-facts` fails when a block is stale.
`pnpm run check:docs` runs it together with the other document checks.
Husky also runs `pnpm run check:docs` plus the `DOC-3` link/§N gate on every
commit; run the full `pnpm run check` before pushing. Set `HUSKY=0` to skip
hooks for a one-off commit.

## Duplication

`check:duplication` runs [jscpd](https://github.com/kucherenko/jscpd) over `packages/` and
`scripts/` (TypeScript / JavaScript; tests and build output excluded, see `.jscpd.json`) in
baseline mode: the clones recorded in `.jscpd-baseline.json` are accepted, and anything
outside the baseline fails the gate with the new clones printed as `file:line ~ file:line`.
It catches both identical clones and renamed ones (`ignoreIdentifiers` + `ignoreLiterals`),
which is not exhaustive: a short block whose names all differ can slip through.

Known noise: flat data tables (state maps, word lists) match themselves under the renamed
mode, so editing such a table reports a same-file clone. When the new-clone list contains
only same-file table self-matches, fix or refactor first; `pnpm run duplication:accept`
rewrites the baseline and must wait for explicit user approval.

- Remove the duplication, or
- accept it explicitly with `pnpm run duplication:accept` **after the user has approved
  that clone**, then commit the updated `.jscpd-baseline.json`.
- `pnpm run duplication:report` writes the full HTML and JSON reports to `coverage/duplication/`.

Baseline fingerprints describe clone content, not line numbers or file names, so moving code
or renaming files does not invalidate the baseline. Re-run `duplication:accept` — with the
user's approval — after changing the scan surface in `.jscpd.json` or after upgrading jscpd
across a major version.

## Swallowed errors

`check:swallow` parses every `.ts` / `.tsx` / `.js` / `.mjs` / `.cjs` file under `packages/`
and `scripts/` (tests, declarations and build output excluded) and reports `catch` and
`.catch(...)` handlers that leave no observable outcome: no rethrow, no log or report call, no
findings list push, no `process.exitCode`, and no failure-shaped return such as
`{ ok: false }`. A handler that returns `undefined` / `null` / `[]` / `false` is reported too:
the caller cannot tell it from "nothing there", which is how a real failure turns into an empty
panel.

The accepted sites are recorded in `.swallow-baseline.json`, keyed by file plus the shape of
the handler, so moving code or shifting line numbers does not invalidate it. The step runs in
report mode inside `pnpm run check` — it prints the totals and any site outside the baseline,
but does not fail the chain yet.

- Fix the site (log it, rethrow, or return an explicit failure) — preferred.
- Accept it with `pnpm run swallow:accept` and commit the updated `.swallow-baseline.json`.
- `pnpm run swallow:report` prints every accepted site as `file:line  kind/bucket  handler`.
- `pnpm run check:swallow:strict` is the same check with a non-zero exit when new sites
  appear; switch the chain step to it once the baseline stops growing.

## CI

GitHub Actions runs three workflows:

- `.github/workflows/docs.yml` (ubuntu, pull requests and pushes to `main`): `pnpm run check:docs:strict`
  — `check:docs` plus every gate tagged `docs` — and `pnpm run lint`.
- `.github/workflows/desktop-smoke.yml` (pushes to `main`, a weekly cron, and manual dispatch; macOS
  plus Windows Server 2022/2025 through `desktop-smoke-windows.yml`): installs the shipped Desktop
  build, installs the workbench from the plugin page, runs preflight, loads the opencli extension,
  installs `module-hello` from the market, restarts once and asserts the card. It also drives the
  workbench's own self-update the way a user meets it: a fixture installs the newest published build,
  keeps an older-labelled copy of that install as the running version, points the profile at it and
  turns `includePrerelease` on, so a newer published release shows up as an update; the probe
  clicks 「更新」 on the workbench row, asserts the interface stays up and the row says the new version
  is ready while the running version is still the old one, then a restarted instance asserts the
  running version is the new one. The self-update legs are hard-gated. The install target and the
  self-update fixture live in `scripts/desktop-smoke/fixture.json`; both OS legs load the same file.
  A failing run publishes the page/log evidence to a `desktop-ui-log-*` branch; a green one only
  uploads the run artifacts.
- `.github/workflows/platform-smoke.yml` (pull requests and pushes to `main` except markdown-only and
  docs-site-only changes, a weekly cron, and manual dispatch; ubuntu, macOS, Windows Server 2022/2025):
  runs `scripts/smoke/index.mjs` — every `scripts/smoke/*.mjs` is discovered by directory, so a new
  smoke script needs no workflow edit — plus `scripts/ci/platform-tests.mjs`, which derives the
  platform-sensitive vitest invocations from the manifest, and the core selfcheck. Windows runs only
  the selfcheck checks tagged `win32`. This is the cross-platform guard for the execution seam: keep
  it green when touching `shell-render`, the seam, or the DIY capture layer.

### Cross-platform call sites

A cross-platform call site is code that reads the host OS directly (`process.platform`, `hostOs`,
an OS literal) or invokes an OS-native command. Platform differences are allowed only in the
registered landings and adapter ports in `packages/core/scripts/selfcheck/platform-landings.json`;
during migration, existing files sit in `allow` with a reason and must shrink. Each landing/port
declares the OSes it branches on and the test that covers it. Tests that are platform-sensitive
without belonging to a single landing are listed under `suites`. `scripts/ci/platform-tests.mjs`
reads that manifest, groups the tests by package and runs them on every leg, so adding a platform
branch or test edits the manifest rather than the workflow.

A test file that reads a host fact directly (`process.platform`, `USERPROFILE`, `ComSpec`,
`taskkill`) must be listed under some landing/port `tests` or `suites`. The judge scans
`packages/**/*.test.*`; an unregistered host-fact test fails it. Passing `'win32'` as an explicit
string argument to a pure renderer is not a host fact and can stay in the normal gate.

The `selfcheck` judge 「跨平台调用点」 checks the manifest against the source, the test files, the
workflow matrix and that the runner runs on every OS leg. It also checks that
`scripts/smoke/index.mjs` is invoked by `platform-smoke`, so a script added to that directory is
picked up without touching CI. Adding a platform branch without a manifest entry, or a test that no
CI leg runs, fails the judge. The scan covers every package's `src`, plus the `scripts` and `bin`
entries that ship through `files`; development-only scripts are out of scope. Run it alone with:

```bash
node packages/core/scripts/selfcheck/index.mjs --only '跨平台调用点'
node packages/core/scripts/selfcheck/index.mjs --tag win32
```

The full `pnpm run check` is still the release gate and is expected before pushing. CI runs the
full gate on linux and macOS (`.github/workflows/gate.yml`). Windows runs the full unit suite and
static checks in `.github/workflows/windows-full.yml` on `main` and the weekly schedule;
`platform-smoke` keeps the manifest tests on PRs and on Windows Server 2022, and desktop smoke
covers install/self-update paths. Run the gate locally (or in a worktree) before pushing.

## Docs site

The user-facing docs site lives in `packages/docs` and is built with
[Pagoda CLI](https://www.npmjs.com/package/@pagoda-cli/core). Pages are Markdown
under `site/desktop/views/`; `views/index.vue` is the landing page; the palette
and body styles are in `site/desktop/style/`. The workspace `build` compiles it,
so a broken page fails the gate too.

```bash
pnpm run dev:docs      # from the repo root
pnpm run build:docs    # → packages/docs/site-dist/
```

Add a page by creating `site/desktop/views/<name>.md` and adding a `nav` entry in
`pagoda.config.mjs`. Link between pages with `<PagodaDocLinkToView view="…">`.
Details in [`packages/docs/README.md`](packages/docs/README.md).

## Reporting bugs

Open a GitHub issue with a minimal reproduction, the workbench version, the dsh
version, the OS and the relevant log lines. For security issues, follow
[`SECURITY.md`](SECURITY.md) instead of opening a public issue.

## License

Contributions are accepted under the MIT License (see [`LICENSE`](LICENSE)).

## 诊断记录（可观测的底座）

失败不再只写日志行，而是落一条**诊断记录**：`code`（来自契约层注册表）、类别（user / env / bug）、区域、主体、关联号、脱敏 detail。

- 记录器：宿主半侧唯一入口，注入时钟 / 关联号 / 容量 / sink；表外码降级为 `DIAG_UNKNOWN_CODE` 并把原码留在 `cause.code`；`once(key, …)` 用于轮询场景去重。
- 落盘：`<数据根>/diagnostics/records/record-<日期>-<pid>.jsonl`，保留 7 天、单日单进程 5 MB；坏行跳过并计数。
- 读口：`GET /api/diag/records`（since / until / area / class / code / limit，默认 100、上限 500）。
- 导出：动作 `export-diagnostics` 写 `<数据根>/diagnostics/<时间戳>/`（manifest / env / config / runtime / records / checks），8 MB 上限按「记录 → 日志 → 面板」截断；绝对路径与敏感键在导出前脱敏。
- agent：常驻工具 `workbench_diag` 返回最近记录、按码计数与启动检查快照（只读）。

新增失败点时：码先进注册表（`packages/shared/src/contract/blocker.ts`），再落记录；`check:swallow` 会拦住新出现的静默 catch。