export function parseBlocks(text) {
  const lines = text.split('\n');
  const starts = [];
  lines.forEach((line, index) => {
    if (/^- /.test(line) || line === '-') starts.push(index);
  });
  const blocks = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : lines.length;
    let end = to;
    while (end > from && (lines[end - 1] ?? '').trim() === '') end -= 1;
    const body = lines.slice(from, end).join('\n');
    if (body.trim() === '') continue;
    const first = body.split('\n')[0] ?? '';
    const id = /^- id:[ \t]*"?([^"\s#]+)/.exec(first)?.[1];
    const insert = id === undefined && /^- insert:[ \t]*$/.test(first);
    const nested = body
      .split('\n')
      .map((line) => /^[ \t]+-[ \t]*id:[ \t]*"?([^"\s#]+)/.exec(line)?.[1])
      .filter(Boolean);
    const key = id !== undefined ? `id:${id}` : insert ? `insert:${nested.join(', ')}` : `block:${String(i)}`;
    blocks.push({
      key,
      id: id ?? nested.join(', ') ?? key,
      insert,
      body,
      lineStart: from,
      lineEnd: end,
    });
  }
  return blocks;
}

export function removeBlocks(text, predicate) {
  const blocks = parseBlocks(text).filter(predicate);
  if (blocks.length === 0) return text;
  const lines = text.split('\n');
  const drop = new Set();
  for (const block of blocks) {
    let end = block.lineEnd;
    for (let i = block.lineEnd; i < lines.length; i += 1) {
      if ((lines[i] ?? '').trim() !== '') break;
      drop.add(i);
      end = i + 1;
    }
    for (let i = block.lineStart; i < end; i += 1) drop.add(i);
  }
  const kept = lines.filter((_, index) => !drop.has(index));
  return `${kept.join('\n').replace(/\s+$/, '')}\n`;
}

export function appendBlocks(text, body) {
  const stripped = text
    .split('\n')
    .filter((line) => line.trim() !== '[]')
    .join('\n')
    .replace(/\s+$/, '');
  return `${stripped}\n\n${body.replace(/\s+$/, '')}\n`;
}
