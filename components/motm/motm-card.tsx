"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { trackEvent } from "@/lib/analytics/events"
import type { MotmOption } from "@/lib/motm/poll"

/**
 * 팬 선정 MoTM — 매치센터 MoTM 탭 전용 (2026-08-22).
 *
 * 지면은 실록(매치센터) 한 곳뿐이다 — 운영자: "시즌 첫 경기 실록까지만 정리".
 * 피드·불판 확장은 별도 결정 없이는 하지 않는다 (저니맵 문서는 workspace 목업 참조).
 *
 * 상태 셋: 투표 전(선수 그리드 인라인) → 투표 후(내 픽 + 분포, 픽 변경 가능) →
 * 확정(전체 분포 영속). 후보 = 출전 선수 전원 (운영자 확정 — 2택 스펙 폐기).
 *
 * 투표는 기존 POST /api/polls/[id]/vote 재사용(유저당 1표, 재호출 = 갱신), 집계는
 * GET /api/motm/[pollId]. 퍼센트는 CardVsVote 와 같은 임계(3표↑) — 그 전엔 실수/"첫 표".
 * 디자인 가드레일: 픽 카드 다크 금지 → 전면 라이트, 좌측 액센트 보더 금지 → 틴트·바로만.
 */

const SHOW_PCT_MIN_VOTES = 3
const BURGUNDY = "var(--wc-burgundy, #961e37)"
const INK = "var(--wc-ink, #1a1714)"
const MUTE = "var(--wc-mute, #5c6470)"
const MUTE2 = "var(--wc-mute-2, #8a8f98)"
const LINE = "var(--wc-line, #e8e5e0)"
const SURFACE = "motm_match" as const

interface PollData {
  pollId: string
  question: string
  options: MotmOption[]
  results: Record<string, number>
  total: number
  myKey: string | null
  closed: boolean
}

