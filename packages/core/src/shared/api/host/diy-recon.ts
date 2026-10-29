export interface ReconArg {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly value: string;
  readonly help: string;
}

export interface ReconCommand {
  readonly command: string;
  readonly site: string;
  readonly name: string;
  readonly domain: string;
  readonly description: string;
  readonly access: string;
  readonly strategy: string;
  readonly browser: boolean;
  readonly example: string;
  readonly columns: readonly string[];
  readonly args: readonly ReconArg[];
  readonly preview: boolean;
}

export interface ReconSite {
  readonly site: string;
  readonly domain: string;
  readonly strategy: string;
  readonly browser: boolean;
  readonly commands: readonly ReconCommand[];
}

export interface ReconSurface {
  readonly name: string;
  readonly pluginPrefix: string;
  invoke(site: string, command?: string): string;
  help(site: string): string;
  readonly authorHint?: string;
}

export interface ReconPlugin {
  readonly name: string;
  readonly commands: readonly string[];
}

export interface ReconAnswer {
  readonly keyword: string;
  readonly sites: readonly ReconSite[];
  readonly plugins: readonly ReconPlugin[];
  readonly next: string;
  readonly text: string;
}

const SITE_LIMIT = 6;
const COMMAND_LIMIT = 12;
const SHOWN_LIMIT = 6;
const ARG_LIMIT = 6;
const PREVIEW_ARGS = ['yes', 'dryrun', 'confirm'];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : [];
}

function argsOf(value: unknown): readonly ReconArg[] {
  if (!Array.isArray(value)) return [];
  const out: ReconArg[] = [];
  for (const one of value) {
    if (typeof one !== 'object' || one === null) continue;
    const row = one as Record<string, unknown>;
    const name = text(row['name']);
    if (name === '') continue;
    const fallback = row['default'];
    out.push({
      name,
      type: text(row['type']),
      required: row['required'] === true,
      value: typeof fallback === 'number' || typeof fallback === 'boolean' ? String(fallback) : text(fallback),
      help: text(row['help']),
    });
  }
  return out;
}

export function invocableOf(command: ReconCommand, surface: ReconSurface): string {
  if (command.site === '') return command.command;
  return surface.invoke(command.site, command.name === '' ? undefined : command.name);
}

export function manifestCommandsOf(raw: string): readonly ReconCommand[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const commands: ReconCommand[] = [];
  for (const one of parsed) {
    if (typeof one !== 'object' || one === null) continue;
    const row = one as Record<string, unknown>;
    const declared = text(row['command']);
    const site = text(row['site']) || declared.split('/')[0] || '';
    const name = text(row['name']) || declared.split('/')[1] || '';
    const command = declared === '' ? (site === '' || name === '' ? '' : `${site}/${name}`) : declared;
    if (command === '' || site === '') continue;
    const access = text(row['access']);
    const args = argsOf(row['args']);
    commands.push({
      command,
      site,
      name: name === '' ? command.slice(command.indexOf('/') + 1) : name,
      domain: text(row['domain']).toLowerCase(),
      description: text(row['description']),
      access: access === '' ? 'read' : access,
      strategy: text(row['strategy']).toLowerCase(),
      browser: row['browser'] === true,
      example: text(row['example']),
      columns: stringsOf(row['columns']),
      args,
      preview: args.some((one) => PREVIEW_ARGS.includes(one.name.toLowerCase())),
    });
  }
  return commands;
}

export function pluginNamesOf(entries: readonly string[], prefix: string): readonly string[] {
  return entries
    .filter((one) => one.startsWith(prefix))
    .map((one) => one.slice(prefix.length))
    .filter((one) => one !== '')
    .sort();
}

export function pluginCommandsOf(files: readonly string[]): readonly string[] {
  return files
    .filter((one) => one.endsWith('.js'))
    .map((one) => one.slice(0, -3))
    .filter((one) => one !== 'index' && !one.startsWith('_'))
    .sort();
}

