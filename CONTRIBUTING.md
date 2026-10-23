# Contributing

Thanks for helping. This is a pnpm workspace: the shell is
`packages/workbench` (published as `@dsh-workbench/core`), the shared contracts
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
pnpm run check        # the one gate: commit message · typecheck · lint · coverage ·
                      # arch · docs · runtimes · selfcheck · module checks · release artifacts
```

`pnpm run dev` starts the workbench on `:3081` next to `dsh web` on `:3080` and
watches `packages/workbench/src/**`.

Internal maintainers: the design docs and ADRs live in the private `private-docs/`
submodule. Public builds and the gate do not need it. With access, run
`git submodule update --init`. The full command list is in
[`AGENTS.md`](AGENTS.md) and [`packages/workbench/README.md`](packages/workbench/README.md).

## Before you open a pull request

- Keep the change to one concern. A refactor and a behaviour change in one PR
  are hard to review.
- Run the gate on a **frozen tree**: record `git status --short` before and
  after `pnpm run check`. Do not run two gates at once — `check:standalone`
  temporarily renames `packages/workbench/src/`, and `coverage` rewrites
  `packages/workbench/coverage/`.
- Do not commit `dist/`, `coverage/`, `client.js`, probe output or machine
  specific paths. See [`.gitignore`](.gitignore).
- Commit messages follow Conventional Commits (`feat(scope): …`, `fix: …`,
  `chore: …`). A `commit-msg` hook rejects anything else, and `pnpm run check`
  lints the HEAD message through `pnpm run lint:commit`.
- New decisions get an ADR in the `private-docs/` submodule. Internal feature
  specs and work items live there too; they are not part of the public tree.
- Code comments are not allowed anywhere in the repo (JS / TS / CSS). The only
  exception is JSDoc attached to exported members of a public entry — the kit,
  plus `@dsh-workbench/shared`'s `.` / `/host` / `/testing` — and tool
  directives (eslint / ts / vitest). The check derives that surface from the
  barrels and the kit object, so internal helper files get no exception. The
  "why" goes into an ADR, `CONTEXT.md`, or the feature spec. CSS carries none.
- UI is written as components with their own `.module.css`; dsh primitives are
  reused instead of re-drawn. See [`ARCHITECTURE.md`](ARCHITECTURE.md) §13.
- Modules must not import the shell's source, must ship a single client bundle,
  and must pass `dsh-wb-module check`. Start from
  [`packages/workbench/skills/workbench-module-diy/`](packages/workbench/skills/workbench-module-diy/SKILL.md).

## Reporting bugs

Open a GitHub issue with a minimal reproduction, the workbench version, the dsh
version, the OS and the relevant log lines. For security issues, follow
[`SECURITY.md`](SECURITY.md) instead of opening a public issue.

## License

Contributions are accepted under the MIT License (see [`LICENSE`](LICENSE)).
