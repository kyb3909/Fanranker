"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"

/**
 * 팀 사전 + 경기 매핑 관리 (실록 단계 2-B)
 *
 * 세 구역:
 *  1. 미등재 팀 큐 — 매핑 shadow 가 "모르는 팀"으로 보고한 한글 표기.
 *     기존 팀 별칭으로 흡수하거나, soccerway 팀 URL 로 신규 등재 (1클릭 원칙).
 *  2. 매핑 제안 — shadow 가 "이 경기다"라고 제안한 대조 결과 (골든셋 라벨의 원천).
 *  3. 사전 목록 — proposed → confirmed 승격 (오너 확정, 실기록 자격).
 */

interface TeamRow {
  soccerway_team_id: string
  slug: string
  name_en: string
  name_kr: string | null
  aliases_kr: string[]
  status: "proposed" | "confirmed" | "rejected"
  source: string
  created_at: string
}

interface UnresolvedRow {
  name: string
  hits: number
  latest: string
}

interface ProposalRow {
  pageHomeEn: string | null
  pageAwayEn: string | null
  pageDate: string | null
  pageTournament: string | null
  homeAwayFlip: boolean | null
  candidateUrl: string | null
  gameCount: number
  latest: string
}

interface ApiData {
  teams: TeamRow[]
  unresolved: UnresolvedRow[]
  proposals: ProposalRow[]
  outcomeCounts: Record<string, number>
}

