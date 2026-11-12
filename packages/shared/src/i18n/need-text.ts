export const zhNeedText = {
  'env.need.bin.missing': '这台机器上缺命令',
  'env.need.bin.hint': '请先把这条命令加入 PATH，然后重试。',
  'env.need.extension.missing': '这个模块需要的插件未安装',
  'env.need.extension.outdated': '这个模块需要的插件版本过旧',
  'env.need.extension.hint': '安装或升级完成后点击重试，不影响其他模块。',
  'env.need.lib.missing': '这个模块需要的共用依赖未安装',
  'env.need.lib.outdated': '这个模块需要的共用依赖版本过旧',
  'env.need.lib.unsatisfied': '这个模块需要的共用依赖版本不匹配',
  'env.need.lib.hint': '请按下面的命令安装，然后重试。',
  'env.need.env.missing': '这个模块需要的环境变量未设置',
  'env.need.env.hint': '请设置这个变量后重启工作台。它的值不会在任何界面显示。',
} as const;

export const enNeedText = {
  'env.need.bin.missing': 'A command is missing on this machine',
  'env.need.bin.hint': 'Add that command to PATH first, then retry.',
  'env.need.extension.missing': 'A plugin this module needs is not installed',
  'env.need.extension.outdated': 'A plugin this module needs is out of date',
  'env.need.extension.hint': 'After installation or upgrade, click Retry; other modules are unaffected.',
  'env.need.lib.missing': 'A shared dependency this module needs is not installed',
  'env.need.lib.outdated': 'A shared dependency this module needs is out of date',
  'env.need.lib.unsatisfied': 'A shared dependency this module needs is at the wrong version',
  'env.need.lib.hint': 'Install it with the command below, then retry.',
  'env.need.env.missing': 'An environment variable this module needs is not set',
  'env.need.env.hint': 'Set this variable and restart the workbench. Its value is never shown in any interface.',
} as const;
