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
import vercelConfig from "@/vercel.json"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET/POST /api/cron/invariant-audit  (CRON_SECRET, vercel.json 매시 :44)
 *
 * 발행 **후** 산출물을 놓고 시스템 불변식을 검사하는 2층 감사관 (2026-08-08).
 * 발행 전 게이트(1층)는 아이템 하나만 보므로 원리상 못 잡는 것들 — 경로 간 규칙
 * 불일치, 발행쌍 중복, 표기 흔들림, 크론 무호출 — 을 가로로 늘어놓고 본다.
 *
 * 불변식 4종:
 *   1. saga_title_korean   — 노출 사가 제목은 한글이다 (영문 제목 10건 실사고)
 *   2. cron_heartbeat      — 등록된 크론은 기대 주기 안에 cron_run_log 를 남긴다
 *                            (news-learn-edits 무기록 결번 실사고)
 *   3. dup_published_pair  — 같은 소식은 1회만 발행된다 (첼시 41인 같은 run 2발 실사고)
 *   4. notation_alt_in_title — 발행 제목은 사전 대표 표기를 쓴다 (래시포드/래시퍼드 실사고)
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
    const jobs = crons
      .map((c) => ({ job: cronJobNameFromPath(c.path), gap: cronMaxGapMinutes(c.schedule) }))
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
      .select("id, title, created_at")
      .eq("user_id", NEWS_BOT_USER_ID)
      .is("deleted_at", null)
      .gte("created_at", new Date(now - 48 * H).toISOString())
      .order("created_at", { ascending: true })
    const rows = (posts ?? []) as { id: string; title: string; created_at: string }[]

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

    const { data: dict } = await supabase
      .from("news_alias_dictionary")
      .select("id, preferred_ko, hangul_alts")
      .eq("category", "player")
    for (const d of dict ?? []) {
      const preferred = d.preferred_ko as string
      for (const alt of (d.hangul_alts as string[] | null) ?? []) {
        if (!alt || alt.length < 3 || alt === preferred) continue
        for (const p of rows) {
          if (p.title.includes(alt)) {
            findings.push({
              invariant: "notation_alt_in_title",
              fingerprint: `notation:${p.id}:${d.id}`,
              summary: `발행 제목이 옛/오 표기 사용 — "${alt}" (대표: "${preferred}") in "${p.title.slice(0, 60)}"`,
              detail: { post_id: p.id, dict_id: d.id, alt, preferred },
            })
          }
        }
      }
    }
  } catch (e) {
    checkErrors.push(`published_posts: ${e instanceof Error ? e.message : String(e)}`)
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
    await notifyDiscordOps({
      level: "warn",
      title: "🧿 불변식 위반 감지",
      description: `발행 후 감사에서 신규 위반 ${fresh.length}건. (같은 위반은 재알림하지 않음)`,
      url: "/admin/operations",
      fields: fresh
        .slice(0, 10)
        .map((f) => ({ name: f.invariant, value: f.summary.slice(0, 180) })),
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
