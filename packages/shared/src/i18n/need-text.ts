export const zhNeedText = {
  'env.need.bin.missing': '这台机器上缺命令',
  'env.need.bin.hint': '先把这条命令装进 PATH，再重试。',
  'env.need.extension.missing': '这个模块要的插件没装',
  'env.need.extension.outdated': '这个模块要的插件版本旧了',
  'env.need.extension.hint': '装好或升级之后点重试；不影响其它模块。',
  'env.need.lib.missing': '这个模块要的共用依赖没装',
  'env.need.lib.outdated': '这个模块要的共用依赖版本旧了',
  'env.need.lib.unsatisfied': '这个模块要的共用依赖版本不对',
  'env.need.lib.hint': '按下面的命令装好，再重试。',
  'env.need.env.missing': '这个模块要的环境变量没设',
  'env.need.env.hint': '设好这个变量后重启工作台；它的值不会被任何界面回显。',
} as const;

export const enNeedText = {
  'env.need.bin.missing': 'A command is missing on this machine',
  'env.need.bin.hint': 'Put that command on PATH, then retry.',
  'env.need.extension.missing': 'A plugin this module needs is not installed',
  'env.need.extension.outdated': 'A plugin this module needs is out of date',
  'env.need.extension.hint': 'Install or upgrade it, then retry; other modules are unaffected.',
  'env.need.lib.missing': 'A shared dependency this module needs is not installed',
  'env.need.lib.outdated': 'A shared dependency this module needs is out of date',
  'env.need.lib.unsatisfied': 'A shared dependency is at the wrong version',
  'env.need.lib.hint': 'Run the command below, then retry.',
  'env.need.env.missing': 'An environment variable this module needs is not set',
  'env.need.env.hint': 'Set it and restart the workbench; its value is never shown in any UI.',
} as const;
