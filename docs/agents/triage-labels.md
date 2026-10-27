# 分诊标签

技能用五个固定的分诊角色说话；这张表把它们映射到本仓实际用的字符串。
本地 markdown 工单里「标签」就是工单文件靠上的 `Status:` 行。

| 技能里的角色      | 本仓的写法        | 含义                         |
| ----------------- | ----------------- | ---------------------------- |
| `needs-triage`    | `needs-triage`    | 维护者还没看                 |
| `needs-info`      | `needs-info`      | 等报告者补信息               |
| `ready-for-agent` | `ready-for-agent` | 写清楚了，可以交给 AFK agent |
| `ready-for-human` | `ready-for-human` | 要人来实施                   |
| `wontfix`         | `wontfix`         | 不做                         |

技能提到某个角色（比如「打上 AFK-ready 标签」）时，用右列那个字符串。
改右列就能对上你实际在用的词。
