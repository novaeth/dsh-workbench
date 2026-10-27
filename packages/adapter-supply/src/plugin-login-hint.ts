const NOT_LOGGED_IN = /未登录|请先登录|not logged in/i;

function propertyOf(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null
    ? (error as Readonly<Record<string, unknown>>)[key]
    : undefined;
}

function helpUrlOfError(error: unknown): string | undefined {
  const raw = propertyOf(error, 'helpUrl');
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isAuthFailure(error: unknown, message: string): boolean {
  if (NOT_LOGGED_IN.test(message)) return true;
  return propertyOf(error, 'code') === 'auth-required';
}

export function loginUrlOfDomain(domain: string | undefined): string | undefined {
  const bare = (domain ?? '').trim().replace(/\/+$/, '');
  if (bare === '' || bare.includes('*')) return undefined;
  return /^https?:\/\//.test(bare) ? bare : `https://${bare}/login`;
}

export function pluginLoginHint(error: unknown, domain: string | undefined): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!isAuthFailure(error, message)) return message;
  const url = helpUrlOfError(error) ?? loginUrlOfDomain(domain);
  if (url !== undefined) return `${message}\n在 opencli 那扇浏览器窗里打开 ${url} 登一次，然后重试。`;
  return `${message}\n在 opencli 那扇浏览器窗里登录这个站点（插件没给出具体地址，工作台拼不出来）—— 或跑一次工作台的体检/预热，然后重试。`;
}
