import { ImageResponse } from "next/og"
import { loadOgFonts } from "@/app/_og/shared"

export const alt = "공놀이 — 그깟 공놀이에 진심인 팬들의 놀이터"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * 사이트 기본 공유 카드 (2026-08-20 P2 — "공유 얼굴" 교체).
 *
 * 종전 카드는 사이트 어디에도 없는 차가운 남색 그라디언트 + 이모지 5개 칩이었다 —
 * 카톡·디스코드에 어떤 링크를 붙여도 이 카드 하나가 나갔다 (PM 실측). 다크 밴드
 * (gn-band)의 그라디언트 레시피를 그대로 옮겨, 공유 카드가 곧 사이트의 첫 화면과
 * 같은 물건으로 읽히게 한다.
 *
 * 글자를 AI 이미지로 굽지 않는다(편집 가드레일) — 코드 렌더라 항상 선명하다.
 * 이모지 금지(감리). 장식은 피치 라인 기하 하나만.
 */
export default async function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        // gn-band 레시피 (app/a-tokens.css) — 나이트 바탕 + 버건디 래디얼 두 점
        backgroundColor: "#16141a",
        backgroundImage:
          "radial-gradient(circle at 78% -10%, rgba(150,30,55,0.32) 0%, rgba(150,30,55,0) 55%)," +
          "radial-gradient(circle at 50% 115%, rgba(150,30,55,0.38) 0%, rgba(150,30,55,0) 60%)",
      }}
    >
      {/* 피치 센터서클 기하 — 우하단에 걸치는 절제된 장식 하나 */}
      <div
        style={{
          position: "absolute",
          right: -140,
          bottom: -180,
          width: 460,
          height: 460,
          borderRadius: 230,
          border: "2px solid rgba(245,239,231,0.14)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 89,
          bottom: 49,
          width: 2,
          height: 232,
          background: "rgba(245,239,231,0.14)",
          display: "flex",
        }}
      />

      {/* 키커 — 스몰캡스 라틴 (밴드 문법) */}
      <div
        style={{
          fontFamily: "SUIT",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "0.34em",
          color: "#b8b0a4",
          display: "flex",
        }}
      >
        SEE YOU AT KICKOFF
      </div>

      {/* 워드마크 — 어그로체 (사이트 디스플레이 서체 그대로) */}
      <div
        style={{
          fontFamily: "Aggro",
          fontSize: 104,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "#f5efe7",
          display: "flex",
        }}
      >
        gongnori.fan
      </div>

      {/* 괘선 — 크림 헤어라인 */}
      <div
        style={{
          marginTop: 30,
          width: 64,
          height: 3,
          background: "#961e37",
          display: "flex",
        }}
      />

      <div
        style={{
          fontFamily: "SUIT",
          marginTop: 28,
          fontSize: 30,
          fontWeight: 700,
          color: "#b8b0a4",
          display: "flex",
        }}
      >
        그깟 공놀이에 진심인 팬들의 놀이터
      </div>
    </div>,
    { ...size, fonts: await loadOgFonts() }
  )
}
