import { describe, expect, it } from 'vitest';
import {
  hostOf,
  keywordsOf,
  manifestCommandsOf,
  nextOf,
  pluginCommandsOf,
  pluginNamesOf,
  reconOf,
  scoreOf,
  type ReconCommand,
  type ReconPlugin,
  type ReconSurface,
} from '../diy-recon';

const SURFACE: ReconSurface = {
  name: 'opencli',
  pluginPrefix: 'opencli-plugin-',
  invoke: (site, command) => (command === undefined ? `opencli ${site}` : `opencli ${site} ${command}`),
  help: (site) => `opencli ${site} --help`,
  authorHint: 'opencli skills read opencli-adapter-author',
};

const MANIFEST = JSON.stringify([
  {
    command: 'bilibili/search',
    site: 'bilibili',
    name: 'search',
    domain: 'bilibili.com',
    description: 'Search videos on Bilibili',
    access: 'read',
    strategy: 'cookie',
    browser: true,
    example: 'opencli bilibili search -f yaml',
    columns: ['title', 'url'],
  },
  {
    command: 'bilibili/danmaku',
    site: 'bilibili',
    name: 'danmaku',
    domain: 'bilibili.com',
    description: 'Post a danmaku',
    access: 'write',
    strategy: 'cookie',
    browser: true,
    example: '',
    columns: [],
    args: [
      { name: 'text', type: 'string', required: true, help: '弹幕内容' },
      { name: 'dryRun', type: 'boolean', default: false, help: '只预览不提交' },
    ],
  },
  {
    command: 'inventory/publish',
    site: 'inventory',
    name: 'publish',
    domain: 'inventory.example',
    description: '发布 Inventory 应用',
    access: 'write',
    strategy: 'cookie',
    browser: true,
    example: '',
    columns: ['task_id'],
    args: [
      { name: 'env_name', type: 'string', required: true, help: '环境名称 ID' },
      { name: 'release_mode', type: 'string', default: '1', help: '发布模式: 1=普通 2=分批' },
    ],
  },
  {
    command: 'arxiv/search',
    site: 'arxiv',
    name: 'search',
    domain: 'arxiv.org',
    description: 'Search papers',
    access: 'read',
    strategy: 'public',
    browser: false,
    example: 'opencli arxiv search -f yaml',
    columns: ['title'],
  },
  { command: '', site: 'nope' },
  'junk',
  null,
]);

const command = (over: Partial<ReconCommand>): ReconCommand => ({
  command: 'x/y',
  site: 'x',
  name: 'y',
  domain: '',
  description: '',
  access: 'read',
  strategy: '',
  browser: false,
  example: '',
  columns: [],
  args: [],
  preview: false,
  ...over,
});

describe('读那份自带目录', () => {
  it('挑出要的字段，坏行与坏 JSON 都不炸', () => {
    const commands = manifestCommandsOf(MANIFEST);
    expect(commands).toHaveLength(4);
    expect(commands[0]?.command).toBe('bilibili/search');
    expect(commands[0]?.browser).toBe(true);
    expect(commands[0]?.columns).toEqual(['title', 'url']);
    expect(commands[1]?.access).toBe('write');
    expect(manifestCommandsOf('not json')).toEqual([]);
    expect(manifestCommandsOf('{"a":1}')).toEqual([]);
  });

  it('★ 入参（必填 / 默认）与预览档一起带出来：写命令不用先真写一次才知道怎么调', () => {
    const commands = manifestCommandsOf(MANIFEST);
    const danmaku = commands[1];
    expect(danmaku?.args.map((one) => one.name)).toEqual(['text', 'dryRun']);
    expect(danmaku?.args[0]?.required).toBe(true);
    expect(danmaku?.args[1]?.value).toBe('false');
    expect(danmaku?.preview).toBe(true);
    const publish = commands.find((one) => one.site === 'inventory');
    expect(publish?.site).toBe('inventory');
    expect(publish?.preview).toBe(false);
    expect(publish?.args[1]?.value).toBe('1');
    expect(publish?.columns).toEqual(['task_id']);
    expect(commands[0]?.preview).toBe(false);
  });

  it('条目没写 command 时用 site/name 拼（隔离运行时那份就是这样），只写 command 时反推 site', () => {
    const bare = manifestCommandsOf(
      JSON.stringify([
        { site: 'bilibili', name: 'search', access: 'read' },
        { command: 'arxiv/search' },
      ]),
    );
    expect(bare.map((one) => one.command)).toEqual(['bilibili/search', 'arxiv/search']);
    expect(bare[0]?.site).toBe('bilibili');
    expect(bare[1]?.site).toBe('arxiv');
    expect(bare[1]?.name).toBe('search');
  });

  it('没写 access 的当只读（宁可说成只读，也别把写当成只读）', () => {
    expect(manifestCommandsOf(JSON.stringify([{ command: 'a/b', site: 'a' }]))[0]?.access).toBe('read');
  });

  it('插件目录：名字去掉前缀、命令取 .js 去掉 index/_ 开头', () => {
    expect(pluginNamesOf(['opencli-plugin-inventory', 'dayjs', 'opencli-plugin-demo'], 'opencli-plugin-')).toEqual([
      'demo',
      'inventory',
    ]);
    expect(pluginCommandsOf(['envs.js', 'builds.js', 'index.js', '_shared.js', 'readme.md'])).toEqual([
      'builds',
      'envs',
    ]);
  });
});

