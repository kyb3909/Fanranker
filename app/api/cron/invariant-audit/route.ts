import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { notifyDiscordOps } from "@/lib/discord-notify"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"
import {
  cronJobNameFromPath,
  cronMaxGapMinutes,
  heartbeatThresholdMinutes,
} from "@/lib/ops/cron-schedule"
import { bigramTitleSimilarity, DUP_SUSPECT_MIN } from "@/lib/ops/title-similarity"
import { findAliasPoisoning, findNotationViolations, loadNotation } from "@/lib/news/notation"
import { gatedStageSignal, STAGE_FLOW, STAGE_LABEL } from "@/lib/saga/stages"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"
import vercelConfig from "@/vercel.json"
import { findIdentityMismatches } from "@/lib/saga/identity-audit"
import { isMatchPageLeague } from "@/lib/match/leagues"
import { matchKeyOf, matchLabelOf } from "@/lib/match/match-key"
import {
  lfaDetailRow,
  pickFtScore,
  type BetmanScore,
  type LfaDetailRow,
} from "@/lib/motm/ft-evidence"
import { findDuplicateReports, type GameRow } from "@/lib/ops/match-report-dup"
import { assessMotmCoverage, MOTM_GRACE_MS } from "@/lib/ops/motm-coverage"
import { auditLfaLinks, type LfaNamedMatch, type LinkedGame } from "@/lib/ops/lfa-link-audit"
import { cachedTeamEn } from "@/lib/lfa/match"
import { describeInvariant, formatFindingField } from "@/lib/ops/invariant-catalog"
import {
  assessTimelineLatin,
  findFixableTimelineNames,
  type FixableName,
  type TimelineEventLike,
} from "@/lib/ops/timeline-latin"
import type { RosterEntry } from "@/lib/lfa/scorer-name"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET/POST /api/cron/invariant-audit  (CRON_SECRET, vercel.json 매시 :44)
 *
 * 발행 **후** 산출물을 놓고 시스템 불변식을 검사하는 2층 감사관 (2026-08-08).
 * 발행 전 게이트(1층)는 아이템 하나만 보므로 원리상 못 잡는 것들 — 경로 간 규칙
 * 불일치, 발행쌍 중복, 표기 흔들림, 크론 무호출 — 을 가로로 늘어놓고 본다.
 *
 * 불변식 12종:
 *   1. saga_title_korean   — 노출 사가 제목은 한글이다 (영문 제목 10건 실사고)
 *   2. cron_heartbeat      — 등록된 크론은 기대 주기 안에 cron_run_log 를 남긴다
 *                            (news-learn-edits 무기록 결번 실사고)
 *   3. dup_published_pair  — 같은 소식은 1회만 발행된다 (첼시 41인 같은 run 2발 실사고)
 *   4. notation_alt_in_title — 발행 제목은 사전 대표 표기를 쓴다 (래시포드/래시퍼드 실사고)
 *   5. dict_alias_poisoned  — 사전의 오표기(alt)는 같은 대상의 변형이다 (레온/하파엘 레앙
 *                            실사고 — 4번은 사전이 옳다고 전제하므로 원리상 못 잡는다)
 *   6. saga_stage_regressed — 사가 단계는 게이트 통과 신호의 최대치보다 낮지 않다
 *                            (페란 토레스 실사고 — 늦게 온 낮은 단계 보도가 15건을
 *                            끌어내림. nextStage 단조 규칙이 1층, 여기는 2층 그물)
 *   7. lineup_bench_empty  — 끝난 경기의 저장 라인업에 벤치가 있다 (2026-08-31 실사고:
 *                            LFA 벤치 필드명 오독으로 164행 전부 벤치 0 — 교체 표기와
 *                            MoTM 교체 후보가 통째로 사라졌는데 신호가 없었다)
 *   8. match_report_dup    — 한 경기에 리포트는 하나다 (2026-09-01 실사고: 저장 확인이
 *                            행 단위라 형제 betman 행마다 LLM 체인 재실행 — 5경기 15건)
 *   9. motm_poll_missing   — FT+2시간이면 MoTM 폴이 있다 (2026-09-01 실사고: FT 근거가
 *                            무료 피드 하나뿐이라 생성이 최대 7시간 40분 늦었다)
 *  10. timeline_name_latin — 저장 타임라인에 **고칠 수 있는데 안 고쳐진** 영문 이름이
 *                            없다 (2026-09-01 실사고: Ø 가 정규화에서 지워져 287경기.
 *                            비한글 전량이 아니라 재판정으로 한글이 되는 것만 센다 —
 *                            미검수 선수는 원문 유지가 설계라 배경으로 깔린다)
 *  11. lfa_link_team_mismatch — betman 경기에 붙은 LFA 매치는 **같은 팀의 경기**다
 *                            (2026-09-02: 연결이 (리그, 킥오프 시각)만 보고 확정하던 지름길을
 *                            막았지만, 연결 함수와 같은 자로 링크를 매시 다시 잰다. 그날 LFA
 *                            목록 사본(lfa_day_cache)의 팀명 vs 사전 영문명 — 크레딧 0)
 *  12. lfa_link_missing    — 매치 페이지 대상 리그의 끝난 경기는 LFA 링크가 있다 (집계형:
 *                            11번 가드가 이름 불일치를 **끊는** 쪽으로 처리하므로, 사전 결손·
 *                            LFA 표기 변덕은 "오연결"이 아니라 "링크 없음"으로 나타난다)
 *  13. match_thread_missing — 라인업이 확정된 끝난 경기엔 불판이 있다 (2026-08-27~30 실사고:
 *                            일정 짝짓기가 동시 킥오프를 놓쳐 24경기가 라인업·MoTM 은 있는데
 *                            불판만 없었다. 불판 크론은 창 안 후보만 보므로 스스로 모른다)
 *
 * ⚠️ 8~10 은 셋 다 **저장분이 스스로 낫지 않는** 자리를 본다. 우는 시점에 이미 굳어
 *    있으므로, 코드 수리와 별개로 백필이 필요한지 늘 함께 판단할 것.
 *
 * 자동 수정은 하지 않는다 — 확정은 사람 (독자 제보 파이프라인과 같은 원칙, 오탐 무해).
 * 알림 피로 방지: invariant_findings 원장에 fingerprint 로 기록하고 **open 전이 시
 * 1회만** 알린다. 사라진 위반은 resolved 로 조용히 닫는다.
 * 감사관 자신의 심박은 ops-monitor 가 본다 (상호 감시 — 자기 죽음은 자기가 못 알린다).
 */

