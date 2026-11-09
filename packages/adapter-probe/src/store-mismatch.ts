const STORE_MISMATCH_CODES = [
  'ERR_PNPM_UNEXPECTED_STORE',
  'ERR_PNPM_MODULES_BREAKING_CHANGE',
  'ERR_PNPM_ABORTED_REMOVE_MODULES_DIR',
];

export function storeMismatchIn(detail: string): boolean {
  return STORE_MISMATCH_CODES.some((code) => detail.includes(code));
}
