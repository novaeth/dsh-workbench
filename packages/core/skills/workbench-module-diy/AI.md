# AI：要模型就用 `deps.ai`

模块需要模型给出判断时，只有这一个入口。不要直接使用 `ctx.get('llm')`，也不要自己拼内容块或保存图片——
这些工作由宿主完成（`ctx.get('llm')` 仍然可用，属于应急入口，不是推荐路径）。

## 1 三个动词

```ts
const text = await deps.ai.ask({ prompt: '说一句' });

const verdict = await deps.ai.askJson({
  prompt: reviewPrompt,
  schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
});

const rich = await deps.ai.askRich({ prompt: 'x' });   // + usage / model / elapsedMs
```

- 除 `prompt` 外**全部可选**：新增字段不会破坏调用方。
- `askJson` 保证返回对象：schema 的紧凑描述会附在提示词末尾，先解析、再校验，不合格**自动重试一次**，
  仍不合格抛 `schema-mismatch`（`details.raw` 里有原始输出）。
- 模型默认使用用户在界面上选中的那个；需要覆盖时传 `model: { provider, model }`。

## 2 图片：直接传入，不要自行编码

```ts
await deps.ai.askJson({
  prompt,
  images: ['/tmp/page1.jpg', 'data:image/jpeg;base64,...', bytes],
  schema,
});
```

三种写法都可以：绝对路径、data URL、`Uint8Array`。宿主会通过 `saveImage` 将其保存为持久附件，再送入模型；
模块**不会接触**附件引用这类内核类型。

⚠️ 不要按 OpenAI 的 `image_url` 自行拼内容块——dsh 的适配器只认 `{ type: 'image', attachment }`，
其余内容块会被**静默丢弃**，模型会回答“无法查看图片”，看起来像模型能力不足。

先问能力再降级：

```ts
if (!deps.ai.supports('images')) return reject('请人工核对扫描件');
```

`supports('images')` 只回答「这一份运行时能不能送图」（有没有附件服务），不回答「选中的模型是否支持图片」——
dsh 没有可查询的接口。模型不支持图片时，只有调用后才知道：可能报 `provider`，也可能只是在回答里说明看不到图。

## 3 长任务里的模型步骤

```ts
const runs = deps.longTasks.create({
  key: 'myunit/batch',
  view: (snapshot) => ({ ... }),
  run: async ({ payload, onStep, signal }) => {
    onStep({ kind: 'info', text: '模型初审' });
    const got = await deps.ai.askJson({ prompt, images, schema, signal });
    return { ok: true, got };
  },
});
```

`signal` 会一路传递到模型调用：用户点击停止时，模型调用立即中止（错误码 `aborted`）。需要显示进度时传入 `onStep`。

## 4 流程里的模型步骤

```ts
{
  id: 'review',
  title: '初审',
  ai: {
    prompt: { $ref: 'steps.fetch' },
    images: { $ref: 'steps.pages' },     // 求值成字符串数组
    schema: { type: 'object', properties: { verdict: { type: 'string' } } },
  },
}
```

- 结果进 `steps.<id>`；给 `schema` 得对象，否则得文本。
- `check` 会在「这一份运行时没有模型」时**在开始运行前**拒绝，不会运行到中途才失败。
- 流程里的字段与 `AiRequest` 同名：`prompt` / `images` / `schema` / `temperature` / `timeoutMs`
  （前两个用 `FlowValue` 求值），模型覆盖写成 `provider` / `model` 两个字符串。

## 5 agent（需要工具时使用）

```ts
await deps.ai.agent({
  prompt: '查一下这份合同的对赌条款',
  agent: {
    tools: { allow: ['read', 'grep'], deny: ['shell'] },
    maxTurns: 4,                     // 现在会明确报 unsupported-option
  },
});
```

- 开销远高于 `ask`：需要启动子 agent，带工具与独立的上下文。**能用 `ask` 就不要用 `agent`。**
- `tools.provide` 可以临时提供自己的函数（内部是一个桥接工具，调用结束后即回收）。
- `budget: { ms }` 超时后**确实中止**并报 `budget-exceeded`；`budget.tokens` 目前报 `unsupported-option`。
- 带 `schema` 时返回的是该对象的 JSON 文本：结论不符合 schema 直接报 `schema-mismatch`，
  不会把文本和结构化值混在一起又不报错。需要对象本身、不想多一层 JSON 文本时，使用 `askJson`。
- 也能带图片：`images` 的三种给法与 `ask` 相同；图片先存成附件，再交给子 agent。
- 还没实现的配置（`maxTurns` / `maxToolCalls` / `onTool` / `context` / `delivery` / `approval` /
  `session`）一律**明确报 `unsupported-option`**，不会装作生效。

## 6 错误码

`no-model` / `unsupported-input` / `unsupported-option` / `schema-mismatch` / `aborted` /
`timeout` / `provider` / `budget-exceeded`。

码表只增不删：**认不出的码按失败处理**，不要当作成功；新信息都在 `details` 里。

## 7 测试

不要伪造 `ctx`：把 `deps.ai` 换成假实现即可（它本身就是一个端口）。

```ts
const ai: AiPort = {
  version: 1,
  supports: () => true,
  registerAdapter: () => () => {},
  ask: async () => '好',
  askRich: async () => ({ text: '好' }),
  askJson: async () => ({ ok: true }),
  agent: async () => '好',
};
```

替换这一层的实现时，按仓库里的契约测试验收：`packages/shared/src/host/ai/__tests__/contract.test.ts`
（它不在公共入口导出）。
