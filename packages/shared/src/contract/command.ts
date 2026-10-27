export interface CommandFile {
  readonly content: string;
  readonly suffix?: string | undefined;
}

export interface CommandRequest {
  readonly argv: readonly string[];
  readonly timeoutMs?: number | undefined;
  readonly cwd?: string | undefined;
  readonly files?: readonly CommandFile[] | undefined;
  readonly appendFileArgs?: string | undefined;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly filePaths: readonly string[];
  readonly error?: string | undefined;
}

export interface CommandReader {
  run(request: CommandRequest): Promise<CommandResult>;
}
