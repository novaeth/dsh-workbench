import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

/**
 * UTC 时钟（`HH:mm:ss`）：日志与状态行只给人看时分秒，不带日期。
 * @param value ISO 字符串、时间戳或 Date。
 * @returns `HH:mm:ss`；非法时间返回 `Invalid Date`。
 */
export function clockOf(value: string | number | Date): string {
  return dayjs(value).utc().format('HH:mm:ss');
}

/**
 * 把时间戳/ISO 字符串转成毫秒；非法输入给 `NaN`（调用方据此回退）。
 * @param value ISO 字符串、时间戳或 Date。
 * @returns 毫秒时间戳或 `NaN`。
 */
export function epochOf(value: string | number | Date): number {
  return dayjs(value).valueOf();
}
