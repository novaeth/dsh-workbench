import { UNIT_ID } from './notes';

export const PREF_FILE = 'prefs.json';
export const PREFS_ROUTE = `${UNIT_ID}/prefs`;
export const PREFS_RESOURCE = UNIT_ID;
export const LIMIT_DEFAULT = 5;
export const LIMIT_MIN = 1;
export const LIMIT_MAX = 50;
export const LIMIT_CHOICES = [5, 10, 20] as const;

export interface PrefStore {
  read(name: string): unknown | null;
  write(name: string, value: unknown): void;
  remove(name: string): void;
}

export interface Prefs {
  readonly limit: number;
}

export const DEFAULT_PREFS: Prefs = { limit: LIMIT_DEFAULT };

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function limitOf(raw: unknown): number | undefined {
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isInteger(parsed)) return undefined;
  if (parsed < LIMIT_MIN || parsed > LIMIT_MAX) return undefined;
  return parsed;
}

export function prefsOf(store: PrefStore): Prefs {
  const stored = recordOf(store.read(PREF_FILE));
  const limit = limitOf(stored['limit']);
  return { limit: limit ?? LIMIT_DEFAULT };
}

export function applyPrefs(store: PrefStore, payload: unknown): { readonly prefs: Prefs } {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('偏好写需要一个对象：{ limit?, reset? }');
  }
  const body = payload as Record<string, unknown>;
  if (body['reset'] === true) {
    store.remove(PREF_FILE);
    return { prefs: DEFAULT_PREFS };
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'limit')) {
    throw new Error(`这次偏好写里没有 limit —— 可用 ${String(LIMIT_MIN)}..${String(LIMIT_MAX)} 的整数`);
  }
  const limit = limitOf(body['limit']);
  if (limit === undefined) {
    throw new Error(
      `「最大的几个文件」只认 ${String(LIMIT_MIN)}..${String(LIMIT_MAX)} 的整数，收到「${String(body['limit'])}」`,
    );
  }
  const prefs: Prefs = { limit };
  store.write(PREF_FILE, prefs);
  return { prefs };
}
