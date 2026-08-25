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
  /** 기계 생성 후보 — 화면(라인업 등)에는 안 나가고 이 검수 지면에서만 보인다 */
  name_kr_draft: string
  status: string
}

interface ApiData {
  total: number
  unmatched: number
  drafted: number
  /** 팀 한글명 → 리그 코드 (최근 90일 경기로 역산) */
  leagueOf: Record<string, string>
  rows: SquadRow[]
}

/**
 * 리그 표시 순서 — 유럽 대항전 → 5대 리그 → 나머지.
 * ⚠️ 여기 없는 코드는 뒤에 알파벳순으로 붙는다. 목록을 늘릴 때 순서만 신경 쓰면 된다.
 */
const LEAGUE_ORDER = ["UCL", "UEL", "UECL", "EPL", "라리가", "세리에A", "분데스리", "프리그1"]
const LEAGUE_LABEL: Record<string, string> = {
  UCL: "챔피언스리그",
  UEL: "유로파리그",
  UECL: "컨퍼런스리그",
  EPL: "프리미어리그",
  라리가: "라리가",
  세리에A: "세리에 A",
  분데스리: "분데스리가",
  프리그1: "리그 1",
}

interface SyncResult {
  inserted: number
  existing: number
  conflicts: { romanized: string; squad: string; news: string; newsId: string }[]
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
  /** 화면에서 고친 값 — `팀id|player_slug` → 한글명. 저장 전까지 여기에만 있다 */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [league, setLeague] = useState<string>("전체")
  const [sync, setSync] = useState<SyncResult | null>(null)

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])

  /** 실제로 바뀐 것만 센다 — 눌러만 보고 원래대로 둔 건 제외 */
  const dirtyRows = useMemo(() => {
    const byKey = new Map(rows.map((r) => [`${r.soccerway_team_id}|${r.player_slug}`, r]))
    return Object.entries(drafts)
      .filter(([k, v]) => {
        const r = byKey.get(k)
        return r && v.trim() && v.trim() !== r.name_kr
      })
      .map(([k, v]) => {
        const [soccerway_team_id, player_slug] = k.split("|")
        return { soccerway_team_id, player_slug, name_kr: v.trim() }
      })
  }, [drafts, rows])
  const dirtyCount = dirtyRows.length

  const saveDrafts = async () => {
    if (busy || dirtyCount === 0) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/team-squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inline_save", rows: dirtyRows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "저장 실패")
      const skipped = (json.skipped ?? []) as string[]
      toast({
        title: `${json.updated ?? 0}명 반영`,
        description: skipped.length
          ? `건너뜀 ${skipped.length}건: ${skipped[0]}`
          : "확정되었습니다",
      })
      setDrafts({})
      await mutate()
    } catch (e) {
      toast({ title: "저장 실패", description: e instanceof Error ? e.message : "알 수 없는 오류" })
    } finally {
      setBusy(false)
    }
  }

  // 팀별 커버리지 — 비는 팀부터 보이게 정렬
  const allTeams = useMemo(() => {
    const by = new Map<
      string,
      { id: string; team: string; total: number; matched: number; drafted: number; league: string }
    >()
    for (const r of rows) {
      const teamName = r.team_kr || r.soccerway_team_id
      const t = by.get(r.soccerway_team_id) ?? {
        id: r.soccerway_team_id,
        team: teamName,
        total: 0,
        matched: 0,
        drafted: 0,
        league: data?.leagueOf?.[teamName] ?? "기타",
      }
      t.total++
      if (r.name_kr) t.matched++
      else if (r.name_kr_draft) t.drafted++
      by.set(r.soccerway_team_id, t)
    }
    return [...by.values()].sort(
      (a, b) => a.matched / a.total - b.matched / b.total || a.team.localeCompare(b.team, "ko")
    )
  }, [rows, data?.leagueOf])

  /** 리그 탭 — 검수할 게 남은 리그부터 (다 끝난 리그를 먼저 보여줄 이유가 없다) */
  const leagues = useMemo(() => {
    const by = new Map<string, { code: string; teams: number; pending: number }>()
    for (const t of allTeams) {
      const e = by.get(t.league) ?? { code: t.league, teams: 0, pending: 0 }
      e.teams++
      e.pending += t.total - t.matched
      by.set(t.league, e)
    }
    return [...by.values()].sort((a, b) => {
      const ai = LEAGUE_ORDER.indexOf(a.code)
      const bi = LEAGUE_ORDER.indexOf(b.code)
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
      return a.code.localeCompare(b.code, "ko")
    })
  }, [allTeams])

  const teams = useMemo(
    () => (league === "전체" ? allTeams : allTeams.filter((t) => t.league === league)),
    [allTeams, league]
  )

  const confirmTeam = async (teamId: string) => {
    if (busy) return
    setBusy(true)
    try {
      // 이 팀에서 화면으로 고친 것만 추려 같이 보낸다 (후보 대신 이 값이 쓰인다)
      const edits: Record<string, string> = {}
      for (const [k, v] of Object.entries(drafts)) {
        const [tid, slug] = k.split("|")
        if (tid === teamId && v.trim()) edits[slug] = v.trim()
      }
      const res = await fetch("/api/admin/team-squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_team", soccerway_team_id: teamId, edits }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "확정 실패")
      const skipped = (json.skipped ?? []) as string[]
      toast({
        title: `${json.confirmed ?? 0}명 확정`,
        description: skipped.length ? `후보 없어 남김 ${skipped.length}명` : "이 팀 검수 완료",
      })
      setDrafts((d) => {
        const next = { ...d }
        for (const k of Object.keys(next)) if (k.startsWith(`${teamId}|`)) delete next[k]
        return next
      })
      await mutate()
    } catch (e) {
      toast({ title: "확정 실패", description: e instanceof Error ? e.message : "알 수 없는 오류" })
    } finally {
      setBusy(false)
    }
  }

  /** 스쿼드 사전 → 뉴스 사전. 없는 것만 넣고 충돌은 아래 목록으로 보고한다 */
  const runSync = async (apply: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/team-squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_news", apply }),
      })
      const json = (await res.json()) as SyncResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? "동기화 실패")
      setSync(json)
      toast({
        title: apply ? `기사 사전에 ${json.inserted}명 반영` : `반영 예정 ${json.inserted}명`,
        description: json.conflicts.length
          ? `표기 충돌 ${json.conflicts.length}건 — 아래에서 골라주세요`
          : "충돌 없음",
      })
    } catch (e) {
      toast({ title: "동기화 실패", description: e instanceof Error ? e.message : "오류" })
    } finally {
      setBusy(false)
    }
  }

  /** 충돌 하나를 해결 — 어느 쪽 표기로 통일할지 사람이 고른다 */
  const resolveConflict = async (c: SyncResult["conflicts"][number], winner: "squad" | "news") => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/team-squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_conflict",
          romanized: c.romanized,
          winner,
          news_id: c.newsId,
          value: winner === "squad" ? c.squad : c.news,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "해결 실패")
      setSync((s) =>
        s ? { ...s, conflicts: s.conflicts.filter((x) => x.romanized !== c.romanized) } : s
      )
      toast({ title: `${c.romanized} → ${winner === "squad" ? c.squad : c.news}` })
      await mutate()
    } catch (e) {
      toast({ title: "해결 실패", description: e instanceof Error ? e.message : "오류" })
    } finally {
      setBusy(false)
    }
  }

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

      {/* 기사 사전 동기화 — 확정된 표기를 뉴스 파이프라인에도 흘려보낸다 */}
      <section className="bg-background rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">기사 사전에 반영</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            이 사전은 <b>라인업·스탯·매치센터</b>가 읽고, 기사는 <b>별도 사전</b>을 읽습니다. 여기서
            확정한 표기를 기사 쪽에도 흘려보냅니다.
            <br />
            ⚠️ <b>덮어쓰지 않습니다</b> — 기사 사전에 이미 있으면 건드리지 않고, 표기가 다르면
            아래에 띄워 직접 고르시게 합니다. 확정(<b>confirmed</b>)된 것만 보냅니다.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void runSync(false)}
              disabled={busy}
              className="rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              미리보기 (쓰기 없음)
            </button>
            <button
              onClick={() => void runSync(true)}
              disabled={busy || !sync}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              title={sync ? undefined : "먼저 미리보기를 실행하세요"}
            >
              기사 사전에 반영
            </button>
          </div>

          {sync && (
            <p className="text-xs">
              새로 넣을 것 <b className="tabular-nums">{sync.inserted}</b>명 · 이미 있음{" "}
              <span className="tabular-nums">{sync.existing}</span>명
              {sync.conflicts.length > 0 && (
                <span className="ml-2 font-bold text-amber-600">
                  표기 충돌 {sync.conflicts.length}건
                </span>
              )}
            </p>
          )}

          {(sync?.conflicts.length ?? 0) > 0 && (
            <div className="rounded-lg border">
              <p className="text-muted-foreground border-b px-3 py-2 text-xs">
                양쪽 표기가 다릅니다. <b>어느 쪽도 자동으로 이기지 않습니다</b> — 골라주시면 그
                값으로 통일합니다.
              </p>
              <ul className="divide-y">
                {sync!.conflicts.map((c) => (
                  <li key={c.romanized} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="text-muted-foreground min-w-[10rem] flex-1 truncate text-xs">
                      {c.romanized}
                    </span>
                    <button
                      onClick={() => void resolveConflict(c, "squad")}
                      disabled={busy}
                      className="rounded border px-2.5 py-1 text-xs hover:bg-emerald-50 disabled:opacity-50"
                      title="이 표기로 기사 사전을 맞춥니다"
                    >
                      {c.squad}
                      <span className="text-muted-foreground ml-1">(라인업)</span>
                    </button>
                    <button
                      onClick={() => void resolveConflict(c, "news")}
                      disabled={busy}
                      className="rounded border px-2.5 py-1 text-xs hover:bg-emerald-50 disabled:opacity-50"
                      title="이 표기로 스쿼드 사전을 맞춥니다"
                    >
                      {c.news}
                      <span className="text-muted-foreground ml-1">(기사)</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
          <h2 className="text-sm font-semibold">팀별 검수</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            리그를 고르고 팀을 누르면 선수 목록이 열립니다. 회색 글씨는 <b>기계가 만든 후보</b>로
            아직 화면에 안 나갑니다 — 고칠 것만 고치고 <b>이 팀 확정</b>을 누르면 그때 반영됩니다.
          </p>
        </div>

        {/* 리그 탭 — 검수할 게 남은 리그부터 */}
        <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
          {[
            { code: "전체", teams: allTeams.length, pending: data?.unmatched ?? 0 },
            ...leagues,
          ].map((lg) => (
            <button
              key={lg.code}
              onClick={() => {
                setLeague(lg.code)
                setOpenTeam(null)
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                league === lg.code
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {LEAGUE_LABEL[lg.code] ?? lg.code}
              {lg.pending > 0 && (
                <span className="ml-1.5 tabular-nums opacity-70">{lg.pending}</span>
              )}
            </button>
          ))}
        </div>
        <ul className="divide-y">
          {teams.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setOpenTeam(openTeam === t.id ? null : t.id)}
                className="hover:bg-muted/40 flex w-full items-center justify-between px-4 py-2 text-left text-sm"
              >
                <span className="font-medium">
                  {t.team}
                  {t.drafted > 0 && (
                    <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[12px] font-bold text-sky-700">
                      후보 {t.drafted}
                    </span>
                  )}
                </span>
                <span
                  className={`tabular-nums ${t.matched === 0 ? "font-semibold text-red-600" : t.matched < t.total ? "text-amber-600" : "text-emerald-600"}`}
                >
                  {t.matched}/{t.total}
                </span>
              </button>
              {openTeam === t.id && (
                <div className="bg-muted/20 px-4 py-3">
                  {/* ⚠️ 종전엔 읽기 전용이었다 — 한 명만 고쳐도 CSV 를 내려받아 엑셀로 열고
                      다시 붙여넣어야 했다 (2026-08-25 운영자: "수정할 것만 고친 다음에
                      반영"). 여기서 바로 고친다. 규칙(한글 형식·confirmed 승격)은 CSV 경로와
                      **같은 것**을 쓴다 — 여기만 느슨하면 우회로가 된다. */}
                  <ul className="space-y-1 text-xs">
                    {rows
                      .filter((r) => r.soccerway_team_id === t.id)
                      .map((r) => {
                        const key = `${r.soccerway_team_id}|${r.player_slug}`
                        const edited = drafts[key]
                        // ⚠️ 확정값(name_kr)이 있으면 그것, 없으면 **기계 후보**를 채워 보여준다.
                        //    후보는 화면(라인업)엔 안 나가므로 여기서 보이는 게 유일한 검수 기회다.
                        const base = r.name_kr || r.name_kr_draft
                        const value = edited ?? base
                        const dirty = edited != null && edited !== base
                        const isDraftOnly = !r.name_kr && !!r.name_kr_draft
                        return (
                          <li key={r.player_slug} className="flex items-center gap-2">
                            <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">
                              {r.jersey ?? ""}
                            </span>
                            <span className="text-muted-foreground w-8 shrink-0">{r.position}</span>
                            <span className="min-w-0 flex-1 truncate" title={r.name_en}>
                              {r.name_en}
                            </span>
                            <input
                              value={value}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              placeholder="한글명"
                              aria-label={`${r.name_en} 한글명`}
                              className={`w-40 shrink-0 rounded border px-2 py-1 ${
                                dirty
                                  ? "border-amber-400 bg-amber-50"
                                  : r.name_kr
                                    ? "bg-background"
                                    : isDraftOnly
                                      ? "border-sky-300 bg-sky-50 text-sky-900" // 미확정 후보
                                      : "border-red-300 bg-red-50" // 후보조차 없음
                              }`}
                            />
                            <span className="w-4 shrink-0 text-emerald-600">
                              {r.status === "confirmed" ? "✓" : ""}
                            </span>
                          </li>
                        )
                      })}
                  </ul>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={saveDrafts}
                      disabled={busy || dirtyCount === 0}
                      className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                    >
                      {dirtyCount > 0 ? `수정한 ${dirtyCount}명 반영` : "수정한 항목 없음"}
                    </button>
                    {dirtyCount > 0 && (
                      <button
                        onClick={() => setDrafts({})}
                        disabled={busy}
                        className="text-muted-foreground text-xs underline"
                      >
                        되돌리기
                      </button>
                    )}
                    <span className="mx-auto" />
                    <button
                      onClick={() => void confirmTeam(t.id)}
                      disabled={busy || t.matched === t.total}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      title="파란 후보를 그대로 확정합니다. 고친 것이 있으면 고친 값이 우선입니다."
                    >
                      {t.matched === t.total
                        ? "이 팀 검수 완료"
                        : `이 팀 확정 (${t.total - t.matched}명)`}
                    </button>
                  </div>
                  <p className="text-muted-foreground mt-2 text-[12px]">
                    <span className="rounded bg-sky-50 px-1 text-sky-800">파란 칸</span> = 기계 후보
                    (아직 화면에 안 나감) ·{" "}
                    <span className="rounded bg-red-50 px-1 text-red-700">빨간 칸</span> = 후보도
                    없음 · 확정하면 <b>confirmed</b> 로 잠겨 자동 수확이 덮어쓰지 않습니다.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
