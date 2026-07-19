import type { Metadata } from "next"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import { ArrowLeft } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { WORLDCUP_SCORING_STARTS_AT } from "@/lib/worldcup/scoring"
import { WorldcupRecapBoard } from "@/components/worldcup/worldcup-recap-board"

export const metadata: Metadata = {
  title: "월드컵 이벤트 결과 발표",
  description: "종합 랭킹과 우승자 발표.",
  alternates: { canonical: "/worldcup/result" },
}

// 결과 데이터 즉시 반영
export const dynamic = "force-dynamic"

const EVENT_SLUG = "worldcup-2026"
const TOP_N = 10

// 상품 정의 (이번 발표 고정 — 1위 사인 유니폼 / 2·3위 시즌 유니폼)
const RICE_JERSEY_IMG = "/worldcup/prize-rice-jersey.webp"
const PRIZE_BY_RANK: Record<number, string> = {
  1: "데클란 라이스 친필 사인 유니폼",
  2: "아스날 2025-26 시즌 유니폼",
  3: "아스날 2025-26 시즌 유니폼",
}
const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

interface EventRow {
  id: string
  name: string
  status: string
  end_at: string
}
interface RegRow {
  user_id: string
}
interface SlipRow {
  user_id: string
  stake: number
  total_odds: number
  status: string
}
interface ProfileRow {
  user_id: string
  nickname: string | null
}

interface Ranked {
  rank: number
  user_id: string
  nickname: string
  profit: number
  accuracy: number
}

