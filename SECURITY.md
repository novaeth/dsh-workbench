# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability. Use GitHub's private
vulnerability reporting:

<https://github.com/novaeth/dsh-workbench/security/advisories/new>

Include the affected version, the operating system, a minimal reproduction and
the impact you believe it has. We aim to acknowledge a report within 72 hours
and to publish a fix or a mitigation as soon as it is ready.

## Scope

In scope:

- the workbench shell (`@dsh-workbench/core`, `packages/workbench`)
- the shared contracts and helpers (`@dsh-workbench/shared`)
- the module tooling (`@dsh-workbench/module-tools`)
- the installer and the profile seeding scripts

Out of scope:

- vulnerabilities in DeepSeek Harness itself — report them to the
  [dsh project](https://github.com/deepseek-ai/deepseek-harness)
- vulnerabilities in third-party opencli plugins or in the sites they read
- findings that require the attacker to already control the user's account,
  browser profile or local files

## Secrets

The repository must not contain credentials, private registry URLs, session
cookies, internal hostnames or personal absolute paths. If you find one, treat
it as a security report rather than a documentation bug.

`check:markers` scans the packages that would be published. Organisation
specific words are supplied at check time through `DSH_WB_INTERNAL_MARKERS`
(see [`packages/module-tools/README.md`](packages/module-tools/README.md)), so
the public source tree does not carry an internal deny-list.

## Supported versions

Only the latest published minor line receives security fixes.
