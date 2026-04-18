/**
 * 지도(region-map) 순수 수학/색상 유틸
 *
 * Canvas API(document/ctx)에 의존하지 않는 pure 함수만.
 * 그리기 헬퍼(roundRect, createCloudTexture)는 호출부(region-map.tsx)에 유지.
 */

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/** 7자리 hex(`#rrggbb`) + 알파 값 → `rgba(r,g,b,a)` 문자열 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
