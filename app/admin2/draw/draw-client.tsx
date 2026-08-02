"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { WeeklyDrawStage } from "@/components/admin/weekly-draw-stage"

/**
 * 주간 추첨 운영 화면.
 *
 * 흐름: 월요일 cron 이 후보를 확정 → 여기서 [추첨 실행] → 서버가 뽑아 저장 →
 *      무대 컴포넌트가 그 결과를 연출(녹화용) → 발표 글 자동 게시.
 *
 * 재추첨은 서버가 막는다(멱등). 이미 뽑힌 회차는 결과만 다시 재생할 수 있다.
 */

interface Candidate {
  user_id: string
  nickname: string
  total_points: number
  community_actions: number
}
interface Winner {
  user_id: string
  nickname: string
}
interface DrawRow {
  candidates: Candidate[]
  candidate_count: number
  candidates_hash: string | null
  snapshot_at: string | null
  winners: Winner[] | null
  winner_count: number
  drawn_at: string | null
  announced_post_id: string | null
}
interface State {
  ok: boolean
  event: { status: string } | null
  weekStart?: string
  draw?: DrawRow | null
}

export function DrawClient() {
  const { data, isLoading, mutate } = useSWR<State>("/api/admin/season/weekly-draw", fetcher)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draw = data?.draw ?? null
  const weekStart = data?.weekStart ?? ""

  async function runDraw(snapshotIfMissing: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/season/weekly-draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot_if_missing: snapshotIfMissing }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? "추첨에 실패했습니다.")
        return
      }
      await mutate()
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">불러오는 중…</p>
  if (!data?.event) {
    return <p className="text-muted-foreground text-sm">시즌 이벤트가 아직 없습니다.</p>
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-lg font-bold">주간 추첨</h1>
        <p className="text-muted-foreground text-sm">
          응모 자격 충족자 중 매주 {draw?.winner_count ?? 5}명. 후보 명단은 월요일에 자동 확정되고,
          추첨만 여기서 실행합니다 — 그 화면을 그대로 녹화해 쓰면 됩니다.
        </p>
      </header>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!draw && (
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            <b>{weekStart}</b> 회차 후보가 아직 확정되지 않았습니다. 월요일 00:05(KST)에 자동
            확정됩니다.
          </p>
          <button
            type="button"
            onClick={() => runDraw(true)}
            disabled={busy}
            className="mt-3 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            {busy ? "처리 중…" : "지금 확정하고 추첨 (리허설·긴급용)"}
          </button>
        </div>
      )}

      {draw && !draw.drawn_at && (
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            후보 <b>{draw.candidate_count}명</b> 확정됨
            {draw.snapshot_at && (
              <span className="text-muted-foreground">
                {" "}
                · {new Date(draw.snapshot_at).toLocaleString("ko-KR")}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => runDraw(false)}
            disabled={busy || draw.candidate_count === 0}
            className="mt-3 rounded-md px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "var(--wc-burgundy, #8b1e3f)" }}
          >
            {busy ? "추첨 중…" : "추첨 실행"}
          </button>
          {draw.candidate_count === 0 && (
            <p className="text-muted-foreground mt-2 text-xs">
              자격을 충족한 후보가 없어 추첨할 수 없습니다.
            </p>
          )}
        </div>
      )}

      {draw?.drawn_at && draw.winners && (
        <>
          <WeeklyDrawStage
            candidates={draw.candidates}
            winners={draw.winners}
            weekStart={weekStart}
            candidatesHash={draw.candidates_hash}
          />
          <p className="text-muted-foreground text-xs">
            {new Date(draw.drawn_at).toLocaleString("ko-KR")} 추첨 완료
            {draw.announced_post_id && (
              <>
                {" · "}
                <a
                  href={`/post/${draw.announced_post_id}`}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  발표 글 보기
                </a>
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
