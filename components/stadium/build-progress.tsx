"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, HandCoins, LogIn, Trophy } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { trackEvent } from "@/lib/analytics/events"
import { formatRelativeTime } from "@/lib/utils/date"
import { BRICK_PRICE } from "@/lib/constants/stadium-bricks"

interface FlairScore {
  flair_id: string
  flair_name: string
  team_id: string | null
  score_balance: number
}

interface MeTitlesResponse {
  flair_scores: FlairScore[]
}

interface MyBricksResponse {
  my_bricks: number
  my_points_spent: number
  rank: number | null
  investor_count: number
  recent: { bricks: number; points: number; start_index: number; at: string }[]
}

interface StadiumSnapshot {
  level: number
  totalPoints: number
  fanCount: number
  levelName: string
  levelEmoji: string
  currentRequired: number
  nextRequired: number | null
  nextLevelName: string | null
}

interface Investor {
  rank: number
  nickname: string
  bricks: number
  points: number
}

interface RecentBuy {
  nickname: string
  bricks: number
  startIndex: number
  at: string
}

/** 벽돌 구매 프리셋 — 잔액으로 살 수 있는 것만 노출된다 */
const BRICK_PRESETS = [1, 5, 10]

export function BuildProgress({
  teamId,
  teamName,
  teamColor,
  initial,
  investors,
  recentBuys,
}: {
  teamId: string
  teamName: string
  teamColor: string
  initial: StadiumSnapshot
  investors: Investor[]
  recentBuys: RecentBuy[]
}) {
  const [snap, setSnap] = useState(initial)
  const [buying, setBuying] = useState<number | null>(null)
  // 로그인 안 했으면 401 — 게이지·랭킹은 그대로 보이고 구매 영역만 로그인 안내로 바뀐다
  const {
    data: me,
    error: meError,
    mutate,
  } = useSWR<MeTitlesResponse>("/api/profile/me/titles", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const { data: myBricks, mutate: mutateMyBricks } = useSWR<MyBricksResponse>(
    me ? `/api/stadiums/${teamId}/my-bricks` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const myFlair = useMemo(
    () => me?.flair_scores.find((f) => f.team_id === teamId) ?? null,
    [me, teamId]
  )
  const affordable = myFlair ? Math.floor(myFlair.score_balance / BRICK_PRICE) : 0

  const progressPct = useMemo(() => {
    if (snap.nextRequired == null) return 100
    const range = snap.nextRequired - snap.currentRequired
    if (range <= 0) return 100
    // 하한 0 — 운영자가 레벨을 수동으로 올려둔 팀은 총점이 레벨 시작점보다 낮을 수 있다
    return Math.min(
      100,
      Math.max(0, Math.round(((snap.totalPoints - snap.currentRequired) / range) * 1000) / 10)
    )
  }, [snap])

  const totalBricks = Math.floor(snap.totalPoints / BRICK_PRICE)

  async function buy(bricks: number) {
    if (!myFlair || bricks <= 0 || bricks > affordable) return
    setBuying(bricks)
    try {
      const res = await fetch("/api/flair/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flair_id: myFlair.flair_id, bricks }),
      })
      const j = await res.json()
      if (!res.ok || !j?.ok) throw new Error(j?.error || "구매 실패")
      setSnap((s) => ({
        ...s,
        totalPoints: j.stadium_total_points ?? s.totalPoints,
        level: j.stadium_level ?? s.level,
        fanCount: j.fan_count ?? s.fanCount,
      }))
      // 지도 KPI 의 분자 — 벽돌 전환율(brick_purchase / brick_cta_click)
      trackEvent({ name: "brick_purchase", params: { team_id: teamId, bricks } })
      const nth = (j.start_index ?? 0) + 1
      toast({
        title: `${teamName}의 ${nth.toLocaleString()}번째 벽돌을 얹었습니다`,
        description:
          `내 벽돌 총 ${(j.my_total_bricks ?? bricks).toLocaleString()}개` +
          (j.leveled_up ? ` · 🎉 경기장 레벨업 Lv.${j.stadium_level}` : ""),
      })
      await Promise.all([mutate(), mutateMyBricks()])
    } catch (e) {
      toast({ title: "구매 실패", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBuying(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <header className="mb-6">
        <p className="text-muted-foreground text-[13px]">경기장 건설 현황</p>
        <h1 className="text-foreground text-[26px] leading-tight font-bold">{teamName}</h1>
      </header>

      {/* 진행률 게이지 */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-foreground text-[16px] font-bold">
              {snap.levelEmoji} Lv.{snap.level} {snap.levelName}
            </p>
            {snap.nextLevelName && (
              <p className="text-muted-foreground mt-0.5 text-[12px]">
                다음: Lv.{snap.level + 1} {snap.nextLevelName}
              </p>
            )}
          </div>
          <p className="text-foreground text-[20px] font-bold tabular-nums">{progressPct}%</p>
        </div>

        <div className="bg-muted mt-4 h-3 overflow-hidden rounded-full">
          {/* 팀 컬러가 없는 핀은 bg-primary 폴백 — 없으면 바가 투명해진다 */}
          <div
            className="bg-primary h-full rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%`, backgroundColor: teamColor || undefined }}
          />
        </div>

        <div className="text-muted-foreground mt-2 flex items-center justify-between text-[12px] tabular-nums">
          <span>
            벽돌 <span className="text-foreground font-bold">{totalBricks.toLocaleString()}</span>장
            ({snap.totalPoints.toLocaleString()}p)
          </span>
          <span>
            {snap.nextRequired != null ? `${snap.nextRequired.toLocaleString()}p` : "최고 레벨"}
          </span>
        </div>

        <p className="text-muted-foreground mt-3 text-[13px]">
          지금까지{" "}
          <span className="text-foreground font-bold">{snap.fanCount.toLocaleString()}명</span>의
          팬이 함께 짓고 있습니다
        </p>
      </Card>

      {/* 벽돌 구매 */}
      <Card className="mt-4 p-5">
        <div className="flex items-center gap-2">
          <HandCoins className="text-muted-foreground h-4 w-4" />
          <p className="text-foreground text-[14px] font-bold">벽돌 얹기</p>
          <p className="text-muted-foreground ml-auto text-[12px]">벽돌 1장 = {BRICK_PRICE}p</p>
        </div>

        {meError || (me && !myFlair) ? (
          <p className="text-muted-foreground mt-3 text-[13px]">
            {meError
              ? "로그인하면 활동 점수로 벽돌을 살 수 있습니다."
              : "이 팀 말머리로 활동하면 쌓이는 점수로 벽돌을 삽니다. 게시판에서 글·댓글을 써보세요."}
          </p>
        ) : !me ? (
          <div className="text-muted-foreground mt-3 flex items-center gap-2 text-[13px]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 불러오는 중
          </div>
        ) : (
          <>
            <p className="text-muted-foreground mt-1 text-[12px]">
              내 잔액{" "}
              <span className="text-foreground font-bold tabular-nums">
                {myFlair!.score_balance.toLocaleString()}p
              </span>{" "}
              = 벽돌 {affordable.toLocaleString()}장 어치 — 사도 호칭 진행엔 영향이 없습니다
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {BRICK_PRESETS.filter((n) => n <= affordable).map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant="outline"
                  disabled={buying != null}
                  onClick={() => buy(n)}
                >
                  {buying === n ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    `벽돌 +${n} (${(n * BRICK_PRICE).toLocaleString()}p)`
                  )}
                </Button>
              ))}
              {affordable > 0 && (
                <Button size="sm" disabled={buying != null} onClick={() => buy(affordable)}>
                  {buying === affordable ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    `전부 (${affordable.toLocaleString()}장)`
                  )}
                </Button>
              )}
              {affordable === 0 && (
                <p className="text-muted-foreground text-[13px]">
                  잔액이 부족합니다 — 글(+10)·댓글(+1)·추천(+1)으로 점수를 모아보세요.
                </p>
              )}
            </div>
          </>
        )}

        {meError && (
          <Button asChild size="sm" variant="outline" className="mt-3">
            <a href="/sign-in">
              <LogIn className="mr-1.5 h-3.5 w-3.5" /> 로그인
            </a>
          </Button>
        )}
      </Card>

      {/* 내 투자 */}
      {myBricks && myBricks.my_bricks > 0 && (
        <Card className="mt-4 p-5">
          <p className="text-foreground text-[14px] font-bold">내 투자</p>
          <p className="text-muted-foreground mt-2 text-[13px]">
            벽돌{" "}
            <span className="text-foreground text-[16px] font-bold tabular-nums">
              {myBricks.my_bricks.toLocaleString()}
            </span>
            장 · {myBricks.my_points_spent.toLocaleString()}p 투자
            {myBricks.rank != null && (
              <>
                {" "}
                · 투자자 {myBricks.investor_count.toLocaleString()}명 중{" "}
                <span className="text-foreground font-bold">{myBricks.rank}위</span>
              </>
            )}
          </p>
          {myBricks.recent.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {myBricks.recent.slice(0, 5).map((r, i) => (
                <li key={i} className="text-muted-foreground flex justify-between text-[12px]">
                  <span>
                    {(r.start_index + 1).toLocaleString()}번째 자리부터 {r.bricks}장
                  </span>
                  <span suppressHydrationWarning>{formatRelativeTime(new Date(r.at))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* 투자자 랭킹 */}
      <Card className="mt-4 p-5">
        <div className="flex items-center gap-2">
          <Trophy className="text-muted-foreground h-4 w-4" />
          <p className="text-foreground text-[14px] font-bold">투자자 랭킹</p>
        </div>
        {investors.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-[13px]">
            아직 아무도 없습니다 — 첫 벽돌의 주인공이 되어보세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {investors.map((v) => (
              <li key={v.rank} className="flex items-center justify-between text-[13px]">
                <span className="text-foreground min-w-0 truncate">
                  <span className="text-muted-foreground mr-2 tabular-nums">{v.rank}</span>
                  <span className="font-medium">{v.nickname}</span>
                </span>
                <span className="text-muted-foreground ml-3 shrink-0 tabular-nums">
                  벽돌 {v.bricks.toLocaleString()}장
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 최근 투자 */}
      <Card className="mt-4 p-5">
        <p className="text-foreground text-[14px] font-bold">최근 벽돌을 얹은 팬</p>
        {recentBuys.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-[13px]">아직 벽돌 구매 기록이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentBuys.map((b, i) => (
              <li key={i} className="flex items-center justify-between text-[13px]">
                <span className="text-foreground min-w-0 truncate font-medium">{b.nickname}</span>
                <span className="text-muted-foreground ml-3 shrink-0 tabular-nums">
                  {(b.startIndex + 1).toLocaleString()}번째부터 {b.bricks}장 ·{" "}
                  <span suppressHydrationWarning>{formatRelativeTime(new Date(b.at))}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}
