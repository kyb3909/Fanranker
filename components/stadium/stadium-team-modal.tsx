"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics/events"
import { BRICK_PRICE } from "@/lib/constants/stadium-bricks"
import { findMapTeam, type StadiumMapRow } from "@/lib/stadium/map-teams"

interface MyBricks {
  my_bricks: number
  rank: number | null
  investor_count: number
}

interface Props {
  row: StadiumMapRow | null
  gap: { text: string; tone: string } | null
  myBrickBudget: number | null
  onClose: () => void
}

/** 레벨별 구장 스틸 — scripts/render-stadiums.mjs 가 미리 구워둔 것 */
function heroSrc(teamId: string, level: number): string {
  const lv = Math.min(10, Math.max(1, Math.round(level)))
  return `/stadium/renders/${teamId}-${lv}.webp`
}

export function StadiumTeamModal({ row, gap, myBrickBudget, onClose }: Props) {
  const [mine, setMine] = useState<MyBricks | null>(null)
  const teamId = row?.teamId ?? null

  useEffect(() => {
    if (!teamId) {
      setMine(null)
      return
    }
    let alive = true
    setMine(null)
    fetch(`/api/stadiums/${teamId}/my-bricks`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setMine(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [teamId])

  if (!row) return null
  const team = findMapTeam(row.teamId)
  if (!team) return null

  const done = row.level >= 10
  const pctText = done ? "완공" : `${Math.round(row.pct * 100)}%`
  const firstBrick = (mine?.my_bricks ?? 0) === 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="stadium-map-scope max-w-md gap-0 overflow-hidden p-0">
        <div className="relative h-56 w-full" style={{ background: "var(--st-void)" }}>
          <Image
            src={heroSrc(row.teamId, row.level)}
            alt={`${team.name} ${team.stadiumName} — 현재 건설 상태`}
            width={960}
            height={480}
            className="h-full w-full object-cover"
            priority
          />
          <span
            className="absolute top-3 left-3 rounded-lg px-2.5 py-1 text-[13px] font-bold"
            style={{
              background: done ? "var(--st-gold)" : "var(--st-panel)",
              color: done ? "var(--st-gold-ink)" : "var(--st-ink)",
              border: "1px solid var(--st-panel-line)",
            }}
          >
            {done ? "완공" : `LV.${row.level}`}
          </span>
        </div>

        <div className="p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-[20px] font-bold">
              {team.name}
              <span className="text-muted-foreground ml-2 text-[13px] font-normal">
                {team.stadiumName}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="text-muted-foreground mt-4 flex items-baseline justify-between text-[13px]">
            <span>{done ? "완공" : `LV.${row.level} → LV.${row.level + 1}`}</span>
            <span className="text-foreground font-bold tabular-nums">{pctText}</span>
          </div>
          <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${done ? 100 : Math.max(3, Math.round(row.pct * 100))}%`,
                background: team.color,
              }}
            />
          </div>

          <div className="text-muted-foreground mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px]">
            <span>
              짓는 팬 {row.fanCount.toLocaleString()}명 · 벽돌 {row.bricks.toLocaleString()}장
            </span>
            {row.todayBricks > 0 && (
              <span style={{ color: "var(--st-today)" }}>
                오늘 +{row.todayBricks.toLocaleString()}장
              </span>
            )}
          </div>

          {gap && gap.tone !== "done" && (
            <p
              className="mt-3 rounded-lg px-3 py-2 text-[13px] font-bold"
              style={{
                background: "var(--st-panel)",
                color: "var(--st-ink)",
                border: `2px solid var(--st-${gap.tone === "ahead" ? "ahead" : gap.tone === "lead" ? "gold" : "behind"})`,
              }}
            >
              {gap.text}
            </p>
          )}

          {mine && mine.my_bricks > 0 && (
            <p className="text-primary mt-3 text-[13px] font-medium">
              내 벽돌 {mine.my_bricks.toLocaleString()}장
              {mine.rank ? ` · ${mine.investor_count.toLocaleString()}명 중 ${mine.rank}위` : ""}
            </p>
          )}

          {/* 벽돌을 아직 안 쌓은 사람에게 "여기서 뭘 하는지" 한 줄 —
              3라운드 연속 지적된 온보딩(P1-1). 가격표 없이 버튼만 있으면 아무도 안 누른다. */}
          {firstBrick && (
            <p className="text-muted-foreground mt-3 text-[12px]">
              글 하나 = 벽돌 하나. 활동 점수 {BRICK_PRICE}p 로 이 구장에 벽돌 한 장을 얹습니다.
              {myBrickBudget !== null && myBrickBudget > 0
                ? ` 지금 ${myBrickBudget.toLocaleString()}장 쌓을 수 있어요.`
                : ""}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            {/* 완공 전에도 들어갈 수 있다 — 지금 쌓인 만큼만 서 있는 구장을 보는 게
                이 루프의 보상이다 (평가 R1-P1-7: 건설 중일수록 보여줄 게 많다) */}
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/stadium/${row.teamId}/enter`}>경기장 입장</Link>
            </Button>
            <Button
              asChild
              className="flex-1"
              onClick={() =>
                trackEvent({
                  name: "brick_cta_click",
                  params: { team_id: row.teamId, first_brick: firstBrick },
                })
              }
            >
              <Link href={`/stadium/${row.teamId}/build`}>
                {firstBrick ? "첫 벽돌 쌓기" : "벽돌 쌓기"}
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
