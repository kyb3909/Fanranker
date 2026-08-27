"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics/events"
import { BRICK_PRICE } from "@/lib/constants/stadium-bricks"
import { findMapTeam, type StadiumMapRow } from "@/lib/stadium/map-teams"
import { DEPTH_K, HEIGHT_K } from "@/lib/stadium/map-projection"
import { drawStadium, stadiumScale, stadiumTopHeight } from "@/lib/stadium/voxel-draw"

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

/** 모달 히어로 — 지도와 같은 모델을 크게 다시 그린다 (별도 에셋 없음) */
function StadiumHero({ level, color }: { level: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // 구장 실루엣이 프레임에 꼭 맞도록 배율을 역산한다 (모델 크기는 레벨마다 다르다)
    const sc = stadiumScale(level)
    const topH = stadiumTopHeight(level)
    const spanX = 6.6 * sc
    const spanY = 5.4 * sc * DEPTH_K + topH * HEIGHT_K
    const s = Math.min((w * 0.84) / spanX, (h * 0.86) / spanY)

    const yTop = (-2.7 * sc * DEPTH_K - topH * HEIGHT_K) * s
    const yBottom = 2.7 * sc * DEPTH_K * s
    const t = { s, ox: w / 2, oy: h / 2 - (yTop + yBottom) / 2 }
    drawStadium(ctx, t, 0, 0, 0, level, color)
  }, [level, color])

  return <canvas ref={ref} className="h-full w-full" aria-hidden="true" />
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
        <div className="h-40 w-full" style={{ background: "var(--st-void)" }}>
          <StadiumHero level={row.level} color={team.color} />
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
            {done ? (
              <Button variant="outline" className="flex-1" disabled>
                입장하기 — 준비 중
              </Button>
            ) : null}
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
