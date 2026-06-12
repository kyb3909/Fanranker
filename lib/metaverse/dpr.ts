/**
 * HiDPI 보정용 devicePixelRatio. 2 초과 디스플레이는 성능 위해 2 로 캡.
 * 캔버스 backing store(boot) · 카메라 줌(scene) · 텍스트 resolution 이 같은 값을 공유해야 함.
 */
export function getDpr(): number {
  if (typeof window === "undefined") return 1
  return Math.min(window.devicePixelRatio || 1, 2)
}
