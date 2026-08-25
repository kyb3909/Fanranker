"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "@/hooks/use-toast"

/**
 * 팀 스쿼드 사전 관리 (2026-08-16) — 선수 한글명 검수를 CSV 왕복으로.
 * 팀 사전(team-dictionary.tsx)과 같은 문법: 내려받기 → 편집 → 미리보기(dry_run) → 적용.
 * 적용된 행은 confirmed 로 확정되어 재수확(harvest-squads.ts)이 덮어쓰지 않는다.
 */

interface SquadRow {
  soccerway_team_id: string
  team_kr: string
  jersey: number | null
  position: string
  name_en: string
  player_slug: string
  name_kr: string
  status: string
}

interface ApiData {
  total: number
  unmatched: number
  rows: SquadRow[]
}

interface CsvResult {
  dry_run?: boolean
  would_update?: number
  updated?: number
  failed?: string[]
  skipped?: string[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TeamSquadsManager() {
  const { data, mutate } = useSWR<ApiData>("/api/admin/team-squads", fetcher)
  const [busy, setBusy] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [csvPlan, setCsvPlan] = useState<CsvResult | null>(null)
  const [openTeam, setOpenTeam] = useState<string | null>(null)

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])

  // 팀별 커버리지 — 비는 팀부터 보이게 정렬
  const teams = useMemo(() => {
    const by = new Map<string, { id: string; team: string; total: number; matched: number }>()
    for (const r of rows) {
      const t = by.get(r.soccerway_team_id) ?? {
        id: r.soccerway_team_id,
        team: r.team_kr || r.soccerway_team_id,
        total: 0,
        matched: 0,
      }
      t.total++
      if (r.name_kr) t.matched++
      by.set(r.soccerway_team_id, t)
    }
    return [...by.values()].sort(
      (a, b) => a.matched / a.total - b.matched / b.total || a.team.localeCompare(b.team, "ko")
    )
  }, [rows])

  const runCsv = async (dry: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/team-squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "csv_import", csv: csvText, dry_run: dry }),
      })
      const d = (await res.json().catch(() => ({}))) as CsvResult & { error?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "실패", description: d.error ?? "처리 실패" })
        return
      }
      setCsvPlan(d)
      if (!dry) {
        toast({
          title: "CSV 반영 완료",
          description: `확정 ${d.updated ?? 0}건 · 건너뜀 ${d.skipped?.length ?? 0}건 · 실패 ${d.failed?.length ?? 0}건`,
        })
        void mutate()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 요약 */}
      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "선수", value: data?.total ?? "—" },
          { label: "한글 확보", value: data ? data.total - data.unmatched : "—" },
          { label: "검수 대기 (빈칸)", value: data?.unmatched ?? "—" },
        ].map((c) => (
          <div key={c.label} className="bg-background rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="text-foreground text-xl font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </section>

      {/* CSV 왕복 */}
      <section className="bg-background rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">CSV 일괄 검수</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            내려받아 <code>name_kr</code> 열만 채우거나 고쳐서 되올리면 해당 행이 <b>확정</b>
            됩니다. 빈 칸은 건너뛰므로(지워지지 않음) 아는 선수만 채워도 됩니다. 확정 행은 재수확이
            덮어쓰지 않습니다.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/admin/team-squads?format=csv"
              className="rounded border px-3 py-1.5 text-xs font-medium"
            >
              전체 CSV 내려받기
            </a>
            <a
              href="/api/admin/team-squads?format=csv&missing=1"
              className="rounded border px-3 py-1.5 text-xs font-medium"
            >
              빈칸만 내려받기
            </a>
            <label className="cursor-pointer rounded border px-3 py-1.5 text-xs font-medium">
              CSV 파일 선택
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setCsvText(await f.text())
                  setCsvPlan(null)
                  e.target.value = ""
                }}
              />
            </label>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value)
              setCsvPlan(null)
            }}
            rows={csvText ? 8 : 3}
            placeholder={
              "여기에 CSV 를 붙여넣어도 됩니다. 필수 열: soccerway_team_id, player_slug, name_kr"
            }
            className="bg-background w-full rounded border p-2 font-mono text-[12px]"
          />

          {csvText.trim() && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void runCsv(true)}
                disabled={busy}
                className="rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                미리보기 (쓰기 없음)
              </button>
              <button
                onClick={() => void runCsv(false)}
                disabled={busy || !csvPlan}
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                title={csvPlan ? undefined : "먼저 미리보기를 실행하세요"}
              >
                적용 (확정)
              </button>
            </div>
          )}

          {csvPlan && (
            <div className="rounded-lg border px-3 py-2 text-[12px]">
              <p>
                {csvPlan.dry_run ? "반영 예정" : "확정"}{" "}
                <b>{csvPlan.would_update ?? csvPlan.updated ?? 0}</b>건 · 건너뜀{" "}
                {csvPlan.skipped?.length ?? 0}건
                {(csvPlan.failed?.length ?? 0) > 0 && (
                  <span className="font-semibold text-red-600">
                    {" "}
                    · 실패 {csvPlan.failed!.length}건
                  </span>
                )}
              </p>
              {(csvPlan.skipped?.length ?? 0) > 0 && (
                <p className="text-muted-foreground mt-1 line-clamp-3">
                  건너뜀: {csvPlan.skipped!.slice(0, 8).join(", ")}
                  {csvPlan.skipped!.length > 8 && " …"}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 팀별 커버리지 — 비는 팀부터 */}
      <section className="bg-background rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">팀별 커버리지</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            비는 팀부터 정렬. 팀을 누르면 선수 목록이 열립니다. K·J리그는 나무위키 스쿼드 표에
            로마자 열이 없어 자동 대조가 안 됐던 팀들입니다 — 수동 검수 대상.
          </p>
        </div>
        <ul className="divide-y">
          {teams.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setOpenTeam(openTeam === t.id ? null : t.id)}
                className="hover:bg-muted/40 flex w-full items-center justify-between px-4 py-2 text-left text-sm"
              >
                <span className="font-medium">{t.team}</span>
                <span
                  className={`tabular-nums ${t.matched === 0 ? "font-semibold text-red-600" : t.matched < t.total ? "text-amber-600" : "text-emerald-600"}`}
                >
                  {t.matched}/{t.total}
                </span>
              </button>
              {openTeam === t.id && (
                <ul className="bg-muted/20 px-4 py-2 text-xs">
                  {rows
                    .filter((r) => r.soccerway_team_id === t.id)
                    .map((r) => (
                      <li key={r.player_slug} className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">
                          {r.jersey != null ? `${r.jersey} ` : ""}
                          {r.position} · {r.name_en}
                        </span>
                        <span className={r.name_kr ? "" : "text-red-600"}>
                          {r.name_kr || "빈칸"}
                          {r.status === "confirmed" && " ✓"}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