describe('认词', () => {
  it('域名从 URL 里取，去掉 www；关键词自带大小写无关', () => {
    expect(hostOf('https://www.bilibili.com/video/BV1')).toBe('bilibili.com');
    expect(hostOf('arxiv.org')).toBe('');
    expect(keywordsOf('BiliBili', 'https://www.arxiv.org/list')).toEqual(['bilibili', 'arxiv.org']);
    expect(keywordsOf('', '')).toEqual([]);
  });

  it('打分：站点名精确 > 站点名包含 > 域名 > 命令名 > 描述', () => {
    const word = 'bilibili';
    expect(scoreOf(command({ site: 'bilibili', name: 'x', command: 'bilibili/x' }), word)).toBe(100);
    expect(scoreOf(command({ site: 'bilibili-app', name: 'x', command: 'bilibili-app/x' }), word)).toBe(80);
    expect(
      scoreOf(command({ site: 'video', name: 'x', command: 'video/x', domain: 'bilibili.com' }), word),
    ).toBe(70);
    expect(scoreOf(command({ site: 'other', name: 'bilibili', command: 'other/bilibili' }), word)).toBe(65);
    expect(
      scoreOf(command({ site: 'other', name: 'x', command: 'other/x', description: 'from bilibili' }), word),
    ).toBe(30);
    expect(scoreOf(command({ site: 'other', name: 'x', command: 'other/x' }), word)).toBe(0);
    expect(scoreOf(command({ site: 'bilibili' }), '')).toBe(0);
  });

  it('目录里大多数条目没有 domain：用户给网址时要能反过来认出来', () => {
    const arxiv = command({ site: 'arxiv', name: 'author', command: 'arxiv/author', domain: '' });
    expect(scoreOf(arxiv, 'arxiv.org')).toBe(45);
    expect(scoreOf(arxiv, 'www.arxiv.org')).toBe(45);
    expect(scoreOf(command({ site: 'x', name: 'y', command: 'x/y' }), 'xxyy')).toBe(0);
  });

});

