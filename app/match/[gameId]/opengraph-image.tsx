import { ImageResponse } from "next/og"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { BAND_BG, CREAM, Footer, loadOgFonts } from "@/app/_og/shared"

export const alt = "경기"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 매치센터 공유 카드 (2026-08-25).
 *
 * ## 왜 따로 만드는가
 * 외부 감사 지적 — 매치센터 링크에는 og:image 가 아예 없어서 공유하면 사이트 공통 카드가
 * 나갔다. 그런데 경기 링크에서 독자가 궁금한 건 딱 하나, **스코어**다.
 * 제목 줄로 쓰는 것보다 숫자를 크게 세우는 편이 스크롤 중에도 읽힌다.
 *
 * ⚠️ 스코어가 없으면(예정 경기) 숫자 대신 킥오프 시각을 세운다 — "0-0" 으로 보이면
 *    끝난 경기로 오해한다.
 */
export default async function MatchOgImage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params

  let home = "홈"
  let away = "원정"
  let league: string | null = null
  let hs: number | null = null
  let as: number | null = null
  let kickoff: string | null = null

  if (UUID_RE.test(gameId)) {
    try {
      const { data } = await createServiceRoleClient()
        .from("betman_games")
        .select("home_team_name, away_team_name, home_score, away_score, league_code, match_time")
        .eq("id", gameId)
        .maybeSingle()
      if (data) {
        home = String(data.home_team_name ?? home)
        away = String(data.away_team_name ?? away)
        league = data.league_code ? String(data.league_code) : null
        hs = typeof data.home_score === "number" ? data.home_score : null
        as = typeof data.away_score === "number" ? data.away_score : null
        kickoff = data.match_time ? String(data.match_time) : null
      }
    } catch {
      // fail-open — 브랜드 카드라도 나가는 편이 빈 미리보기보다 낫다
    }
  }

  const kst = kickoff ? new Date(new Date(kickoff).getTime() + 9 * 3600_000) : null
  // ⚠️ 날짜와 시각을 **나눠 쓴다.** 한 덩어리로 만들었더니 위 머리줄과 가운데에 같은 값이
  //    두 번 나왔다 (실측). 머리줄은 "언제 경기인가", 가운데는 "몇 시 시작인가"다.
  const dayLabel = kst ? `${kst.getUTCMonth() + 1}.${kst.getUTCDate()}` : null
  const timeLabel = kst
    ? `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`
    : null
  const hasScore = hs != null && as != null
  // 팀 이름이 길면 줄인다 — 두 팀이 한 줄에 나란히 서야 한다
  const teamSize = Math.max(home.length, away.length) > 7 ? 44 : 56

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px",
        ...BAND_BG,
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: "Aggro",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "0.16em",
          color: "rgba(245,239,231,0.6)",
        }}
      >
        {[league, dayLabel].filter(Boolean).join("   ·   ") || "MATCH"}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 34 }}>
        <div
          style={{
            display: "flex",
            flex: 1,
            justifyContent: "flex-end",
            fontFamily: "SUIT",
            fontSize: teamSize,
            fontWeight: 700,
            color: CREAM,
          }}
        >
          {home}
        </div>

        {hasScore ? (
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                fontFamily: "Aggro",
                fontSize: 116,
                fontWeight: 800,
                color: CREAM,
              }}
            >
              {hs}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Aggro",
                fontSize: 96,
                fontWeight: 800,
                color: "rgba(245,239,231,0.38)",
              }}
            >
              :
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Aggro",
                fontSize: 116,
                fontWeight: 800,
                color: CREAM,
              }}
            >
              {as}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              fontFamily: "Aggro",
              fontSize: 64,
              fontWeight: 800,
              color: "rgba(245,239,231,0.72)",
              padding: "0 10px",
            }}
          >
            {timeLabel ?? "VS"}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flex: 1,
            fontFamily: "SUIT",
            fontSize: teamSize,
            fontWeight: 700,
            color: CREAM,
          }}
        >
          {away}
        </div>
      </div>

      <Footer right={hasScore ? "라인업 · 기록 · 리포트" : "라인업 · 예상"} />
    </div>,
    { ...size, fonts: await loadOgFonts() }
  )
}