export function hostOf(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') return '';
  try {
    return new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function keywordsOf(keyword: string, url: string): readonly string[] {
  const words = new Set<string>();
  const trimmed = keyword.trim().toLowerCase();
  if (trimmed !== '') words.add(trimmed);
  const host = hostOf(url);
  if (host !== '') words.add(host);
  return [...words];
}

export function scoreOf(command: ReconCommand, word: string): number {
  const site = command.site.toLowerCase();
  const name = command.name.toLowerCase();
  if (word === '') return 0;
  if (site === word) return 100;
  if (site.includes(word)) return 80;
  if (command.domain !== '' && command.domain.includes(word)) return 70;
  if (site.length >= 3 && word.includes(site)) return 45;
  if (name === word) return 65;
  if (name.includes(word)) return 55;
  if (command.command.toLowerCase().includes(word)) return 50;
  if (command.description.toLowerCase().includes(word)) return 30;
  return 0;
}

export function reconOf(
  commands: readonly ReconCommand[],
  plugins: readonly ReconPlugin[],
  keywords: readonly string[],
  surface: ReconSurface,
): ReconAnswer {
  const keyword = keywords[0] ?? '';
  const best = new Map<string, { readonly command: ReconCommand; readonly score: number }>();
  for (const command of commands) {
    let score = 0;
    for (const word of keywords) score = Math.max(score, scoreOf(command, word));
    if (score === 0) continue;
    const current = best.get(command.command);
    if (current === undefined || current.score < score) best.set(command.command, { command, score });
  }

  const grouped = new Map<string, { best: number; rows: Array<{ command: ReconCommand; score: number }> }>();
  for (const entry of best.values()) {
    const group = grouped.get(entry.command.site) ?? { best: 0, rows: [] };
    group.best = Math.max(group.best, entry.score);
    group.rows.push(entry);
    grouped.set(entry.command.site, group);
  }

  const sites: readonly ReconSite[] = [...grouped.entries()]
    .sort((left, right) => right[1].best - left[1].best || left[0].localeCompare(right[0]))
    .slice(0, SITE_LIMIT)
    .map(([site, group]) => {
      const picked = [...group.rows]
        .sort(
          (left, right) =>
            (left.command.access === 'write' ? 1 : 0) - (right.command.access === 'write' ? 1 : 0) ||
            right.score - left.score ||
            left.command.command.localeCompare(right.command.command),
        )
        .slice(0, COMMAND_LIMIT)
        .map((one) => one.command);
      const first = picked[0];
      return {
        site,
        domain: first?.domain ?? '',
        strategy: first?.strategy ?? '',
        browser: first?.browser === true,
        commands: picked,
      };
    });

  const matched = plugins.filter((plugin) => {
    const name = plugin.name.toLowerCase();
    return keywords.some((word) => word !== '' && (name.includes(word) || word.includes(name)));
  });

  const base: ReconAnswer = { keyword, sites, plugins: matched, next: '', text: '' };
  const next = nextOf(base, surface);
  const withNext: ReconAnswer = { ...base, next };
  return { ...withNext, text: textOf(withNext, surface) };
}

export function nextOf(answer: ReconAnswer, surface: ReconSurface): string {
  const site = answer.sites[0];
  if (site !== undefined) {
    const read = site.commands.find((one) => one.access !== 'write');
    const pick = read ?? site.commands[0];
    if (pick === undefined) return `${surface.help(site.site)} 看全部命令`;
    if (read === undefined) {
      return (
        `这台机器上只匹配到写命令：${invocableOf(pick, surface)} —— ` +
        '先 `--help` 看入参；带 `--dryRun` / `--yes` 的先用预览档；' +
        '没有预览档的不许试写（那一次就是真的）。写取证的完整口径见 WRITES.md。'
      );
    }
    const call = pick.example === '' ? invocableOf(pick, surface) : pick.example;
    return `直接复用：${call}（这台机器上就能跑，不用装、不用点头）`;
  }
  const plugin = answer.plugins[0];
  if (plugin !== undefined) {
    return `这台机器另装的插件 ${plugin.name} 里有匹配：${surface.help(plugin.name)} 看全部命令`;
  }
  const author = surface.authorHint === undefined ? '' : `① 给这个站点写 adapter：${surface.authorHint}；`;
  return (
    `这台机器上没有现成的 —— 两条路：${author}` +
    '② 只读一次：workbench_diy_eval / _find 带 read=<地址>（在 workbench-read 上跑，借用户已登录的那扇窗）'
  );
}

function signatureOf(args: readonly ReconArg[]): string {
  const shown = args.slice(0, ARG_LIMIT).map((one) => {
    if (one.required) return `--${one.name}`;
    return one.value === '' ? `--${one.name}` : `--${one.name}=${one.value}`;
  });
  const rest = args.length - shown.length;
  const tail = rest > 0 ? ` …+${String(rest)}` : '';
  return `${shown.join(' ')}${tail}`;
}

function labelOf(command: ReconCommand): string {
  if (command.access !== 'write') return '读';
  return command.preview ? '写（可预览）' : '写（无预览档，一次就是真的）';
}

export function textOf(answer: ReconAnswer, surface: ReconSurface): string {
  const lines: string[] = [];
  if (answer.sites.length > 0) {
    lines.push(`${surface.name} 自带这 ${String(answer.sites.length)} 组能力（不用装、不用点头）：`);
    for (const site of answer.sites) {
      const where = site.domain === '' ? '' : `（${site.domain}）`;
      const chrome = site.browser ? '要用你的 Chrome 登录' : '不用浏览器';
      lines.push(`· ${site.site}${where} · ${site.strategy === '' ? '—' : site.strategy} · ${chrome}`);
      for (const command of site.commands.slice(0, SHOWN_LIMIT)) {
        const what = command.description === '' ? '' : ` —— ${command.description.slice(0, 60)}`;
        const args = command.access === 'write' && command.args.length > 0 ? ` ｜ 入参：${signatureOf(command.args)}` : '';
        lines.push(`    ${labelOf(command)} ${invocableOf(command, surface)}${what}${args}`);
      }
      const rest = site.commands.length - SHOWN_LIMIT;
      if (rest > 0) {
        const writes = site.commands.slice(SHOWN_LIMIT).filter((one) => one.access === 'write').length;
        const tail = writes === 0 ? '' : `（其中写 ${String(writes)} 条）`;
        lines.push(`    … 还有 ${String(rest)} 条${tail}：${surface.help(site.site)}`);
      }
    }
  }
  if (answer.plugins.length > 0) {
    lines.push(
      `这台机器另装的插件里匹配到：${answer.plugins
        .map((one) => `${one.name}（${String(one.commands.length)} 条命令）`)
        .join('、')}`,
    );
  }
  if (answer.sites.length === 0 && answer.plugins.length === 0) {
    lines.push(
      `没匹配到「${answer.keyword}」—— 换英文名或域名再试（例：bilibili、arxiv.org）；` +
        '实在没有就走下面那条。',
    );
  }
  lines.push(answer.next);
  return lines.join('\n');
}