export default async function WorldcupResultPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const sp = await searchParams
  // 개발 환경에서만 동작하는 미리보기 — 프로덕션에선 항상 false (status 게이트 우회 불가)
  const previewMode = process.env.NODE_ENV !== "production" && sp?.preview === "1"
  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, end_at")
    .eq("slug", EVENT_SLUG)
    .maybeSingle<EventRow>()

  if (!event) {
    return (
      <div className="min-h-screen" style={{ background: "#f6f7f9" }}>
        <div className="mx-auto max-w-[640px] px-6 py-16">
          <div
            style={{
              background: "#fff",
              border: "1px solid var(--wc-line)",
              borderRadius: 18,
              boxShadow: "var(--wc-shadow-1)",
              padding: "22px 24px",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--wc-ink)" }}>
              이벤트 미존재
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--wc-ink-2)", marginTop: 4 }}>
              이벤트(slug=&quot;{EVENT_SLUG}&quot;)를 찾을 수 없습니다.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 종료 전이면 안내만 (status='closed' 로 바꾸기 전엔 아무도 결과를 못 봄)
  // previewMode(개발 전용)면 게이트를 건너뛰고 실제 결과 레이아웃을 미리 렌더
  if (event.status !== "closed" && !previewMode) {
    return (
      <div className="min-h-screen" style={{ background: "#f6f7f9" }}>
        <div className="mx-auto max-w-[640px] px-6 py-16 text-center">
          <div className="wc-res-eb">RESULT</div>
          <h1 className="wc-res-h1">결과 발표 대기 중</h1>
          <p className="wc-res-sub mt-3">
            이벤트가 아직 진행 중입니다. 정산이 마무리되면 종합 랭킹과 우승자를 발표해요.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/worldcup/leaderboard" className="wc-hbtn wc-hbtn-primary">
              현재 리더보드 보기
            </Link>
            <Link href="/worldcup" className="wc-hbtn wc-hbtn-ghost">
              이벤트 안내로
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 종료 후 — 참가자/슬립 fetch 후 종합 랭킹 집계
  const { data: r } = await supabase
    .from("event_registrations")
    .select("user_id")
    .eq("event_id", event.id)
  const registrations = (r ?? []) as RegRow[]

  // 슬립 전량 조회 — Supabase 는 1요청당 최대 1000행이라, 이벤트 슬립이 1000건을
  // 넘으면 앞부분만 읽혀 점수가 축소 집계된다(순위 오류). id 순 페이지네이션으로 전부 읽는다.
  const PAGE = 1000
  const slips: SlipRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: chunk } = await supabase
      .from("prediction_slips")
      .select("user_id, stake, total_odds, status")
      .eq("event_id", event.id)
      // 32강부터 정식 집계 — 리더보드와 동일 기준
      .gte("created_at", WORLDCUP_SCORING_STARTS_AT)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (!chunk || chunk.length === 0) break
    slips.push(...(chunk as SlipRow[]))
    if (chunk.length < PAGE) break
  }

  // user → net profit / accuracy (결과 페이지·리더보드 공통 공식: 슬립 단위 net)
  const userStats = new Map<string, { profit: number; settled: number; won: number }>()
  for (const slip of slips) {
    const cur = userStats.get(slip.user_id) ?? { profit: 0, settled: 0, won: 0 }
    if (slip.status === "won") {
      cur.profit += slip.stake * (Number(slip.total_odds) - 1)
      cur.settled++
      cur.won++
    } else if (slip.status === "lost") {
      cur.profit -= slip.stake
      cur.settled++
    }
    userStats.set(slip.user_id, cur)
  }

  // 1) 닉네임 없이 먼저 net 점수로 정렬 → 상위 TOP_N 만 추림
  //    (참가자 전원 프로필을 in() 으로 한 번에 조회하면 URL 길이 한계로 실패 →
  //     닉네임이 전부 user_id 폴백으로 떨어지는 버그. 상위 N명만 조회한다.)
  const userIds = [...new Set(registrations.map((x) => x.user_id))]
  const rankedRaw = userIds
    .map((uid) => {
      const st = userStats.get(uid) ?? { profit: 0, settled: 0, won: 0 }
      return {
        user_id: uid,
        profit: Math.round(st.profit * 10) / 10,
        accuracy: st.settled > 0 ? Math.round((st.won / st.settled) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.profit - a.profit)
    .slice(0, TOP_N)

  // 2) 상위 N명 프로필만 조회
  const topIds = rankedRaw.map((u) => u.user_id)
  const profiles: ProfileRow[] =
    topIds.length > 0
      ? (((await supabase.from("profiles").select("user_id, nickname").in("user_id", topIds))
          .data ?? []) as ProfileRow[])
      : []
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]))

  const ranked: Ranked[] = rankedRaw.map((u, i) => ({
    rank: i + 1,
    user_id: u.user_id,
    nickname: profileMap.get(u.user_id)?.nickname ?? u.user_id.slice(0, 8),
    profit: u.profit,
    accuracy: u.accuracy,
  }))

  const podium = ranked.slice(0, 3)

  return (
    <div className="min-h-screen" style={{ background: "#f6f7f9" }}>
      <div className="mx-auto max-w-[1120px] px-6 pt-10 pb-16">
        <Link
          href="/worldcup"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--wc-mute)" }}
        >
          <ArrowLeft className="h-4 w-4" /> 이벤트 안내로
        </Link>

        <header className="wc-res-hero">
          <div className="wc-res-eb">FINAL RESULT</div>
          <h1 className="wc-res-h1">{event.name} 결과 발표</h1>
          <p className="wc-res-sub">
            우승을 축하합니다! 🎉 함께해주신 모든 구너 여러분 감사합니다.
          </p>
        </header>

        {ranked.length === 0 ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid var(--wc-line)",
              borderRadius: 18,
              boxShadow: "var(--wc-shadow-1)",
              padding: "22px 24px",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--wc-ink)" }}>데이터 부족</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--wc-ink-2)", marginTop: 4 }}>
              이벤트가 종료됐지만 참가자/예측 데이터가 없어 결과를 산정할 수 없습니다.
            </p>
          </div>
        ) : (
          <>
            {/* 우승자 유니폼 사진 */}
            <div
              className="mx-auto mt-2 mb-6 overflow-hidden"
              style={{
                maxWidth: 520,
                borderRadius: 18,
                border: "1px solid var(--wc-line)",
                boxShadow: "var(--wc-shadow-1)",
                background: "#fff",
              }}
            >
              <Image
                src={RICE_JERSEY_IMG}
                alt="데클란 라이스 친필 사인 유니폼 (1위 상품)"
                width={1040}
                height={780}
                sizes="(max-width: 640px) 100vw, 520px"
                style={{ width: "100%", height: "auto", display: "block" }}
                priority
              />
              <div
                style={{
                  padding: "12px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--wc-ink-2)",
                  borderTop: "1px solid var(--wc-line)",
                }}
              >
                🏆 1위 상품 — 데클란 라이스 친필 사인 유니폼
              </div>
            </div>

            {/* 시상대 1·2·3위 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
                marginBottom: 22,
              }}
            >
              {podium.map((w) => (
                <article
                  key={w.user_id}
                  style={{
                    background: "#fff",
                    border:
                      w.rank === 1 ? "2px solid var(--wc-burgundy)" : "1px solid var(--wc-line)",
                    borderRadius: 16,
                    boxShadow: "var(--wc-shadow-1)",
                    padding: "20px 18px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32, lineHeight: 1 }}>{MEDAL[w.rank]}</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "var(--wc-mute)",
                      letterSpacing: 1,
                      marginTop: 6,
                    }}
                  >
                    {w.rank}위
                  </div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 900,
                      color: "var(--wc-ink)",
                      marginTop: 2,
                    }}
                  >
                    {w.nickname}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 16,
                      marginTop: 10,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <b style={{ color: "var(--wc-burgundy)" }}>
                        {w.profit >= 0 ? "+" : ""}
                        {w.profit}
                      </b>
                      <span style={{ color: "var(--wc-mute)", marginLeft: 4 }}>점</span>
                    </div>
                    <div>
                      <b style={{ color: "var(--wc-ink)" }}>{w.accuracy}%</b>
                      <span style={{ color: "var(--wc-mute)", marginLeft: 4 }}>적중</span>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "rgba(150,30,55,0.06)",
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "var(--wc-burgundy)",
                    }}
                  >
                    🎁 {PRIZE_BY_RANK[w.rank]}
                  </div>
                </article>
              ))}
            </div>

            {/* 상품 안내 + 연락 방법 */}
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--wc-line)",
                borderRadius: 14,
                boxShadow: "var(--wc-shadow-1)",
                padding: "16px 18px",
                marginBottom: 22,
              }}
            >
              <div
                style={{ fontSize: 14, fontWeight: 800, color: "var(--wc-ink)", marginBottom: 8 }}
              >
                🎁 상품 안내
              </div>
              <ul
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.8,
                  color: "var(--wc-ink-2)",
                  paddingLeft: 18,
                  listStyle: "disc",
                }}
              >
                <li>
                  <b>1위</b> — 데클란 라이스 친필 사인 유니폼
                </li>
                <li>
                  <b>2·3위</b> — 아스날 2025-26 시즌 유니폼
                </li>
              </ul>
              <p
                style={{ fontSize: 12.5, color: "var(--wc-mute)", marginTop: 10, lineHeight: 1.7 }}
              >
                당첨자께는 <b>가입하신 이메일로 개별 연락</b>드려 배송 정보를 받겠습니다. 스팸함도
                확인해 주세요.
              </p>
            </div>

            {/* TOP 10 종합 랭킹 */}
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--wc-line)",
                borderRadius: 14,
                boxShadow: "var(--wc-shadow-1)",
                overflow: "hidden",
                marginBottom: 22,
              }}
            >
              <div
                style={{
                  padding: "13px 18px",
                  borderBottom: "1px solid var(--wc-line)",
                  fontSize: 14,
                  fontWeight: 800,
                  color: "var(--wc-ink)",
                }}
              >
                종합 랭킹 TOP {TOP_N}
              </div>
              <div>
                {ranked.map((u) => (
                  <div
                    key={u.user_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "11px 18px",
                      borderBottom: "1px solid var(--wc-line)",
                      background: u.rank <= 3 ? "rgba(150,30,55,0.03)" : "#fff",
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        fontSize: 14,
                        fontWeight: 900,
                        color: u.rank <= 3 ? "var(--wc-burgundy)" : "var(--wc-mute)",
                      }}
                    >
                      {MEDAL[u.rank] ?? u.rank}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--wc-ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {u.nickname}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--wc-mute)",
                        width: 64,
                        textAlign: "right",
                      }}
                    >
                      {u.accuracy}%
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "var(--wc-burgundy)",
                        width: 72,
                        textAlign: "right",
                      }}
                    >
                      {u.profit >= 0 ? "+" : ""}
                      {u.profit}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 총 통계 보드 (주인장 vs 유저) */}
            <WorldcupRecapBoard />
          </>
        )}

        {/* 다음 이벤트 예고 */}
        <div className="wc-res-next">
          <div className="wc-res-next-eb">NEXT EVENT</div>
          <div className="wc-res-next-h">다음 시즌 이벤트를 기다리세요</div>
          <p className="wc-res-next-b">
            다음 빅 이벤트가 시작되면 알림으로 알려드릴게요. 참가 신청만 해두면 자동으로 받습니다.
          </p>
          <Link href="/worldcup" className="wc-res-next-cta">
            이벤트 안내로 →
          </Link>
        </div>
      </div>
    </div>
  )
}