interface Finding {
  invariant: string
  fingerprint: string
  summary: string
  detail: Record<string, unknown>
}

const H = 3600000
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gongnori.fan"

/** maxDuration 60s 안에서 검사를 마치기 위한 예산 — 넘으면 resolve 를 보류한다 */
const AUDIT_TIME_BUDGET_MS = 45_000
/** MoTM FT 관례 — lib/motm/poll.ts 와 같은 킥오프+110분 */
const MOTM_FT_AFTER_MS = 110 * 60_000
/** 타임라인 검사 상한 — 예산 안에서 도는 경기 수 (최근 것부터) */
const TIMELINE_SCAN_LIMIT = 60
/** `.in()` 은 큰 배열에서 400 이 온다 — 이 저장소의 재발 패턴 */
const IN_CHUNK = 100

/**
 * vercel.json 밖에서 돌지만 cron_run_log 를 남기는 작업 — VPS 발 (2026-09-02).
 * `betman-results` = VPS fetch-results.sh(15분)가 결과 갱신 직후 부르는 POST /api/betman/settle.
 * 이게 끊기면 결과 수집이 죽은 것인데 종전엔 아무 심박이 없었다(settle-pending 안전망이 대신
 * 정산하는 동안 아무도 모름). 새 결과가 없는 회차는 호출을 건너뛸 수 있어 기대 주기를 30분으로
 * 잡는다 (임계 = 60분).
 */
const EXTRA_HEARTBEATS: { job: string; gap: number | null }[] = [{ job: "betman-results", gap: 30 }]

/** gameId 들의 betman 행 (경기 키 계산용). PostgREST 400 을 피해 끊어서 부른다 */
async function loadGamesByIds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gameIds: string[]
): Promise<GameRow[]> {
  const ids = [...new Set(gameIds)]
  const out: GameRow[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from("betman_games")
      .select("id, home_team_name, away_team_name, match_time")
      .in("id", ids.slice(i, i + IN_CHUNK))
    for (const g of data ?? []) {
      out.push({
        id: String(g.id),
        homeTeam: String(g.home_team_name),
        awayTeam: String(g.away_team_name),
        matchTime: String(g.match_time),
      })
    }
  }
  return out
}

/** gameId → LFA 상세 행들 (FT 증거 판정 입력) */
async function loadDetailRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gameIds: string[]
): Promise<Map<string, LfaDetailRow[]>> {
  const out = new Map<string, LfaDetailRow[]>()
  const ids = [...new Set(gameIds)]
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from("match_details_cache")
      .select("game_id, finished, payload")
      .in("game_id", ids.slice(i, i + IN_CHUNK))
    for (const row of data ?? []) {
      const key = String(row.game_id)
      const list = out.get(key) ?? []
      list.push(
        lfaDetailRow(row as { finished?: unknown; payload?: { homeScore?: unknown } | null })
      )
      out.set(key, list)
    }
  }
  return out
}

/** 확정 라인업이 저장된 gameId 집합 — 라인업이 없으면 MoTM 폴이 없는 게 정상이다 */
async function loadReadyLineupIds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gameIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>()
  const ids = [...new Set(gameIds)]
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from("match_lineups")
      .select("game_id, payload")
      .in("game_id", ids.slice(i, i + IN_CHUNK))
    for (const row of data ?? []) {
      if ((row.payload as { status?: string } | null)?.status === "ready") {
        out.add(String(row.game_id))
      }
    }
  }
  return out
}

/** gameId → 대조 로스터 (선발+벤치 양 팀) */
async function loadRosters(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gameIds: string[]
): Promise<Map<string, RosterEntry[]>> {
  const out = new Map<string, RosterEntry[]>()
  const ids = [...new Set(gameIds)]
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from("match_lineups")
      .select("game_id, payload")
      .in("game_id", ids.slice(i, i + IN_CHUNK))
    for (const row of data ?? []) {
      const p = row.payload as {
        status?: string
        home?: { starters?: RosterEntry[]; bench?: RosterEntry[] }
        away?: { starters?: RosterEntry[]; bench?: RosterEntry[] }
      } | null
      if (p?.status !== "ready") continue
      out.set(String(row.game_id), [
        ...(p.home?.starters ?? []),
        ...(p.home?.bench ?? []),
        ...(p.away?.starters ?? []),
        ...(p.away?.bench ?? []),
      ])
    }
  }
  return out
}

