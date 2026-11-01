import { join } from 'node:path';
import type { PngRect } from '@/shared/api/host/png-crop';

export interface PngClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clipOf(value: unknown): PngClip | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const x = finite(raw['x']);
  const y = finite(raw['y']);
  const width = finite(raw['width']);
  const height = finite(raw['height']);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

export function deviceClipRect(clip: PngClip, dpr: number): PngRect {
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    x: Math.max(0, Math.round(clip.x * scale)),
    y: Math.max(0, Math.round(clip.y * scale)),
    width: Math.max(1, Math.round(clip.width * scale)),
    height: Math.max(1, Math.round(clip.height * scale)),
  };
}

export function clipNote(clip: PngClip, viewport: { readonly width: number; readonly height: number }): string {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return '没读到视口尺寸（那条量 dpr / innerWidth 的 eval 没回来）—— 给的是整屏图，裁不了';
  }
  const inside =
    clip.x + clip.width <= viewport.width && clip.y + clip.height <= viewport.height && viewport.width > 0;
  if (inside) return '';
  return (
    `要裁的那块 ${String(clip.x)},${String(clip.y)} ${String(clip.width)}×${String(clip.height)} 不在视口里` +
    `（视口 ${String(viewport.width)}×${String(viewport.height)}）—— 给的是整屏图`
  );
}

export function defaultShotPath(dir: string, unit: string, stamp: number): string {
  return join(dir, `${unit === '' ? 'page' : unit}-${String(stamp)}.png`);
}
