# Contributing

Thanks for helping. This is a pnpm workspace: the shell is
`packages/core` (published as `@dsh-workbench/core`), the shared contracts
live in `packages/shared`, module tooling in `packages/module-tools`, and
`packages/module-hello` is the smallest installable module.

The documentation is written in Chinese. If you only need the quickest path:
install, run the gate, then read [`AGENTS.md`](AGENTS.md) for the repository
map and the six hard constraints.

## Prerequisites

- Node.js 22+
- pnpm 10 (`packageManager` in the root `package.json`)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) on `PATH`
  and at least one `dsh web` run, for the runtime/integration checks
- macOS, Linux or Windows; the shell is developed primarily on macOS

## Setup

```bash
git clone https://github.com/novaeth/dsh-workbench.git
cd dsh-workbench
pnpm install
pnpm run check        # the one gate: commit message · build · typecheck · lint · coverage ·
                      # arch · docs · runtimes · selfcheck · module checks · release artifacts
```

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
  reused instead of re-drawn. See [`ARCHITECTURE.md`](ARCHITECTURE.md) §13.
- Modules must not import the shell's source, must ship a single client bundle,
  and must pass `dsh-wb-module check`. Start from
  [`packages/core/skills/workbench-module-diy/`](packages/core/skills/workbench-module-diy/SKILL.md).

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
