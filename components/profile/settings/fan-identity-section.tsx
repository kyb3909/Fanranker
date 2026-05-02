"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, Lock, HandCoins } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface FlairScore {
  flair_id: string
  flair_name: string
  flair_color: string | null
  community_slug: string
  team_id: string | null
  score_total: number
  score_balance: number
}

interface TitleEntry {
  id: string
  flair_id: string
  flair_name: string
  name: string
  threshold: number
  unlocked: boolean
  unlocked_at: string | null
  is_current_display: boolean
}

interface MeTitlesResponse {
  display_title_id: string | null
  flair_scores: FlairScore[]
  titles: TitleEntry[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function FanIdentitySection() {
  const { data, isLoading, mutate } = useSWR<MeTitlesResponse>("/api/profile/me/titles", fetcher, {
    revalidateOnFocus: false,
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [localDisplay, setLocalDisplay] = useState<string | null>(null)
  const [donatingFlairId, setDonatingFlairId] = useState<string | null>(null)
  const [donateAmount, setDonateAmount] = useState<Record<string, string>>({})

  useEffect(() => {
    if (data) setLocalDisplay(data.display_title_id)
  }, [data])

  async function donate(flair: FlairScore) {
    const raw = donateAmount[flair.flair_id] ?? ""
    const amount = parseInt(raw, 10)
    if (!amount || amount <= 0 || amount > flair.score_balance) {
      toast({ title: "기부 금액을 다시 확인해주세요", variant: "destructive" })
      return
    }
    setDonatingFlairId(flair.flair_id)
    try {
      const res = await fetch("/api/flair/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flair_id: flair.flair_id, amount }),
      })
      const j = await res.json()
      if (!res.ok || !j?.ok) throw new Error(j?.error || "기부 실패")
      toast({
        title: `${flair.flair_name} 경기장에 ${amount}p 기부 완료`,
        description: j.leveled_up ? `🎉 경기장 레벨업: Lv.${j.stadium_level}` : undefined,
      })
      setDonateAmount({ ...donateAmount, [flair.flair_id]: "" })
      await mutate()
    } catch (e) {
      toast({
        title: "기부 실패",
        description: (e as Error).message,
        variant: "destructive",
      })
    } finally {
      setDonatingFlairId(null)
    }
  }

  async function selectTitle(titleId: string | null) {
    setSavingId(titleId ?? "__off__")
    const prev = localDisplay
    setLocalDisplay(titleId)
    try {
      const res = await fetch("/api/profile/me/display-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title_id: titleId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || "저장 실패")
      toast({ title: titleId ? "호칭 변경됨" : "호칭 표시 끔" })
      await mutate()
    } catch (e) {
      setLocalDisplay(prev)
      toast({
        title: "오류",
        description: (e as Error).message,
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          <span className="text-muted-foreground text-sm">팬 정체성 불러오는 중...</span>
        </div>
      </Card>
    )
  }

  const titles = data?.titles ?? []
  const scores = data?.flair_scores ?? []

  if (scores.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-foreground mb-1 flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-4 w-4 text-amber-500" />내 팬 정체성
        </h3>
        <p className="text-muted-foreground text-sm">
          글, 댓글, 받은 추천으로 점수가 쌓이면 여기 호칭이 잠금 해제돼요.
          <br />
          <span className="text-xs">
            글 = 10점 / 댓글 = 1점 / 받은 추천 = 1점 · 같은 flair team 의 경기장에 기부 가능
          </span>
        </p>
      </Card>
    )
  }

  // flair 별로 grouping
  const titlesByFlair = new Map<string, TitleEntry[]>()
  for (const t of titles) {
    const arr = titlesByFlair.get(t.flair_id) ?? []
    arr.push(t)
    titlesByFlair.set(t.flair_id, arr)
  }
  for (const [k, arr] of titlesByFlair)
    titlesByFlair.set(
      k,
      arr.sort((a, b) => a.threshold - b.threshold)
    )

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-foreground mb-1 flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-4 w-4 text-amber-500" />내 팬 정체성
        </h3>
        <p className="text-muted-foreground text-xs">
          flair 활동 점수로 잠금 해제된 호칭 중 하나를 표시할 수 있어요. 닉네임 옆에 노출됩니다.
        </p>
      </div>

      {/* flair 점수 top + 기부 */}
      <div className="space-y-2">
        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          내 flair 점수 (Top {Math.min(scores.length, 5)})
        </div>
        <div className="space-y-2">
          {scores.slice(0, 5).map((s) => {
            const canDonate = s.team_id && s.score_balance > 0
            const isDonating = donatingFlairId === s.flair_id
            return (
              <div
                key={s.flair_id}
                className="bg-muted/40 border-border space-y-2 rounded-lg border p-3"
                style={
                  s.flair_color ? { borderLeftWidth: 3, borderLeftColor: s.flair_color } : undefined
                }
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-foreground font-semibold">{s.flair_name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    누적 {s.score_total.toLocaleString()}p
                  </span>
                  {s.score_balance > 0 && (
                    <span className="text-primary tabular-nums">
                      · 잔액 {s.score_balance.toLocaleString()}p
                    </span>
                  )}
                  {!s.team_id && (
                    <span className="text-muted-foreground text-[10px]">
                      (리그 flair — 기부 불가)
                    </span>
                  )}
                </div>
                {canDonate && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={s.score_balance}
                      placeholder="기부 점수"
                      value={donateAmount[s.flair_id] ?? ""}
                      onChange={(e) =>
                        setDonateAmount({ ...donateAmount, [s.flair_id]: e.target.value })
                      }
                      className="border-border bg-background h-9 w-32 rounded-md border px-2 text-xs"
                      disabled={isDonating}
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="h-9 gap-1 text-xs"
                      onClick={() => donate(s)}
                      disabled={isDonating || !donateAmount[s.flair_id]}
                    >
                      {isDonating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <HandCoins className="h-3.5 w-3.5" />
                      )}
                      경기장 기부
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 호칭 선택 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            호칭 선택
          </div>
          {localDisplay && (
            <button
              type="button"
              onClick={() => selectTitle(null)}
              disabled={savingId !== null}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline disabled:opacity-50"
            >
              표시 끄기
            </button>
          )}
        </div>

        {[...titlesByFlair.entries()].map(([flairId, arr]) => {
          const flairName = arr[0]?.flair_name ?? ""
          return (
            <div key={flairId} className="space-y-1.5">
              <div className="text-muted-foreground text-[11px]">{flairName}</div>
              <div className="flex flex-wrap gap-1.5">
                {arr.map((t) => {
                  const selected = localDisplay === t.id
                  const disabled = !t.unlocked || savingId !== null
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => t.unlocked && selectTitle(t.id)}
                      disabled={disabled}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : t.unlocked
                            ? "border-border bg-muted hover:bg-muted/80 cursor-pointer"
                            : "border-border bg-muted/30 text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      {!t.unlocked && <Lock className="h-3 w-3" />}
                      <span>{t.name}</span>
                      <span className="text-muted-foreground text-[10px] tabular-nums">
                        {t.threshold.toLocaleString()}p
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
