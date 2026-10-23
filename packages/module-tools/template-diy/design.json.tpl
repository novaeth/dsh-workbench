{
  "unit": "__UNIT__",
  "name": "__NAME__",
  "oneLine": "__DESC__",
  "panel": [
    { "cell": "这个目录占了多少空间", "conclusion": "该不该清、谁在占", "link": "" }
  ],
  "states": [
    { "key": "idle", "sees": "「先打开一个项目」，不发请求", "canDo": "去左栏开一个项目", "agentCan": "说清「要先有项目」" },
    { "key": "loading", "sees": "「正在读目录」", "canDo": "等", "agentCan": "——" },
    { "key": "ready", "sees": "路径 + N 文件 / M 目录 / 总字节 + 最大的几个", "canDo": "刷新", "agentCan": "读一次这一格（联动见表 3）" },
    { "key": "empty", "sees": "「这个目录是空的」", "canDo": "换一个目录", "agentCan": "同上" },
    { "key": "unreadable", "sees": "「读不到这个目录」+ 宿主的原话", "canDo": "重试 / 改路径", "agentCan": "同上" }
  ],
  "config": [
    { "persistence": "view", "key": "列几个最大的文件", "watches": "明细长度", "default": "5", "valuesFrom": "1..50", "wrongChoice": "夹回范围内，不报错" }
  ],
  "capabilities": [],
  "linkage": [
    { "who": "agent 读一次这一格", "when": "读完立刻", "whatChanges": "本单元那条只读投影（__UNIT__/overview），只带这个目录", "userSees": "那一格变成 agent 看到的那份数" },
    { "who": "agent 只预览 / 只说了句话", "when": "不动", "whatChanges": "——", "userSees": "面板没变" },
    { "who": "用户自己按刷新", "when": "立刻", "whatChanges": "同上", "userSees": "转一下，然后是新值" }
  ],
  "datasource": {
    "read": "本机目录本身：readdirSync(path) + statSync（不走网络、不要凭据）",
    "params": "path 必填（卡片给当前项目）；limit 默认 5，夹在 1..50",
    "credentials": "不需要",
    "notLoggedIn": "不适用（本机读盘，没有登录这回事）",
    "timeout": "路径不存在 / 没权限 / 不是目录 → HTTP 200 + ok:false，码 overview-unreadable",
    "probeCommand": "node -e \"require('node:fs').readdirSync(process.cwd())\""
  },
  "writes": [],
  "acceptance": [
    { "step": "打开面板 → 看到这张卡 → 路径 + N 文件 / M 目录 / 总字节", "checked": false },
    { "step": "换一个空目录 → 看到「这个目录是空的」（不是空白、也不是 0）", "checked": false },
    { "step": "把 limit 调成 50 → 明细变长；调成 0 → 夹回 1，不报错", "checked": false },
    { "step": "让 agent 读一次这一格 → 面板那一格变成同一份数", "checked": false }
  ]
}
