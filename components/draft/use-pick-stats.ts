"use client"

import { useEffect, useState } from "react"
import { getAllPlayers } from "@/lib/draft/players"

/**
 * 우리 유저들의 드래프트 픽 통계 (2026-08-25).
 *
 * FPL 소유율은 남의 집(전 세계 판타지 유저) 지표다. 운영자가 원한 건 **우리 게임에서**
 * 누가 얼마나 자주, 몇 라운드에 뽑히는가 — /api/draft/stats 가 쌓은 걸 읽어 온다.
 *
 * rankInPos 는 같은 포지션 안에서 픽수 내림차순 순위다. 분모(posPicked)는 "그 포지션에서
 * 한 번이라도 뽑힌 선수 수" — 610명 전체가 아니라 실제로 경쟁한 풀이다.
 */
export interface PickStat {
  picks: number
  avgRound: number
  /** 이 선수를 뽑은 판의 비율 (0~100). 판수가 분모다. */
  rate: number
  rankInPos: number
  posPicked: number
}

export interface PickStats {
  games: number
  byId: Record<string, PickStat>
}

const EMPTY: PickStats = { games: 0, byId: {} }

export function usePickStats(slug: string | undefined, playersLoaded: boolean): PickStats {
  const [stats, setStats] = useState<PickStats>(EMPTY)

  useEffect(() => {
    if (!slug || !playersLoaded) return
    let cancelled = false
    fetch(`/api/draft/stats?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            games: number
            players: Record<string, { picks: number; avgRound: number }>
          } | null
        ) => {
          if (cancelled || !data || !data.games) return
          const posOf = new Map(getAllPlayers().map((p) => [p.id, p.position]))
          // 포지션별로 픽수 내림차순 정렬해 순위를 매긴다
          const byPos: Record<string, { id: string; picks: number }[]> = {}
          for (const [id, v] of Object.entries(data.players)) {
            const pos = posOf.get(id)
            if (!pos) continue
            ;(byPos[pos] ??= []).push({ id, picks: v.picks })
          }
          const byId: Record<string, PickStat> = {}
          for (const [, arr] of Object.entries(byPos)) {
            arr.sort((a, b) => b.picks - a.picks)
            arr.forEach((e, i) => {
              const v = data.players[e.id]
              byId[e.id] = {
                picks: v.picks,
                avgRound: v.avgRound,
                rate: Math.min(100, (v.picks / data.games) * 100),
                rankInPos: i + 1,
                posPicked: arr.length,
              }
            })
          }
          setStats({ games: data.games, byId })
        }
      )
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, playersLoaded])

  return stats
}
