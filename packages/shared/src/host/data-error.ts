export class WorkbenchDataError extends Error {
  readonly code: string;
  readonly detail?: string;
  readonly hint?: string;
  readonly project?: unknown;
  readonly helpUrl?: string;

  constructor(
    code: string,
    message: string,
    extra: { detail?: string; hint?: string; project?: unknown; helpUrl?: string } = {},
  ) {
    super(message);
    this.name = 'WorkbenchDataError';
    this.code = code;
    if (extra.detail !== undefined) this.detail = extra.detail;
    if (extra.hint !== undefined) this.hint = extra.hint;
    if (extra.project !== undefined) this.project = extra.project;
    if (extra.helpUrl !== undefined) this.helpUrl = extra.helpUrl;
  }
}
