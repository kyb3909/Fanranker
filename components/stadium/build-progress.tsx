"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, HandCoins, LogIn } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { formatRelativeTime } from "@/lib/utils/date"

interface FlairScore {
  flair_id: string
  flair_name: string
  team_id: string | null
  score_balance: number
}

interface MeTitlesResponse {
  flair_scores: FlairScore[]
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

interface Contributor {
  userId: string
  nickname: string
  avatarUrl: string | null
  points: number
  lastAt: string
}

/** 원탭 프리셋 — 잔액에 따라 실제 가능한 것만 보여준다 */
const PRESETS = [10, 100, 1000]

export function BuildProgress({
  teamId,
  teamName,
  teamColor,
  initial,
  recentContributors,
}: {
  teamId: string
  teamName: string
  teamColor: string
  initial: StadiumSnapshot
  recentContributors: Contributor[]
}) {
  const [snap, setSnap] = useState(initial)
  const [donating, setDonating] = useState<number | null>(null)
  // 로그인 안 했으면 401 — 게이지·기여자는 그대로 보이고 기부 영역만 로그인 안내로 바뀐다
  const {
    data: me,
    error: meError,
    mutate,
  } = useSWR<MeTitlesResponse>("/api/profile/me/titles", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const myFlair = useMemo(
    () => me?.flair_scores.find((f) => f.team_id === teamId) ?? null,
    [me, teamId]
  )

  const progressPct = useMemo(() => {
    if (snap.nextRequired == null) return 100
    const range = snap.nextRequired - snap.currentRequired
    if (range <= 0) return 100
    // 하한 0 — 운영자가 레벨을 수동으로 올려둔 팀은 총점이 레벨 시작점보다 낮아
    // 음수가 나온다 (아스널 Lv.3 임시 세팅에서 -47.8% 실측)
    return Math.min(
      100,
      Math.max(0, Math.round(((snap.totalPoints - snap.currentRequired) / range) * 1000) / 10)
    )
  }, [snap])

  async function donate(amount: number) {
    if (!myFlair || amount <= 0 || amount > myFlair.score_balance) return
    setDonating(amount)
    try {
      const res = await fetch("/api/flair/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flair_id: myFlair.flair_id, amount }),
      })
      const j = await res.json()
      if (!res.ok || !j?.ok) throw new Error(j?.error || "기부 실패")
      // 응답이 새 총점·레벨을 주므로 게이지를 즉시 갱신 — 새로고침 없이 차오르는 걸 보여준다
      setSnap((s) => ({
        ...s,
        totalPoints: j.stadium_total_points ?? s.totalPoints,
        level: j.stadium_level ?? s.level,
        fanCount: j.fan_count ?? s.fanCount,
      }))
      toast({
        title: `${teamName} 경기장에 ${amount.toLocaleString()}p 기부 완료`,
        description: j.leveled_up ? `🎉 경기장 레벨업: Lv.${j.stadium_level}` : undefined,
      })
      await mutate()
    } catch (e) {
      toast({ title: "기부 실패", description: (e as Error).message, variant: "destructive" })
    } finally {
      setDonating(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      {/* 헤더 */}
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
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%`, backgroundColor: teamColor || undefined }}
          />
        </div>

        <div className="text-muted-foreground mt-2 flex items-center justify-between text-[12px] tabular-nums">
          <span>{snap.totalPoints.toLocaleString()}p</span>
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

      {/* 원탭 기부 */}
      <Card className="mt-4 p-5">
        <div className="flex items-center gap-2">
          <HandCoins className="text-muted-foreground h-4 w-4" />
          <p className="text-foreground text-[14px] font-bold">벽돌 얹기</p>
        </div>

        {meError || (me && !myFlair) ? (
          <p className="text-muted-foreground mt-3 text-[13px]">
            {meError
              ? "로그인하면 활동 점수로 경기장 건설에 참여할 수 있습니다."
              : "이 팀 말머리로 활동하면 쌓이는 점수로 참여할 수 있습니다. 게시판에서 글·댓글을 써보세요."}
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
              — 기부해도 호칭 진행엔 영향이 없습니다
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.filter((p) => p <= myFlair!.score_balance).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="outline"
                  disabled={donating != null}
                  onClick={() => donate(p)}
                >
                  {donating === p ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    `+${p.toLocaleString()}p`
                  )}
                </Button>
              ))}
              {myFlair!.score_balance > 0 && (
                <Button
                  size="sm"
                  disabled={donating != null}
                  onClick={() => donate(myFlair!.score_balance)}
                >
                  {donating === myFlair!.score_balance ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "전부 얹기"
                  )}
                </Button>
              )}
              {myFlair!.score_balance === 0 && (
                <p className="text-muted-foreground text-[13px]">
                  잔액이 없습니다 — 글·댓글·추천으로 점수를 모아보세요.
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

      {/* 최근 기여자 */}
      <Card className="mt-4 p-5">
        <p className="text-foreground text-[14px] font-bold">최근 벽돌을 얹은 팬</p>
        {recentContributors.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-[13px]">
            아직 아무도 없습니다 — 첫 벽돌의 주인공이 되어보세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentContributors.map((c) => (
              <li key={c.userId} className="flex items-center justify-between text-[13px]">
                <span className="text-foreground min-w-0 truncate font-medium">{c.nickname}</span>
                <span className="text-muted-foreground ml-3 shrink-0 tabular-nums">
                  누적 {c.points.toLocaleString()}p · {formatRelativeTime(new Date(c.lastAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}
