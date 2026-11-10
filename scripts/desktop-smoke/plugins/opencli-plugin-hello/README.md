# opencli-plugin-hello

A minimal, real, first-party [opencli](https://github.com/jackwener/opencli) plugin.
It installs one command that prints a fixed greeting line. It does no network I/O and
touches no browser, so loading it can only fail for one reason: the plugin was not
installed or not discovered.

## Why this package exists

The dsh-workbench desktop smoke test exercises the real user path
**工作台模块市场 → 添加模块 → 填包名 → 装 opencli 插件** on macOS and Windows.
That path installs the plugin by its bare npm package name, so the test needs a package
that actually exists on the public npm registry. This is that package.

It is deliberately tiny and deliberately not a fixture: CI installs it from the registry
over the same code path a user would hit. The only thing the test asserts afterwards is
that the plugin directory is in place and that the real `opencli plugin list` reports it
with its command — a plugin that fails to load shows up as a missing command, not as a
passing test.

Frozen interface (other tooling depends on these exact values):

| Field | Value |
| --- | --- |
| npm package | `opencli-plugin-hello` |
| version | `1.0.0` |
| opencli plugin name (alias) | `hello` |
| command | `opencli hello hello` |
| source directory | `scripts/desktop-smoke/plugins/opencli-plugin-hello/` |

## Install

```bash
opencli plugin install opencli-plugin-hello
opencli plugin list
opencli hello hello
```

`opencli plugin list` prints the plugin name, its version and its commands, for example:

```
  hello @1.0.0 — Minimal first-party opencli plugin used as the desktop smoke install target (hello)
```

## Layout

| File | Purpose |
| --- | --- |
| `opencli-plugin.json` | opencli manifest: plugin name `hello`, version `1.0.0`, metadata |
| `hello.js` | the single command; opencli scans the plugin root flat for `<command>.js` |
| `package.json` | npm metadata, `files` whitelist, opencli peer dependency |
| `LICENSE` | Apache-2.0 |

The command imports the registration API from the host:

```js
import { cli, Strategy } from '@jackwener/opencli/registry';
```

`@jackwener/opencli` is an **optional** peer dependency. opencli symlinks its own copy
into the installed plugin, so nothing has to be fetched at install time.

## Releasing

The package publishes to the public npm registry. `publishConfig` pins both the registry
and the access level, so the release command works even on a machine whose default npm
registry is a mirror:

```bash
cd scripts/desktop-smoke/plugins/opencli-plugin-hello
npm publish --access public
```

Before the first publish, confirm the name is still free: `npm view opencli-plugin-hello`.

Release checklist:

1. Bump `version` in **both** `package.json` and `opencli-plugin.json` — they must match.
2. `npm pack --dry-run` and check the file list: `opencli-plugin.json`, `hello.js`,
   `README.md`, `LICENSE`, `package.json`. No `node_modules/`, no lockfile.
3. `npm publish --access public`.
4. `npm view opencli-plugin-hello version` — must print the version you just published.
5. Re-run the desktop smoke test; the E2E installs the bare package name, so it picks up
   the new version automatically.

A version that was never published makes the desktop E2E red: the market installs from
the registry, and a missing package is an installation failure, not a skipped step.

## Local development

opencli can install this directory directly, which symlinks it into the plugins directory
instead of copying it:

```bash
opencli plugin install "$PWD/scripts/desktop-smoke/plugins/opencli-plugin-hello"
```

That is a development shortcut only. It writes into the real opencli home, so do not use
it in CI — and to keep an isolated check isolated, point `DSH_WORKBENCH_HOME` at a
throwaway directory instead (see `packages/adapter-runtime/bin/opencli-isolated.mjs`).

## License

Apache-2.0.
