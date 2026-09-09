"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Widget } from "./widgets"

interface HeldReport {
  gameId: string
  homeTeam: string
  awayTeam: string
  state: string
  reason: string | null
  missingNames: string[]
  since: string
  version: string | null
  used: number
  budget: number
  unresolved: number
}

export function ReportBudgetCard({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<HeldReport[] | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/match-reports", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "목록 조회 실패")
      setRows(data.rows)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "목록 조회 실패")
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  async function act(row: HeldReport, action: "resume" | "refresh") {
    setBusy(row.gameId)
    setMessage("")
    try {
      const response = await fetch("/api/admin/match-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          gameId: row.gameId,
          version: row.version,
          reason: reasons[row.gameId],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "처리 실패")
      setMessage(data.message)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리 실패")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Widget
      title="경기 리포트 보류"
      count={rows?.length}
      className="mt-4"
      headerRight={
        <button
          type="button"
          className="text-xs underline"
          onClick={() => {
            setMessage("")
            void reload()
          }}
        >
          새로고침
        </button>
      }
    >
      {message && (
        <p role="status" className="mb-2 text-sm">
          {message}
        </p>
      )}
      {rows === null ? (
        <p className="text-muted-foreground text-xs">목록을 불러오는 중입니다.</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">보류 중인 리포트가 없습니다.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.gameId} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/match/${row.gameId}`} className="font-semibold underline">
                  {row.homeTeam} vs {row.awayTeam}
                </Link>
                <span>
                  {row.state === "dictionary"
                    ? "선수 표기 대기"
                    : row.state === "held"
                      ? "예산 소진"
                      : "재시도 대기"}
                </span>
                {row.unresolved > 0 && <span>미결 예약 {row.unresolved}건</span>}
                <span>
                  작성 {row.used}/{row.budget}회
                </span>
                <span className="text-muted-foreground">
                  {Math.max(0, Math.floor((Date.now() - Date.parse(row.since)) / 3600_000))}시간
                  경과
                </span>
              </div>
              <p>{row.reason ?? "예약 결과를 확인하지 못했습니다."}</p>
              {row.missingNames.length > 0 && <p>부족한 이름: {row.missingNames.join(", ")}</p>}
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <input
                    aria-label={`${row.homeTeam} vs ${row.awayTeam} 재개 사유`}
                    placeholder="재개 사유 (3자 이상)"
                    maxLength={500}
                    className="rounded border px-2 py-1"
                    value={reasons[row.gameId] ?? ""}
                    onChange={(e) =>
                      setReasons((old) => ({ ...old, [row.gameId]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    disabled={
                      !!busy || !row.version || (reasons[row.gameId]?.trim().length ?? 0) < 3
                    }
                    onClick={() => void act(row, "resume")}
                  >
                    재개 · 예산 3회 추가
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    disabled={!!busy}
                    onClick={() => void act(row, "refresh")}
                  >
                    원문 다시 받기
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}