async function handler(req: NextRequest) {
  const denied = verifyCronSecret(req)
  if (denied) return denied

  const supabase = createServiceRoleClient()
  const now = Date.now()
  const findings: Finding[] = []
  const checkErrors: string[] = []

  // ── 1) 사가 제목 한글 불변식 ──
  try {
    const { data: sagas } = await supabase
      .from("sagas")
      .select("id, slug, title, subject")
      .eq("saga_type", "transfer")
      .eq("status", "active")
    for (const s of sagas ?? []) {
      const kr = (s.subject as { player_name_kr?: string | null })?.player_name_kr ?? null
      // 라틴 검사는 표준 "<이름> 이적 사가" 제목에만 — 운영자 커스텀 제목("오시멘(IN) —
      // 토트넘" 같은)의 표기 마커를 오탐하면 안 된다
      const title = s.title as string
      const hasLatinName = / 이적 사가$/.test(title) && /[A-Za-z]/.test(title)
      if (!kr || hasLatinName) {
        findings.push({
          invariant: "saga_title_korean",
          fingerprint: `saga_title_korean:${s.id}`,
          summary: `사가 제목 한글 아님 — "${s.title}" (/saga/${s.slug})`,
          detail: { saga_id: s.id, slug: s.slug, title: s.title, player_name_kr: kr },
        })
      }
    }
  } catch (e) {
    checkErrors.push(`saga_title_korean: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 2) 크론 심박 불변식 ──
  try {
    const crons = (vercelConfig as { crons: { path: string; schedule: string }[] }).crons
    const jobs = [
      ...crons.map((c) => ({
        job: cronJobNameFromPath(c.path),
        gap: cronMaxGapMinutes(c.schedule),
      })),
      ...EXTRA_HEARTBEATS,
    ]
      // 자기 자신은 제외 — 죽으면 어차피 자기가 못 알린다 (ops-monitor 몫)
      .filter((c) => c.job !== "invariant-audit" && c.gap !== null)
    const lastRuns = await Promise.all(
      jobs.map(async ({ job }) => {
        const { data } = await supabase
          .from("cron_run_log")
          .select("started_at")
          .eq("job_name", job)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ started_at: string }>()
        return { job, last: data?.started_at ?? null }
      })
    )
    const lastByJob = new Map(lastRuns.map((r) => [r.job, r.last]))
    for (const { job, gap } of jobs) {
      const thresholdMs = heartbeatThresholdMinutes(gap as number) * 60000
      const last = lastByJob.get(job) ?? null
      const ageMs = last ? now - new Date(last).getTime() : Infinity
      if (ageMs > thresholdMs) {
        findings.push({
          invariant: "cron_heartbeat",
          fingerprint: `cron_heartbeat:${job}`,
          summary: last
            ? `크론 ${job} 심박 끊김 — 마지막 실행 ${Math.round(ageMs / H)}시간 전 (기대 주기 ${gap}분)`
            : `크론 ${job} 실행 기록 없음 — 등록만 되고 호출된 적 없음`,
          detail: { job, expected_gap_minutes: gap, last_run_at: last },
        })
      }
    }
  } catch (e) {
    checkErrors.push(`cron_heartbeat: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 3) 발행쌍 중복 의심 + 4) 표기 흔들림 (같은 48시간 발행분 재사용) ──
  try {
    const { data: posts } = await supabase
      .from("posts")
      .select("id, title, content, created_at")
      .eq("user_id", NEWS_BOT_USER_ID)
      .is("deleted_at", null)
      .gte("created_at", new Date(now - 48 * H).toISOString())
      .order("created_at", { ascending: true })
    const rows = (
      (posts ?? []) as { id: string; title: string; content: unknown; created_at: string }[]
    ).map((p) => ({
      ...p,
      // 본문까지 합쳐 검사한다 — 제목만 보던 탓에 본문 오표기를 통째로 놓쳤다 (2026-08-09)
      haystack: `${p.title}\n${extractTextFromTipTapJSON(p.content as TipTapNode)}`,
    }))

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const sim = bigramTitleSimilarity(rows[i].title, rows[j].title)
        if (sim >= DUP_SUSPECT_MIN) {
          const [a, b] = [rows[i].id, rows[j].id].sort()
          findings.push({
            invariant: "dup_published_pair",
            fingerprint: `dup_pair:${a}:${b}`,
            summary: `중복 의심쌍 (${sim.toFixed(2)}) — "${rows[i].title.slice(0, 50)}" ↔ "${rows[j].title.slice(0, 50)}"`,
            detail: { post_a: a, post_b: b, similarity: sim },
          })
        }
      }
    }

    // ── 표기 흔들림 감시 ──
    // 사전이 **오표기로 아는 문자열**이 발행물에 살아 있다는 건, 교정 파이프라인
    // 어딘가가 샜다는 직접 증거다. 2026-08-09 이전에는 이 검사가 세 겹으로 좁았다:
    // 선수만(감독·매체·구단 제외) · 제목만(본문 제외) · 1,000행 절단.
    // 그래서 그날 발견된 오표기(하비/샤비/자비 알론소, 카릭, 영문 매체 라벨)를
    // **하나도 못 잡았고**, 전부 운영자가 눈으로 찾아냈다. 탐지를 사람에게
    // 의존하는 상태가 진짜 문제였으므로 범위를 셋 다 넓힌다.
    const notation = await loadNotation(supabase)
    for (const p of rows) {
      for (const v of findNotationViolations(p.haystack, notation.entries)) {
        findings.push({
          invariant: "notation_alt_in_title",
          fingerprint: `notation:${p.id}:${v.entryId}`,
          summary: `발행물이 옛/오 표기 사용 — "${v.alt}" (대표: "${v.preferred}") in "${p.title.slice(0, 60)}"`,
          detail: { post_id: p.id, dict_id: v.entryId, alt: v.alt, preferred: v.preferred },
        })
      }
    }

    // ── 5) 사전 오염 — alt 가 오표기가 아니라 '다른 사람'인 경우 ──
    // 4번(notation_alt_in_title)은 사전이 옳다고 전제하고 발행물을 본다. 사전 자체가
    // 틀리면 치환이 조용히 성공하므로 4번에 안 걸린다 — 2026-08-11 "레온"(정: 하파엘
    // 레앙) 사고가 그랬고, 결국 운영자가 발행된 기사에서 눈으로 찾았다.
    for (const p of findAliasPoisoning(notation.entries)) {
      findings.push({
        invariant: "dict_alias_poisoned",
        fingerprint: `dictpoison:${p.entryId}:${p.alt}`,
        summary: `사전 오염 의심 — "${p.alt}" 를 "${p.preferred}" 의 오표기로 등록 (${p.reason})`,
        detail: { dict_id: p.entryId, alt: p.alt, preferred: p.preferred, reason: p.reason },
      })
    }
  } catch (e) {
    checkErrors.push(`published_posts: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 4b) 디스코드 ops 웹훅 설정 불변식 — 알림 채널 자체의 SPOF 감시 ──
  // 미설정이면 notifyDiscordOps 가 조용히 no-op 이라 모든 경보가 무음이 된다
  // (감사 P2-10). 웹훅이 없으니 이 위반은 디스코드로 못 나가지만, 원장과
  // /admin/operations·cron 응답에는 남는다.
  if (!process.env.DISCORD_OPS_WEBHOOK_URL) {
    findings.push({
      invariant: "discord_webhook_missing",
      fingerprint: "discord_webhook:unset",
      summary: "DISCORD_OPS_WEBHOOK_URL 미설정 — 모든 운영 경보가 무음 no-op 상태",
      detail: { env: "DISCORD_OPS_WEBHOOK_URL" },
    })
  }

  // ── 6) 사가 단계 후퇴 불변식 ──
  // 1층(nextStage 단조 규칙)이 자동 경로를 막지만, 직접 DB 수정·신규 코드 경로·과거
  // 오염분은 못 본다. 여기서 전 활성 사가를 놓고 "현 단계 < 게이트 통과 신호 최대치"를
  // 가로로 검사한다. 티어 게이트는 발행 경로와 동일(gatedStageSignal) — 루머의 done
  // 주장은 최대치 계산에서도 빠진다. 자동 수정 없음, 확정은 사람.
  try {
    const flow = STAGE_FLOW.transfer
    const { data: activeSagas } = await supabase
      .from("sagas")
      .select("id, slug, title, stage")
      .eq("saga_type", "transfer")
      .eq("status", "active")
    const sagaIds = (activeSagas ?? []).map((s) => s.id as string)
    if (sagaIds.length) {
      const { data: entries } = await supabase
        .from("saga_entries")
        .select("saga_id, stage_after, tier")
        .in("saga_id", sagaIds)
      const maxIdxBySaga = new Map<string, number>()
      for (const e of entries ?? []) {
        const signal = gatedStageSignal(
          (e.stage_after as string | null) ?? null,
          (e.tier as string) ?? "rumor"
        )
        if (!signal) continue
        const idx = flow.indexOf(signal)
        if (idx < 0) continue
        const prev = maxIdxBySaga.get(e.saga_id as string) ?? -1
        if (idx > prev) maxIdxBySaga.set(e.saga_id as string, idx)
      }
      for (const s of activeSagas ?? []) {
        const curIdx = flow.indexOf(s.stage as string)
        const maxIdx = maxIdxBySaga.get(s.id as string) ?? -1
        if (curIdx >= 0 && maxIdx > curIdx) {
          findings.push({
            invariant: "saga_stage_regressed",
            fingerprint: `saga_stage_regressed:${s.id}`,
            summary: `사가 단계 후퇴 — "${s.title}" 현재 ${STAGE_LABEL[s.stage as string] ?? s.stage} < 최대 ${STAGE_LABEL[flow[maxIdx]] ?? flow[maxIdx]} (/saga/${s.slug})`,
            detail: {
              saga_id: s.id,
              slug: s.slug,
              current_stage: s.stage,
              max_gated_stage: flow[maxIdx],
            },
          })
        }
      }
    }
  } catch (e) {
    checkErrors.push(`saga_stage_regressed: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 사가 신원 불변식: 한글 표기와 로마자 키가 같은 사람인가 ──
  /**
   * 2026-08-25 실사고: "Tottenham sign **Savinho** from Man City" 기사에서 추출기가
   * `fabinho`(파비뉴 — 다른 선수)를 냈고, 그 문자열이 그대로 기본키가 돼 같은 이적이
   * **두 사가로 갈렸다.** 화면엔 "사비뉴 이적 사가"가 둘 떠 있었고, 운영자가 눈으로 찾았다.
   *
   * canonical.ts 의 근거 검증이 앞으로 들어올 것을 막는다면, 이 검사는 **이미 들어와
   * 있는 것**을 찾는다. 검증을 붙이기 전에 생긴 데이터는 검증이 못 잡기 때문이다.
   */
  try {
    const { data: idSagas } = await supabase
      .from("sagas")
      .select("slug, subject, entry_count")
      .eq("saga_type", "transfer")

    // ⚠️ 사전은 notation 모듈로만 읽는다 — 직접 조회는 아키텍처 가드가 막는다.
    //    사전 읽는 경로가 7개로 갈라져 하루에 표기 사고가 다섯 번 났던 적이 있다.
    const idNotation = await loadNotation(supabase)
    const idAliases = idNotation.persons.map((e) => ({
      romanized: e.romanized,
      preferredKo: e.preferred_ko,
    }))

    const mismatches = findIdentityMismatches(
      (idSagas ?? []).map((s) => {
        const subj = (s.subject ?? {}) as { player_key?: string; player_name_kr?: string }
        return {
          slug: s.slug as string,
          playerKey: subj.player_key ?? "",
          playerNameKr: subj.player_name_kr ?? null,
          entryCount: (s.entry_count as number) ?? 0,
        }
      }),
      idAliases
    )
    for (const m of mismatches) {
      findings.push({
        invariant: "saga_identity_mismatch",
        fingerprint: `saga_identity_mismatch:${m.slug}`,
        summary: `사가 신원 어긋남 — 화면엔 "${m.koName}" 인데 키는 "${m.sagaKey}" (사전: ${m.dictKeys.join(", ")}) (/saga/${m.slug})`,
        detail: { slug: m.slug, saga_key: m.sagaKey, ko_name: m.koName, dict_keys: m.dictKeys },
      })
    }
  } catch (e) {
    checkErrors.push(`saga_identity_mismatch: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 7. lineup_bench_empty — 끝난 경기의 저장 라인업에 벤치가 있다 ──
  //
  // 2026-08-31 실사고: LFA 응답의 벤치 필드명을 잘못 읽어(`substitutes` ← 실제 `subs`)
  // LFA 로 채워진 라인업 **164행 전부**가 벤치 0 명이었다. 교체 표기가 붙을 자리가
  // 사라지고 MoTM 후보에서 교체 선수가 통째로 빠졌는데, **아무 신호도 없었다** —
  // 운영자가 첼시 경기를 눈으로 보고 제보할 때까지 45% 가 조용히 망가져 있었다.
  //
  // 프로 경기에 벤치 0 은 존재하지 않는다. 그러니 "끝난 경기인데 양 팀 벤치가 모두
  // 비었다" 는 데이터가 아니라 **코드가 깨졌다는 뜻**이다. 소스가 무엇으로 바뀌든
  // 같은 병이 재발하면 여기서 한 시간 안에 걸린다.
  try {
    const { data: lus } = await supabase
      .from("match_lineups")
      .select("game_id, payload")
      .gte("updated_at", new Date(now - 3 * 24 * H).toISOString())

    const broken: string[] = []
    let ready = 0
    for (const r of lus ?? []) {
      const p = r.payload as {
        status?: string
        kickoff?: string
        home?: { teamLabel?: string; bench?: unknown[] }
        away?: { teamLabel?: string; bench?: unknown[] }
      } | null
      if (p?.status !== "ready" || !p.kickoff) continue
      // FT 로 확실히 넘어간 경기만 — 킥오프 직전 스냅샷은 벤치가 아직 없을 수 있다
      if (new Date(p.kickoff).getTime() > now - 3 * H) continue
      ready++
      if ((p.home?.bench?.length ?? 0) === 0 && (p.away?.bench?.length ?? 0) === 0) {
        broken.push(`${p.home?.teamLabel ?? "?"} vs ${p.away?.teamLabel ?? "?"}`)
      }
    }
    // 한 경기의 우연이 아니라 **비율**로 본다 — 개별 경기는 원본이 정말 빈약할 수 있다
    if (ready >= 10 && broken.length / ready >= 0.2) {
      const pct = Math.round((broken.length / ready) * 100)
      findings.push({
        invariant: "lineup_bench_empty",
        fingerprint: "lineup_bench_empty",
        summary: `끝난 경기 라인업 ${broken.length}/${ready}건(${pct}%)에 벤치가 0명 — 교체 표기·MoTM 교체 후보가 통째로 빠진다. 라인업 소스의 응답 모양(필드명)을 의심할 것`,
        detail: { broken: broken.slice(0, 20), broken_count: broken.length, ready_count: ready },
      })
    }
  } catch (e) {
    checkErrors.push(`lineup_bench_empty: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 8. match_report_dup — 한 경기에 리포트는 하나다 ──
  //
  // 2026-09-01 실사고: 저장 확인이 행 단위라 짝짓기가 다른 형제 행을 고를 때마다 LLM
  // 체인을 다시 돌았다 (5경기 15건). 수리는 조회를 경기 단위로 바꾼 것이고 **저장은
  // 여전히 행 단위**라, 읽기 경로가 되돌아가면 그대로 재발한다. 중복 1건 = LLM 실비.
  try {
    const { data: reps } = await supabase
      .from("match_reports")
      .select("game_id, event_id, title")
      .gte("created_at", new Date(now - 7 * 24 * H).toISOString())
    const reports = (reps ?? []).map((r) => ({
      gameId: String(r.game_id),
      eventId: r.event_id ? String(r.event_id) : null,
      title: String(r.title ?? ""),
    }))
    if (reports.length > 0) {
      const games = await loadGamesByIds(
        supabase,
        reports.map((r) => r.gameId)
      )
      for (const g of findDuplicateReports(reports, games)) {
        findings.push({
          invariant: "match_report_dup",
          fingerprint: `match_report_dup:${g.key}`,
          summary:
            `같은 경기에 리포트 ${g.gameIds.length}건 — ${g.label}` +
            (g.titles.length > 1 ? ` (제목 ${g.titles.length}종이라 지면마다 내용이 다르다)` : "") +
            `. 저장 확인이 행 단위로 되돌아갔는지 hasStoredReport 의 형제 확장을 볼 것`,
          detail: { gameIds: g.gameIds, titles: g.titles.slice(0, 3) },
        })
      }
    }
  } catch (e) {
    checkErrors.push(`match_report_dup: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 9. motm_poll_missing — FT 가 지났으면 MoTM 폴이 있다 ──
  //
  // 2026-09-01 실사고: FT 근거가 무료 피드 스코어 하나뿐이라 폴 생성이 최대 7시간 40분
  // 늦었다. 마감이 익일 11:00 이라 정작 투표할 시간대가 지나간 뒤에 열렸다.
  // ⚠️ FT 증거 판정은 생성 파이프라인과 **같은 모듈**(pickFtScore)을 쓴다 — 복제 금지.
  try {
    const { data: mrows } = await supabase
      .from("betman_games")
      .select("id, home_team_name, away_team_name, league_code, match_time, home_score, away_score")
      .eq("sport", "축구")
      .in("status", ["in_progress", "completed"])
      .gt("match_time", new Date(now - 26 * H).toISOString())
      .lte("match_time", new Date(now - (MOTM_FT_AFTER_MS + MOTM_GRACE_MS)).toISOString())
      .neq("home_team_name", "미정")
      .not("home_team_name", "is", null)

    const byKey = new Map<
      string,
      { key: string; label: string; ftAtMs: number; ids: string[]; score: BetmanScore }
    >()
    for (const g of mrows ?? []) {
      if (!isMatchPageLeague(g.league_code as string | null)) continue
      const parts = {
        homeTeam: String(g.home_team_name),
        awayTeam: String(g.away_team_name),
        matchTime: String(g.match_time),
      }
      const key = matchKeyOf(parts)
      const hit = byKey.get(key)
      if (hit) {
        hit.ids.push(String(g.id))
        if (hit.score.homeScore == null && g.home_score != null) {
          hit.score = { homeScore: Number(g.home_score), awayScore: Number(g.away_score) }
        }
        continue
      }
      byKey.set(key, {
        key,
        label: matchLabelOf(parts),
        ftAtMs: new Date(parts.matchTime).getTime() + MOTM_FT_AFTER_MS,
        ids: [String(g.id)],
        score: {
          homeScore: g.home_score != null ? Number(g.home_score) : null,
          awayScore: g.away_score != null ? Number(g.away_score) : null,
        },
      })
    }

    if (byKey.size > 0) {
      const allIds = [...byKey.values()].flatMap((m) => m.ids)
      const [detailsByGame, lineupGameIds] = await Promise.all([
        loadDetailRows(supabase, allIds),
        loadReadyLineupIds(supabase, allIds),
      ])
      const candidates = [...byKey.values()].map((m) => ({
        matchKey: m.key,
        label: m.label,
        ftAtMs: m.ftAtMs,
        hasLineup: m.ids.some((id) => lineupGameIds.has(id)),
        hasFtEvidence: !!pickFtScore(
          m.score,
          m.ids.flatMap((id) => detailsByGame.get(id) ?? [])
        ),
      }))
      const { data: pollRows } = await supabase
        .from("polls")
        .select("match_key")
        .eq("kind", "motm")
        .in("match_key", [...byKey.keys()])
      const have = new Set((pollRows ?? []).map((p) => String(p.match_key)))

      const cov = assessMotmCoverage(candidates, have, now)
      if (cov.alert) {
        const pct = Math.round(cov.ratio * 100)
        findings.push({
          invariant: "motm_poll_missing",
          fingerprint: "motm_poll_missing",
          summary: `FT+2시간이 지난 경기 ${cov.missing.length}/${cov.eligible}건(${pct}%)에 MoTM 폴이 없다 — 생성 크론(15분)이나 FT 증거 경로가 막혔는지 볼 것`,
          detail: {
            missing: cov.missing.slice(0, 20).map((m) => m.label),
            missing_count: cov.missing.length,
            eligible: cov.eligible,
          },
        })
      }
    }
  } catch (e) {
    checkErrors.push(`motm_poll_missing: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 10. timeline_name_latin — 저장 타임라인에 고칠 수 있는 영문 이름이 남아 있다 ──
  //
  // 2026-09-01 실사고: Ø·Ł 이 정규화에서 지워져 이름 대조가 실패했고(287경기),
  // 리포트에는 실재하지 않는 이름("Martin degaard")까지 발행됐다.
  // ⚠️ **저장분은 스스로 안 낫는다** — 끝난 경기 상세는 수명이 사실상 무한이다.
  //    그래서 이 규칙이 울면 백필(scripts/backfill-timeline-names.ts --post)이 필요하다.
  try {
    const { data: drows } = await supabase
      .from("match_details_cache")
      .select("game_id, payload")
      .eq("finished", true)
      .gte("updated_at", new Date(now - 3 * 24 * H).toISOString())
      .limit(TIMELINE_SCAN_LIMIT)

    const withTimeline = (drows ?? []).filter((r) => {
      const tl = (r.payload as { timeline?: unknown[] } | null)?.timeline
      return Array.isArray(tl) && tl.length > 0
    })
    if (withTimeline.length > 0) {
      const ids = withTimeline.map((r) => String(r.game_id))
      const [games, rosterByGame] = await Promise.all([
        loadGamesByIds(supabase, ids),
        loadRosters(supabase, ids),
      ])
      const gameById = new Map(games.map((g) => [g.id, g]))
      const perMatch: FixableName[][] = []
      for (const r of withTimeline) {
        const gid = String(r.game_id)
        const roster = rosterByGame.get(gid) ?? []
        if (roster.length === 0) continue // 라인업이 없으면 대조 근거가 없다 — 세지 않는다
        const g = gameById.get(gid)
        const events = ((r.payload as { timeline?: TimelineEventLike[] }).timeline ??
          []) as TimelineEventLike[]
        perMatch.push(
          findFixableTimelineNames(events, roster, g ? matchLabelOf(g) : gid.slice(0, 8))
        )
      }
      const verdict = assessTimelineLatin(perMatch)
      if (verdict.alert) {
        findings.push({
          invariant: "timeline_name_latin",
          fingerprint: "timeline_name_latin",
          summary: `저장 타임라인 ${verdict.matchCount}경기에 **지금 규칙으로는 한글이 되는** 영문 이름 ${verdict.names.length}개 — 정규화(fold-latin)를 부르는 자리를 빠뜨렸는지 보고, 저장분은 scripts/backfill-timeline-names.ts --post 로 고칠 것`,
          detail: {
            names: verdict.names
              .slice(0, 20)
              .map((n) => `${n.label} ${n.minute}' ${n.before}→${n.after}`),
            name_count: verdict.names.length,
            match_count: verdict.matchCount,
          },
        })
      }
    }
  } catch (e) {
    checkErrors.push(`timeline_name_latin: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 11·12. lfa_link_team_mismatch / lfa_link_missing — 링크는 같은 팀의 경기다 ──
  //
  // 연결(lib/lfa/match.ts resolveMatch)은 (리그, 킥오프 HH:MM) 이 첫 신호라, 두 일정이
  // 어긋난 날 남의 경기에 붙을 수 있었다. 2026-09-02 에 팀명 가드를 넣었지만 가드는
  // 연결 **시점**에만 서고, 저장된 링크·다른 경로(일정 페이지 짝짓기)·LFA 의 사후 개명은
  // 못 본다. 그래서 저장분을 매시 같은 자(teamMatches)로 다시 잰다. 크레딧은 쓰지 않는다 —
  // 팀명은 그날 LFA 목록 사본(lfa_day_cache)에서 읽는다.
  try {
    const linkFrom = new Date(now - 48 * H).toISOString()
    const linkTo = new Date(now - 3 * H).toISOString()
    const { data: recentGames } = await supabase
      .from("betman_games")
      .select("id, home_team_name, away_team_name, match_time, league_code")
      .eq("sport", "축구")
      .gte("match_time", linkFrom)
      .lte("match_time", linkTo)
      .limit(2000)
    const targetRows: GameRow[] = (recentGames ?? [])
      .filter((g) => isMatchPageLeague(String(g.league_code)))
      .map((g) => ({
        id: String(g.id),
        homeTeam: String(g.home_team_name),
        awayTeam: String(g.away_team_name),
        matchTime: String(g.match_time),
      }))
    // 경기 단위 (형제 행은 하나로) — 형제 중 한 행이라도 링크가 있으면 그 경기는 연결된 것
    const rowsByKey = new Map<string, GameRow[]>()
    for (const g of targetRows) {
      const k = matchKeyOf(g)
      rowsByKey.set(k, [...(rowsByKey.get(k) ?? []), g])
    }
    if (rowsByKey.size > 0) {
      const linkByGame = new Map<string, { lfaId: string; updated: string }>()
      const ids = targetRows.map((g) => g.id)
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const { data } = await supabase
          .from("match_details_cache")
          .select("game_id, lfa_match_id, updated_at")
          .in("game_id", ids.slice(i, i + IN_CHUNK))
          .not("lfa_match_id", "is", null)
        for (const r of data ?? []) {
          const gid = String(r.game_id)
          const prev = linkByGame.get(gid)
          if (!prev || String(r.updated_at) > prev.updated) {
            linkByGame.set(gid, { lfaId: String(r.lfa_match_id), updated: String(r.updated_at) })
          }
        }
      }
      const linked: LinkedGame[] = []
      const unlinked: string[] = []
      for (const [, rows] of rowsByKey) {
        const rep = rows[0]
        const hit = rows.map((g) => linkByGame.get(g.id)).find(Boolean)
        if (!hit) {
          unlinked.push(matchLabelOf(rep))
          continue
        }
        linked.push({
          gameId: rep.id,
          label: matchLabelOf(rep),
          homeKr: rep.homeTeam,
          awayKr: rep.awayTeam,
          lfaMatchId: hit.lfaId,
        })
      }

      if (linked.length > 0) {
        // 그날 LFA 목록 사본은 킥오프의 UTC 날짜로 저장돼 있다 (resolveMatch 의 utcDate 와 같다)
        const dateSet = new Set<string>()
        for (const [, rows] of rowsByKey) {
          const d = new Date(rows[0].matchTime)
          if (Number.isFinite(d.getTime())) dateSet.add(d.toISOString().slice(0, 10))
        }
        const { data: days } = await supabase
          .from("lfa_day_cache")
          .select("date_utc, payload")
          .in("date_utc", [...dateSet])
        const lfaById = new Map<string, LfaNamedMatch>()
        for (const d of days ?? []) {
          const list =
            (d.payload as
              | { id?: unknown; home?: { name?: unknown }; away?: { name?: unknown } }[]
              | null) ?? []
          for (const m of list) {
            if (!m?.id) continue
            lfaById.set(String(m.id), {
              id: String(m.id),
              homeName: String(m.home?.name ?? ""),
              awayName: String(m.away?.name ?? ""),
            })
          }
        }
        const teamEn = new Map(await cachedTeamEn().catch(() => [] as [string, string][]))
        const verdicts = auditLfaLinks(linked, lfaById, teamEn)
        for (const v of verdicts) {
          if (v.status !== "mismatch") continue
          findings.push({
            invariant: "lfa_link_team_mismatch",
            fingerprint: `lfa_link_team_mismatch:${v.gameId}`,
            summary: `LFA 링크가 남의 경기 — ${v.label} 에 "${v.lfaHome} v ${v.lfaAway}"(LFA) 가 붙어 있다 (사전: ${v.homeEn} v ${v.awayEn}). match_details_cache 의 해당 행을 지우면 다음 조회가 다시 붙인다`,
            detail: {
              game_id: v.gameId,
              lfa_match_id: v.lfaMatchId,
              lfa: `${v.lfaHome} v ${v.lfaAway}`,
              dict: `${v.homeEn} v ${v.awayEn}`,
            },
          })
        }
      }

      // ── 13. match_thread_missing — 라인업이 확정된 끝난 경기엔 불판이 있다 ──
      //
      // 불판은 킥오프 -90분~+120분 창에서 "라인업 ready" 인 화이트리스트 경기에만 깔린다.
      // 그러니 라인업이 ready 인데 불판이 없으면 창 안에 그 경기가 **후보로 안 잡힌 것**이다 —
      // 2026-08-27~30 실사고: 일정 짝짓기(한글 정규화)가 동시 킥오프 슬롯을 놓쳐 24경기가
      // 라인업·MoTM 은 있는데 불판만 없었다. 라인업 자체가 없는 경기(LFA 미커버)는 세지 않는다.
      const readyIds = await loadReadyLineupIds(supabase, ids)
      const threadedIds = new Set<string>()
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const { data } = await supabase
          .from("posts")
          .select("match_game_id")
          .in("match_game_id", ids.slice(i, i + IN_CHUNK))
          .is("deleted_at", null)
        for (const r of data ?? []) if (r.match_game_id) threadedIds.add(String(r.match_game_id))
      }
      for (const [key, rows] of rowsByKey) {
        const hasReady = rows.some((g) => readyIds.has(g.id))
        const hasThread = rows.some((g) => threadedIds.has(g.id))
        if (!hasReady || hasThread) continue
        const rep = rows[0]
        findings.push({
          invariant: "match_thread_missing",
          fingerprint: `match_thread_missing:${key}`,
          summary: `불판 없음 — ${matchLabelOf(rep)} 은 라인업이 확정됐는데 불판 글이 없다. 창(킥오프 -90~+120분) 안에 후보로 안 잡힌 것 — 일정 짝짓기를 의심. 수동 생성: /api/cron/match-threads?gameId=${rep.id}`,
          detail: { game_id: rep.id, sibling_ids: rows.map((g) => g.id) },
        })
      }

      // 집계형 결손 — 개별 경기는 정당할 수 있다(LFA 미커버 예선 등). 비율로만 본다
      const total = rowsByKey.size
      if (total >= 8 && unlinked.length / total >= 0.25) {
        const pct = Math.round((unlinked.length / total) * 100)
        findings.push({
          invariant: "lfa_link_missing",
          fingerprint: "lfa_link_missing",
          summary: `최근 48h 대상 리그 끝난 경기 ${unlinked.length}/${total}건(${pct}%)에 LFA 링크가 없다 — 사전 결손(팀명 가드가 끊음)·LFA 표기 변경·lfa-warm 결번 순으로 의심할 것`,
          detail: { unlinked: unlinked.slice(0, 20), unlinked_count: unlinked.length, total },
        })
      }
    }
  } catch (e) {
    checkErrors.push(`lfa_link: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ⚠️ 시간 예산 초과는 **반드시 checkErrors 에 넣는다.** 아래 resolve 는 checkErrors 가
  //    비었을 때만 도는데, 예산 때문에 검사를 덜 돌고도 조용히 넘어가면 "위반이 사라졌다"고
  //    오판해 열린 항목을 전부 닫아버린다 (감사관이 자기 눈을 감는 최악의 실패).
  if (Date.now() - now > AUDIT_TIME_BUDGET_MS) {
    checkErrors.push(
      `시간 예산 초과 (${Math.round((Date.now() - now) / 1000)}s) — 일부 검사가 덜 돌았을 수 있어 resolve 를 보류한다`
    )
  }

  // ── 원장 반영: 신규/재발만 알림, 사라진 위반은 resolved ──
  const nowIso = new Date(now).toISOString()
  const fingerprints = findings.map((f) => f.fingerprint)
  const { data: known } = fingerprints.length
    ? await supabase
        .from("invariant_findings")
        .select("fingerprint, status")
        .in("fingerprint", fingerprints)
    : { data: [] as { fingerprint: string; status: string }[] }
  const knownStatus = new Map((known ?? []).map((k) => [k.fingerprint, k.status]))
  const fresh = findings.filter((f) => knownStatus.get(f.fingerprint) !== "open")

  if (findings.length > 0) {
    const { error: upsertError } = await supabase.from("invariant_findings").upsert(
      findings.map((f) => ({
        invariant: f.invariant,
        fingerprint: f.fingerprint,
        detail: { ...f.detail, summary: f.summary },
        status: "open",
        last_seen_at: nowIso,
        resolved_at: null,
      })),
      { onConflict: "fingerprint" }
    )
    if (upsertError) checkErrors.push(`원장 upsert 실패: ${upsertError.message}`)
  }

  // 부분 실패 시 resolve 금지 — 검사를 못 한 것이지 위반이 사라진 게 아니다
  let resolved = 0
  if (checkErrors.length === 0) {
    const currentFps = new Set(fingerprints)
    const { data: openRows } = await supabase
      .from("invariant_findings")
      .select("id, fingerprint")
      .eq("status", "open")
    const toResolve = (openRows ?? []).filter((r) => !currentFps.has(r.fingerprint as string))
    if (toResolve.length > 0) {
      const { error: resolveError } = await supabase
        .from("invariant_findings")
        .update({ status: "resolved", resolved_at: nowIso })
        .in(
          "id",
          toResolve.map((r) => r.id)
        )
      if (!resolveError) resolved = toResolve.length
    }
  }

  if (fresh.length > 0) {
    // 알림 한 통이 세 질문에 답하게 (2026-09-02): 무엇이 깨졌나(카탈로그 label) · 어디서(summary 의
    // 경기·기사·사가) · 뭘 하면 되나(action + 관제실 링크). 종전엔 영문 코드 + 180자 절단이라
    // 조치 부분이 잘려 나갔다. 같은 종류가 여럿이면 종류별로 묶어 첫 건만 펼치고 나머지는 센다.
    const byKind = new Map<string, typeof fresh>()
    for (const f of fresh) byKind.set(f.invariant, [...(byKind.get(f.invariant) ?? []), f])
    const kinds = [...byKind.entries()]
    const headline = kinds
      .map(([id, list]) => `${describeInvariant(id).label} ${list.length}건`)
      .join(" · ")
    await notifyDiscordOps({
      level: "warn",
      title: `🧿 불변식 위반 ${fresh.length}건 — ${headline}`.slice(0, 240),
      description:
        `매시 44분 감사에서 새로 잡힌 것만 보냅니다. 같은 건은 다시 알리지 않고, 사라지면 자동으로 닫힙니다.\n` +
        `전체 목록과 이력은 관제실 → 운영.`,
      url: "/admin/operations",
      fields: kinds.slice(0, 10).map(([id, list]) => {
        const first = formatFindingField(list[0], SITE)
        const more =
          list.length > 1
            ? `\n＋ 같은 종류 ${list.length - 1}건 더: ${list
                .slice(1, 4)
                .map((f) => f.summary.split(" — ")[1]?.slice(0, 60) ?? f.summary.slice(0, 60))
                .join(" / ")}${list.length > 4 ? " …" : ""}`
            : ""
        return { name: first.name, value: `${first.value}${more}` }
      }),
    })
    await supabase
      .from("invariant_findings")
      .update({ alerted_at: nowIso })
      .in(
        "fingerprint",
        fresh.map((f) => f.fingerprint)
      )
  }

  return NextResponse.json({
    ok: checkErrors.length === 0,
    findings: findings.length,
    fresh: fresh.length,
    resolved,
    errors: checkErrors,
  })
}

export const GET = withCronLog("invariant-audit", (req: NextRequest) => handler(req))
export const POST = withCronLog("invariant-audit", (req: NextRequest) => handler(req))
