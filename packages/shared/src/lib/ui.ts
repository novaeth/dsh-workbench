import dayjs from 'dayjs';
/**
 * 拼类名：只留真值、用空格连接（`false` / `null` / `undefined` / 空串都丢掉）。
 * @param parts - 若干类名或条件值。
 * @returns 拼好的类字符串；一个真值都没有给空串。
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * 时间文案取词：i18n 的 `(key, params) => 文案`；相对时间那几件都从它拿词。
 */
export type TimeTranslate = (key: string, params?: Record<string, unknown>) => string;

/**
 * 相对时间的档位名，对应词表里的 `time.short.*`。
 */
export type RelativeTimeUnit = 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years';

/**
 * 相对时间的一档：`unit` 是档位，`n` 是这一档的数量（单位随档位，见 `relativeTimeBucket`）。
 */
export interface RelativeTimeBucket {
  readonly unit: RelativeTimeUnit;
  readonly n: number;
}

/**
 * 把时间戳按 dsh 的分档切成「刚刚 / N 分钟 / N 小时 / N 天 / N 月 / N 年」—— 30 天进月、365 天进年。
 * @param epochMs - 要换算的时间戳（毫秒）。
 * @param now - 基准时间，默认 `Date.now()`。
 * @returns 档位与数量；时间戳或基准不是有限数给 `null`，未来时间钳到「刚刚」（`now` / 0）。
 */
export function relativeTimeBucket(epochMs: number, now: number = Date.now()): RelativeTimeBucket | null {
  if (!Number.isFinite(epochMs) || !Number.isFinite(now)) return null;
  const diff = Math.max(0, now - epochMs);
  if (diff < MINUTE) return { unit: 'now', n: 0 };
  if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MINUTE) };
  if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) };
  if (diff < MONTH) return { unit: 'days', n: Math.floor(diff / DAY) };
  if (diff < YEAR) return { unit: 'months', n: Math.floor(diff / MONTH) };
  return { unit: 'years', n: Math.floor(diff / YEAR) };
}

function bucketLabel(bucket: RelativeTimeBucket, t: TimeTranslate): string {
  return bucket.unit === 'now' ? t('time.now') : t(`time.short.${bucket.unit}`, { n: bucket.n });
}

/**
 * 行内用的紧凑相对时间（「3 分钟」这种，不带「前」）。
 * @param epochMs - 要换算的时间戳（毫秒）。
 * @param t - 词表取词函数。
 * @param now - 基准时间，默认 `Date.now()`。
 * @returns 紧凑文案；时间戳非法给空串。
 */
export function relativeTimeCompact(epochMs: number, t: TimeTranslate, now?: number): string {
  const bucket = relativeTimeBucket(epochMs, now);
  return bucket === null ? '' : bucketLabel(bucket, t);
}

/**
 * 悬停卡里用的相对时间（「3 分钟前」）；「刚刚」那一档不加「前」。
 * @param epochMs - 要换算的时间戳（毫秒）。
 * @param t - 词表取词函数。
 * @param now - 基准时间，默认 `Date.now()`。
 * @returns 带「前」的文案；时间戳非法给空串。
 */
export function relativeTimeAgo(epochMs: number, t: TimeTranslate, now?: number): string {
  const bucket = relativeTimeBucket(epochMs, now);
  if (bucket === null) return '';
  const label = bucketLabel(bucket, t);
  return bucket.unit === 'now' ? label : t('time.ago', { t: label });
}

/**
 * 会话行那一版相对时间：一小时内按分钟、一天内按小时、七天内按天，再久直接给绝对时间（到秒）。
 * @param epochMs - 要换算的时间戳（毫秒）。
 * @param t - 词表取词函数。
 * @returns 文案；时间戳不是有限数给空串，未来时间落「刚刚」，七天及以上给本地化的年月日时分秒。
 */
export function relativeTime(epochMs: number, t: TimeTranslate): string {
  if (!Number.isFinite(epochMs)) return '';
  const diff = Date.now() - epochMs;
  if (diff < MINUTE) return t('time.now');
  if (diff < 60 * MINUTE) return t('time.minutes', { n: Math.floor(diff / MINUTE) });
  if (diff < 24 * 60 * MINUTE) return t('time.hours', { n: Math.floor(diff / (60 * MINUTE)) });
  if (diff < 7 * 24 * 60 * MINUTE) return t('time.days', { n: Math.floor(diff / (24 * 60 * MINUTE)) });
  return dayjs(epochMs).format('YYYY/M/D HH:mm:ss');
}

/**
 * 把 `/Users/<用户名>/…` 缩成 `~/…`，免得会话行里全是一样的长前缀。
 * @param path - 任意值。
 * @returns 缩好的路径；不在用户主目录下原样返回，不是字符串给空串。
 */
export function shortenPath(path: unknown): string {
  if (typeof path !== 'string') return '';
  const hit = path.match(/^\/Users\/[^/]+/);
  return hit === null ? path : path.replace(hit[0], '~');
}

const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

/**
 * 解析不带时区的本地时间戳（`YYYY-MM-DD HH:mm:ss`，也接受 `T` 分隔），按本机时区换算。
 * @param text - 原文；`null` / `undefined` 当空串；首尾空白容忍。
 * @returns 毫秒时间戳；形态不认识给 `NaN`（调用方据此回退到原始字符串，宁可不换算也不显示错时间）。
 */
export function parseLocalTimestamp(text: string | null | undefined): number {
  const raw = String(text ?? '').trim();
  if (!LOCAL_TIMESTAMP.test(raw)) return Number.NaN;
  return dayjs(raw.replace(' ', 'T')).valueOf();
}