describe('侦察结果', () => {
  const commands = manifestCommandsOf(MANIFEST);

  it('按站点归组，只读排在写前面，并给出可直接照抄的那条命令', () => {
    const answer = reconOf(commands, [], ['bilibili'], SURFACE);
    expect(answer.sites).toHaveLength(1);
    expect(answer.sites[0]?.site).toBe('bilibili');
    expect(answer.sites[0]?.commands.map((one) => one.name)).toEqual(['search', 'danmaku']);
    expect(answer.sites[0]?.browser).toBe(true);
    expect(answer.sites[0]?.strategy).toBe('cookie');
    expect(answer.next).toContain('opencli bilibili search -f yaml');
    expect(answer.text).toContain('opencli bilibili search -f yaml');
    expect(answer.text).toContain('要用你的 Chrome');
    expect(answer.text).toContain('不用装、不用点头');
  });

  it('用域名当关键词也能认出来（用户给的可能是个网址）', () => {
    const answer = reconOf(commands, [], keywordsOf('', 'https://www.arxiv.org/abs/1'), SURFACE);
    expect(answer.sites.map((one) => one.site)).toEqual(['arxiv']);
    expect(answer.sites[0]?.browser).toBe(false);
    expect(answer.next).toContain('不用装');
  });

  it('自带里没有、但本机装了插件 → 指向已装的插件', () => {
    const plugins: readonly ReconPlugin[] = [{ name: 'inventory', commands: ['envs', 'builds'] }];
    const answer = reconOf([], plugins, ['inventory'], SURFACE);
    expect(answer.sites).toEqual([]);
    expect(answer.plugins.map((one) => one.name)).toEqual(['inventory']);
    expect(answer.next).toContain('opencli inventory --help');
    expect(answer.text).toContain('inventory（2 条命令）');
    expect(answer.text).toContain('opencli inventory --help');
  });

  it('什么都没有 → 老实说没有，并把两条路给出来', () => {
    const answer = reconOf([], [], ['某内部系统'], SURFACE);
    expect(answer.sites).toEqual([]);
    expect(answer.plugins).toEqual([]);
    expect(answer.text).toContain('没匹配到');
    expect(answer.next).toContain('opencli-adapter-author');
    expect(answer.text).toContain('opencli-adapter-author');
    expect(answer.text).toContain('read=<地址>');
    expect(answer.next).toContain('read=<地址>');
    expect(nextOf(answer, SURFACE)).toBe(answer.next);
  });

  it('同一站点最多列 12 条、最多 6 个站点（别把整份目录倒给用户）', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      command({ command: `many/c${String(index)}`, site: 'many', name: `c${String(index)}` }),
    );
    const sites = Array.from({ length: 9 }, (_, index) =>
      command({ command: `s${String(index)}/c`, site: `s${String(index)}`, name: 'c' }),
    );
    const answer = reconOf([...many, ...sites], [], ['many', 's'], SURFACE);
    expect(answer.sites.length).toBeLessThanOrEqual(6);
    expect(answer.sites.find((one) => one.site === 'many')?.commands.length).toBeLessThanOrEqual(12);
    expect(answer.text).toContain('还有 6 条');
  });
});

describe('写通道的取证面', () => {
  const commands = manifestCommandsOf(MANIFEST);

  it('★ 文本给能照抄的空格形式，不给斜杠形式（opencli 12306/login 是条不存在的命令）', () => {
    const answer = reconOf(commands, [], ['bilibili'], SURFACE);
    expect(answer.text).toContain('opencli bilibili danmaku');
    expect(answer.text).not.toContain('opencli bilibili/');
    expect(answer.next).not.toContain('opencli bilibili/');
  });

  it('★ 写命令标出预览档并附入参签名；没有预览档的就直说"一次就是真的"', () => {
    const withPreview = reconOf(commands, [], ['bilibili'], SURFACE);
    expect(withPreview.text).toContain('写（可预览）');
    expect(withPreview.text).toContain('入参：--text --dryRun=false');
    const noPreview = reconOf(commands, [], ['inventory'], SURFACE);
    expect(noPreview.text).toContain('写（无预览档，一次就是真的）');
    expect(noPreview.text).toContain('入参：--env_name --release_mode=1');
  });

  it('★ 只匹配到写命令时，「直接复用」换成写通道的指引', () => {
    const answer = reconOf(commands, [], ['inventory'], SURFACE);
    expect(answer.next).toContain('opencli inventory publish');
    expect(answer.next).toContain('--dryRun');
    expect(answer.next).toContain('不许试写');
  });

  it('★ 有读命令时仍优先给读那条（读不用排队、也不用点头）', () => {
    const answer = reconOf(commands, [], ['bilibili'], SURFACE);
    expect(answer.next).toContain('opencli bilibili search -f yaml');
  });

  it('★ 被截掉的那几条里有写命令时，那句"还有 N 条"要说出来（别把写藏起来）', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      command({
        command: `many/c${String(index)}`,
        site: 'many',
        name: `c${String(index)}`,
        access: index >= 6 ? 'write' : 'read',
      }),
    );
    const answer = reconOf(many, [], ['many'], SURFACE);
    expect(answer.text).toContain('… 还有 2 条（其中写 2 条）：opencli many --help');
  });
});
