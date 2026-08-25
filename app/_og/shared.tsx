import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * 공유 카드 공용 재료 (2026-08-25).
 *
 * ⚠️ satori 는 woff2 를 못 읽는다 — `public/fonts/*.woff2` 를 ttf 로 풀어 `app/_og/` 에
 *    두고 임베드한다. 임베드가 없으면 satori 기본 폰트의 단일 웨이트로 떨어져
 *    워드마크 800 이 라이트로 렌더된다 (실측). Vercel 번들 포함은 next.config.mjs
 *    `outputFileTracingIncludes` 가 보장한다.
 */
export async function loadOgFonts() {
  const dir = join(process.cwd(), "app", "_og")
  const [aggro, suit] = await Promise.all([
    readFile(join(dir, "aggro-bold.ttf")),
    readFile(join(dir, "suit-700.ttf")),
  ])
  return [
    { name: "Aggro", data: aggro, weight: 800 as const, style: "normal" as const },
    { name: "SUIT", data: suit, weight: 700 as const, style: "normal" as const },
  ]
}

/** 다크 밴드 배경 — 사이트 gn-band 레시피 그대로 (공유 카드가 첫 화면과 같은 물건으로 읽히게) */
export const BAND_BG = {
  backgroundColor: "#16141a",
  backgroundImage:
    "radial-gradient(circle at 78% -10%, rgba(150,30,55,0.34) 0%, rgba(150,30,55,0) 55%)," +
    "radial-gradient(circle at 50% 115%, rgba(150,30,55,0.40) 0%, rgba(150,30,55,0) 60%)",
} as const

export const CREAM = "#f5efe7"
export const WINE = "#961e37"

/**
 * 사이트 마크 — **사각형 다섯 개**로 그린다.
 *
 * ⚠️ satori 는 SVG stroke 를 온전히 렌더하지 않는다. 다행히 이 마크는 직각 획뿐이라
 *    사각형만으로 정확히 재현된다 (icon.svg 와 같은 좌표를 32 기준으로 환산).
 */
export function Mark({ size }: { size: number }) {
  const k = size / 32
  const px = (n: number) => `${n * k}px`
  const bar = (x: number, y: number, w: number, h: number, color: string, radius?: number) => (
    <div
      style={{
        position: "absolute",
        left: px(x),
        top: px(y),
        width: px(w),
        height: px(h),
        background: color,
        display: "flex",
        ...(radius ? { borderRadius: px(radius) } : {}),
      }}
    />
  )
  return (
    <div
      style={{
        position: "relative",
        width: px(32),
        height: px(32),
        borderRadius: px(6.4),
        background: WINE,
        display: "flex",
        flexShrink: 0,
      }}
    >
      {/* ㄱ — 가로 + 세로 (모서리는 겹쳐서 직각이 된다) */}
      {bar(10, 8.5, 13.1, 3.4, CREAM)}
      {bar(19.7, 8.5, 3.4, 6.7, CREAM)}
      {/* 180° 회전한 짝 */}
      {bar(8.9, 20.1, 13.1, 3.4, CREAM)}
      {bar(8.9, 16.8, 3.4, 6.7, CREAM)}
      {/* 가운데 점 */}
      {bar(14.5, 14.5, 3, 3, "rgba(245,239,231,0.5)", 1.5)}
    </div>
  )
}

/** 카드 하단 브랜드 줄 */
export function Footer({ right }: { right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Mark size={52} />
      <div
        style={{
          fontFamily: "Aggro",
          fontSize: 36,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: CREAM,
          display: "flex",
        }}
      >
        gongnori.fan
      </div>
      {right ? (
        <div
          style={{
            fontFamily: "SUIT",
            fontSize: 26,
            color: "rgba(245,239,231,0.62)",
            marginLeft: "auto",
            display: "flex",
          }}
        >
          {right}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 제목 글자 크기 — 길이에 따라 줄인다.
 * satori 에는 줄바꿈 후 넘침을 되돌리는 장치가 없어서, **넘치면 잘린 채로 나간다.**
 * 실측 기준: 1200×630 카드에서 이 값이면 4줄 안에 들어온다.
 */
export function titleSize(title: string): number {
  const n = title.length
  if (n <= 26) return 76
  if (n <= 38) return 66
  if (n <= 52) return 58
  return 50
}
