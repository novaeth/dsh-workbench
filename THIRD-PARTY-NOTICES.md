# Third-party notices

## Browser extension vendored from `jackwener/opencli`

`packages/core/vendor/browser-extension/` is an unmodified copy of
`opencli-extension-v1.0.27.zip` from
<https://github.com/jackwener/opencli/releases/tag/v2.0.3>. It ships with the
workbench so the extension can be loaded from disk when the Chrome Web Store
and GitHub releases are unreachable. `scripts/opencli-extension.lock.json`
records the upstream URL and the zip's SHA-256; refresh it with
`node scripts/sync-opencli-extension.mjs`.

It is licensed under the Apache License 2.0 (see
`packages/core/vendor/browser-extension/LICENSE`).

```text
Copyright the opencli authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## Skills vendored from `mattpocock/skills`

The directories under `.agents/skills/` other than `wording/` are vendored
copies of the skills in
<https://github.com/mattpocock/skills>. `skills-lock.json` records the source
path and the content hash of each one.

They are licensed under the MIT License:

```text
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Runtime and development dependencies

All npm dependencies are declared in the `package.json` files and resolved by
`pnpm-lock.yaml`; their licenses are listed in their own packages under
`node_modules/`. No dependency source is vendored into this repository.

## Assets

The UI uses icons and design tokens provided at runtime by
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). No dsh
asset is copied into this repository.