export function MotmCard({ pollId }: { pollId: string }) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [data, setData] = useState<PollData | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false) // 투표 후 "픽 변경" 재진입
  const [picked, setPicked] = useState<string | null>(null)
  const [team, setTeam] = useState<"home" | "away">("home")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/motm/${pollId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: PollData) => {
        if (!alive) return
        setData(d)
        setPicked(d.myKey)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [pollId])

  // 노출 계측 — CardVsVote 와 같은 세션 dedupe 문법
  useEffect(() => {
    const storageKey = `vs-seen-${SURFACE}`
    try {
      const seen = JSON.parse(sessionStorage.getItem(storageKey) || "{}")
      if (!seen[pollId]) {
        seen[pollId] = 1
        sessionStorage.setItem(storageKey, JSON.stringify(seen))
        trackEvent({ name: "vs_impression", params: { poll_id: pollId, surface: SURFACE } })
      }
    } catch {
      trackEvent({ name: "vs_impression", params: { poll_id: pollId, surface: SURFACE } })
    }
  }, [pollId])

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data.options].sort((a, b) => (data.results[b.key] ?? 0) - (data.results[a.key] ?? 0))
  }, [data])

  if (failed) return null
  const optionByKey = new Map((data?.options ?? []).map((o) => [o.key, o]))
  const leader: MotmOption | undefined = sorted[0]
  const leaderVotes = data && leader ? (data.results[leader.key] ?? 0) : 0
  const showPct = !!data && data.total >= SHOW_PCT_MIN_VOTES && leaderVotes > 0
  const pctOf = (key: string) =>
    data && data.total > 0 ? Math.round(((data.results[key] ?? 0) / data.total) * 100) : 0
  const leaderPct = leader ? pctOf(leader.key) : 0

  function openPicker() {
    if (!data || data.closed) return
    setPicked(data.myKey)
    setEditing(true)
    trackEvent({ name: "motm_sheet_open", params: { poll_id: pollId, surface: SURFACE } })
  }

  async function confirmVote() {
    if (!data || !picked || busy || picked === data.myKey) {
      setEditing(false)
      return
    }
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionKey: picked }),
      })
      if (!res.ok) throw new Error()
      const out = (await res.json()) as {
        results: Record<string, number>
        total: number
        myVote: { optionKey: string }
      }
      setData({ ...data, results: out.results, total: out.total, myKey: out.myVote.optionKey })
      setEditing(false)
      trackEvent({
        name: "vs_vote",
        params: { poll_id: pollId, option_key: picked, surface: SURFACE },
      })
    } catch {
      /* 실패 시 상태 유지 — 그리드를 열어 두어 재시도 가능 */
    } finally {
      setBusy(false)
    }
  }

  /* ── 분포 바 목록 (확정·투표 후 공용) ── */
  const distributionRows = (limit: number | null) => {
    if (!data) return null
    const positive = sorted.filter((o) => (data.results[o.key] ?? 0) > 0)
    const listed = limit == null ? positive : positive.slice(0, limit)
    const restCount = positive.length - listed.length
    const restVotes = data.total - listed.reduce((s, o) => s + (data.results[o.key] ?? 0), 0)
    const barColors = [BURGUNDY, "#2c4a6e", MUTE2]
    return (
      <>
        <div className="mt-2 flex flex-col gap-1.5">
          {listed.map((o, i) => (
            <div key={o.key} className="flex items-center gap-2 text-[12px]">
              <span
                className="w-[86px] truncate font-bold"
                style={{ color: INK, wordBreak: "keep-all" }}
              >
                {o.label}
              </span>
              <span
                className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full"
                style={{ background: "var(--wc-soft, #f2efea)" }}
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(4, pctOf(o.key))}%`,
                    background: barColors[Math.min(i, barColors.length - 1)],
                  }}
                />
              </span>
              <span className="w-9 text-right font-bold tabular-nums" style={{ color: MUTE }}>
                {showPct ? `${pctOf(o.key)}%` : `${data.results[o.key] ?? 0}표`}
              </span>
            </div>
          ))}
        </div>
        {restCount > 0 && restVotes > 0 && (
          <p className="mt-1.5 text-right text-[12px]" style={{ color: MUTE2 }}>
            그 외 {restCount}명 {restVotes}표
          </p>
        )}
      </>
    )
  }

  /* ── 팀 탭 + 선수 그리드 ── */
  const sideLabel = (t: "home" | "away") =>
    data?.options.find((o) => o.team === t)?.team_label ?? (t === "home" ? "홈" : "원정")
  const group = (t: "home" | "away", g: MotmOption["group"]) =>
    (data?.options ?? []).filter((o) => o.team === t && o.group === g)

  const chip = (o: MotmOption) => {
    const sel = picked === o.key
    return (
      <button
        key={o.key}
        type="button"
        onClick={() => setPicked(o.key)}
        aria-pressed={sel}
        className="rounded-[10px] px-1 pt-1.5 pb-2 text-center transition-colors"
        style={{
          border: `1.5px solid ${sel ? BURGUNDY : LINE}`,
          background: sel ? "color-mix(in srgb, #961e37 7%, #fff)" : "var(--wc-card, #fff)",
        }}
      >
        <span className="block text-[9px] font-bold tabular-nums" style={{ color: MUTE2 }}>
          {o.number ?? "–"}
        </span>
        <span
          className="block truncate text-[12px] font-bold"
          style={{ color: sel ? BURGUNDY : INK, wordBreak: "keep-all" }}
        >
          {o.label}
        </span>
      </button>
    )
  }

  if (!data) {
    return (
      <p className="py-8 text-center text-[12px]" style={{ color: MUTE2 }}>
        투표 불러오는 중…
      </p>
    )
  }

  /* ── 확정 — 실록 영속 화면 ── */
  if (data.closed) {
    if (data.total === 0 || !leader) {
      return (
        <p className="py-8 text-center text-[12px]" style={{ color: MUTE2 }}>
          이 경기의 MoTM 투표는 마감되었습니다.
        </p>
      )
    }
    return (
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-bold" style={{ color: MUTE }}>
            🏅 팬 선정 MoTM
          </span>
          <span className="text-[16px] font-extrabold" style={{ color: BURGUNDY }}>
            {leader.label}
            {showPct ? ` ${leaderPct}%` : ` ${leaderVotes}표`}
          </span>
          <span className="text-[12px] tabular-nums" style={{ color: MUTE2 }}>
            {data.total.toLocaleString()}표
          </span>
        </div>
        {distributionRows(null)}
      </section>
    )
  }

  /* ── 투표 후 요약 — 내 픽 + 현재 분포 + 픽 변경 ── */
  if (data.myKey && !editing) {
    const mine = optionByKey.get(data.myKey)
    return (
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-extrabold" style={{ color: BURGUNDY }}>
            ✓ 내 픽 · {mine?.label}
          </span>
          <span className="shrink-0 text-[12px] tabular-nums" style={{ color: MUTE2 }}>
            {data.total === 1 && !showPct ? "첫 표" : `${data.total.toLocaleString()}표`}
          </span>
        </div>
        {showPct ? (
          distributionRows(3)
        ) : (
          <p className="mt-2 text-[12px]" style={{ color: MUTE }}>
            분포는 3표부터 공개됩니다 — 지금은 초반 집계 중.
          </p>
        )}
        <button
          type="button"
          onClick={openPicker}
          className="mt-3 h-[38px] w-full rounded-[11px] text-[12px] font-bold"
          style={{ border: `1px solid ${LINE}`, background: "var(--wc-card, #fff)", color: MUTE }}
        >
          픽 변경
        </button>
      </section>
    )
  }

  /* ── 투표 전 — 선수 그리드 인라인 ── */
  return (
    <section>
      <p className="text-[13px] font-extrabold" style={{ color: INK, wordBreak: "keep-all" }}>
        🏅 오늘의 MoTM은?
      </p>
      <p className="mt-0.5 mb-2 text-[12px]" style={{ color: MUTE }}>
        출전 {data.options.length}명 · 1인 선택 · 내일 오전 11시 확정
      </p>
      <div className="flex" style={{ borderBottom: `1px solid ${LINE}` }}>
        {(["home", "away"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className="relative h-10 flex-1 text-[12px] font-bold"
            style={{ color: team === t ? BURGUNDY : MUTE }}
          >
            {sideLabel(t)}
            {team === t && (
              <span
                aria-hidden
                className="absolute right-[20%] bottom-0 left-[20%] h-[2px] rounded-t"
                style={{ background: BURGUNDY }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="pt-3">
        <p className="mb-1.5 text-[12px] font-bold tracking-[0.08em]" style={{ color: MUTE2 }}>
          선발
        </p>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {group(team, "starter").map(chip)}
        </div>
        {group(team, "sub").length > 0 && (
          <>
            <p
              className="mt-3 mb-1.5 text-[12px] font-bold tracking-[0.08em]"
              style={{ color: MUTE2 }}
            >
              교체 투입
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {group(team, "sub").map(chip)}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={confirmVote}
        disabled={!picked || busy}
        className="mt-4 h-[42px] w-full rounded-[11px] text-[13px] font-bold text-white disabled:opacity-40"
        style={{ background: BURGUNDY }}
      >
        {busy ? "저장 중…" : data.myKey && picked !== data.myKey ? "픽 변경" : "투표하기"}
      </button>
      {!isSignedIn && (
        <p className="mt-1.5 text-center text-[12px]" style={{ color: MUTE2 }}>
          투표는 로그인 후 반영됩니다
        </p>
      )}
    </section>
  )
}
