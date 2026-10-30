# 工单：本地 markdown（私有仓）

本仓的 spec 与工单是 markdown 文件，住在私有仓（单独 clone 到 `private-docs/`，不入库）的
`private-docs/.scratch/` 下。公开仓不碰它们；没有私有仓权限时就做不了，先问用户，
不要往仓根另起一个 `.scratch/`。

## 约定

- 一个特性一个目录：`private-docs/.scratch/<feature-slug>/`
- spec：`private-docs/.scratch/<feature-slug>/spec.md`
- 实施工单一条一个文件：`private-docs/.scratch/<feature-slug>/issues/<NN>-<slug>.md`，
  从 `01` 编号，**不要**合成一个 tickets 文件
- 分诊状态写在文件靠上的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与对话追加到文件底部 `## Comments` 标题下

## 技能说「发布到工单系统」时

在 `private-docs/.scratch/<feature-slug>/` 下新建文件（目录不存在就建）。

## 技能说「取回相关工单」时

读那个路径的文件；用户通常直接给路径或编号。

## Wayfinding 操作

- **Map**：`private-docs/.scratch/<effort>/map.md`（Notes / Decisions-so-far / Fog 正文）
- **子工单**：`private-docs/.scratch/<effort>/issues/NN-<slug>.md`；`Type:` 行记
  `research` / `prototype` / `grilling` / `task`，`Status:` 行记 `claimed` / `resolved`
- **阻塞**：靠上的 `Blocked by: NN, NN`；列出的文件都 `resolved` 才算解锁
- **Frontier**：扫 `issues/` 里没做完、没被阻塞、没人认领的，按编号先到先得
- **认领**：写 `Status: claimed` 并落盘，再动手
- **收尾**：`## Answer` 下追加答案，写 `Status: resolved`，再往 `map.md` 的 Decisions-so-far 追加指针
