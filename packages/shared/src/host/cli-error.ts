export interface CliErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly help?: string;
  readonly exitCode?: number;
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function joinBlock(previous: string, line: string, fold: boolean): string {
  if (previous === '') return line;
  return fold ? `${previous} ${line}` : `${previous}\n${line}`;
}

export function parseCliErrorEnvelope(text: string | undefined): CliErrorEnvelope | undefined {
  if (text === undefined || text.trim() === '') return undefined;

  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^error:\s*$/.test(line.trim()) || /^error:\s*\S/.test(line.trim()));
  if (start === -1) return undefined;

  const scalars: Record<string, string> = {};
  let current: string | undefined;
  let block: { readonly key: string; readonly fold: boolean; readonly indent: number } | undefined;
  const errorIndent = lines[start]?.search(/\S/) ?? 0;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    const indent = line.search(/\S/);
    if (block !== undefined && indent > block.indent) {
      scalars[block.key] = joinBlock(scalars[block.key] ?? '', line.trim(), block.fold);
      continue;
    }
    block = undefined;
    if (indent <= errorIndent) break;

    const match = /^\s*(code|message|help|exitCode):\s*(.*)$/.exec(line);
    if (match === null) {
      if (current !== undefined) scalars[current] = `${scalars[current] ?? ''} ${line.trim()}`.trim();
      continue;
    }
    const [, key, value] = match;
    if (key === undefined) continue;
    const raw = (value ?? '').trim();
    const marker = /^([|>])[0-9]*([+-]?)$/.exec(raw);
    if (marker !== null) {
      scalars[key] = '';
      block = { key, fold: marker[1] === '>', indent };
      current = key;
      continue;
    }
    scalars[key] = unquote(raw);
    current = key;
  }

  const code = scalars['code'];
  const message = scalars['message'];
  if (code === undefined || code === '') return undefined;

  const exitCode = scalars['exitCode'];
  return {
    code,
    message: message ?? code,
    ...(scalars['help'] === undefined || scalars['help'] === '' ? {} : { help: scalars['help'] }),
    ...(exitCode === undefined || Number.isNaN(Number(exitCode)) ? {} : { exitCode: Number(exitCode) }),
  };
}

export function helpUrlOf(envelope: CliErrorEnvelope): string | undefined {
  const match = /https?:\/\/[^\s"'`]+/.exec(envelope.help ?? '');
  return match?.[0];
}