const STATUS_LABEL: Record<TeamRow["status"], { text: string; cls: string }> = {
  proposed: { text: "제안됨", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmed: { text: "확정", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { text: "제외", cls: "bg-muted text-muted-foreground border-border" },
}

export function TeamDictionaryManager() {
  const { data, mutate } = useSWR<ApiData>("/api/admin/team-dictionary", fetcher)
  const [busy, setBusy] = useState(false)
  const [aliasTarget, setAliasTarget] = useState<Record<string, string>>({})
  const [registerUrl, setRegisterUrl] = useState<Record<string, string>>({})

  const teams = data?.teams ?? []
  const activeTeams = teams.filter((t) => t.status !== "rejected")
  const unresolved = data?.unresolved ?? []
  const proposals = data?.proposals ?? []
  const counts = data?.outcomeCounts ?? {}

  const send = async (body: Record<string, unknown>, ok: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/team-dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; merged_into?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "실패", description: d.error ?? "처리 실패" })
        return
      }
      toast({
        title: ok,
        description: d.merged_into ? `"${d.merged_into}" 팀에 흡수했습니다.` : undefined,
      })
      void mutate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 매핑 현황 요약 */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ["proposed", "매핑 제안"],
          ["team_unresolved", "미등재 팀"],
          ["ambiguous", "모호(검수)"],
          ["no_candidate", "쌍 없음"],
          ["fetch_error", "수집 실패"],
        ].map(([key, label]) => (
          <span key={key} className="bg-muted rounded-full px-3 py-1">
            {label} <b className="tabular-nums">{counts[key] ?? 0}</b>
          </span>
        ))}
        <span className="text-muted-foreground self-center">최근 14일 · 마켓별 행 기준</span>
      </div>

      {/* 1. 미등재 팀 큐 */}
      <section className="bg-background rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            미등재 팀 큐{" "}
            <span className="text-muted-foreground font-normal">
              {unresolved.length}건 — 매핑을 막은 이름
            </span>
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            등재하면 다음 매핑 스캔부터 자동으로 다시 시도합니다. 신규 등재는 soccerway 팀 페이지
            URL 을 붙여넣으세요 (서버가 해시를 검증·추출).
          </p>
        </div>
        <ul className="divide-y">
          {unresolved.length === 0 && (
            <li className="text-muted-foreground py-6 text-center text-xs">막힌 팀이 없습니다.</li>
          )}
          {unresolved.map((u) => (
            <li key={u.name} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{u.name}</span>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {u.hits}회 차단
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">기존 팀의 별칭으로</span>
                <select
                  value={aliasTarget[u.name] ?? ""}
                  onChange={(e) => setAliasTarget((p) => ({ ...p, [u.name]: e.target.value }))}
                  className="bg-background max-w-[220px] rounded border px-2 py-1"
                >
                  <option value="">팀 선택…</option>
                  {activeTeams.map((t) => (
                    <option key={t.soccerway_team_id} value={t.soccerway_team_id}>
                      {t.name_kr ?? t.name_en} ({t.name_en})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    void send(
                      {
                        mode: "alias",
                        soccerway_team_id: aliasTarget[u.name],
                        alias: u.name,
                      },
                      "별칭으로 흡수"
                    )
                  }
                  disabled={busy || !aliasTarget[u.name]}
                  className="rounded border px-2 py-1 disabled:opacity-50"
                >
                  흡수
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">또는 새 팀으로</span>
                <input
                  value={registerUrl[u.name] ?? ""}
                  onChange={(e) => setRegisterUrl((p) => ({ ...p, [u.name]: e.target.value }))}
                  placeholder="https://www.soccerway.com/team/…/"
                  className="w-[280px] max-w-full rounded border px-2 py-1"
                />
                <button
                  onClick={() =>
                    void send(
                      { mode: "register", url: registerUrl[u.name]?.trim(), name_kr: u.name },
                      "새 팀 등재"
                    )
                  }
                  disabled={busy || !registerUrl[u.name]?.trim()}
                  className="rounded bg-emerald-600 px-2.5 py-1 font-medium text-white disabled:opacity-50"
                >
                  등재
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. 매핑 제안 (shadow) */}
      <section className="bg-background rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            매핑 제안{" "}
            <span className="text-muted-foreground font-normal">
              {proposals.length}경기 — shadow 대조 성공분
            </span>
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            아직 관찰만 합니다 — betman 데이터에 기록하지 않습니다. 이 목록이 쌓이면 골든셋
            라벨(50쌍)의 원천이 됩니다. <b>홈/원정 뒤집힘</b> 표시는 betman 과 soccerway 의 홈팀이
            다르다는 뜻(자동 수정 안 함).
          </p>
        </div>
        <ul className="divide-y">
          {proposals.length === 0 && (
            <li className="text-muted-foreground py-6 text-center text-xs">
              아직 제안이 없습니다. (cron 은 매시 41분 · MATCH_MAPPING_SHADOW=shadow 필요)
            </li>
          )}
          {proposals.map((p) => (
            <li
              key={`${p.candidateUrl}|${p.pageDate}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span className="font-medium">
                {p.pageHomeEn ?? "?"} <span className="text-muted-foreground">v</span>{" "}
                {p.pageAwayEn ?? "?"}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">{p.pageDate}</span>
              <span className="text-muted-foreground max-w-[260px] truncate text-xs">
                {p.pageTournament}
              </span>
              {p.homeAwayFlip === true && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                  홈/원정 뒤집힘
                </span>
              )}
              <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                마켓 {p.gameCount}행
              </span>
              {p.candidateUrl && (
                <a
                  href={p.candidateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary text-[11px] underline underline-offset-2"
                >
                  soccerway ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 3. 사전 목록 */}
      <section className="bg-background rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            팀 사전{" "}
            <span className="text-muted-foreground font-normal">
              {teams.length}팀 · 확정 {teams.filter((t) => t.status === "confirmed").length}
            </span>
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            <b>확정</b>은 &ldquo;이 대응이 맞다&rdquo;는 오너 라벨입니다 — 매핑 관찰은 제안됨
            상태로도 돌지만, 나중에 실기록은 확정 팀만 씁니다.
          </p>
        </div>
        <ul className="divide-y">
          {teams.map((t) => {
            const s = STATUS_LABEL[t.status]
            return (
              <li
                key={t.soccerway_team_id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm"
              >
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${s.cls}`}>
                  {s.text}
                </span>
                <span className="font-medium">{t.name_kr ?? "—"}</span>
                <span className="text-muted-foreground text-xs">{t.name_en}</span>
                {t.aliases_kr.length > 0 && (
                  <span className="text-muted-foreground max-w-[240px] truncate text-[11px]">
                    별칭: {t.aliases_kr.join(", ")}
                  </span>
                )}
                <span className="text-muted-foreground/60 font-mono text-[10px]">
                  {t.soccerway_team_id}
                </span>
                <span className="ml-auto flex gap-1.5">
                  {t.status === "proposed" && (
                    <button
                      onClick={() =>
                        void send(
                          { mode: "confirm", soccerway_team_id: t.soccerway_team_id },
                          `"${t.name_kr ?? t.name_en}" 확정`
                        )
                      }
                      disabled={busy}
                      className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      확정
                    </button>
                  )}
                  {t.status !== "rejected" && (
                    <button
                      onClick={() =>
                        void send(
                          { mode: "reject", soccerway_team_id: t.soccerway_team_id },
                          "사전에서 제외"
                        )
                      }
                      disabled={busy}
                      className="text-muted-foreground rounded border px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      제외
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
