import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import type { MatchEvent, MatchReport, MatchStatRow } from "./match-extras"
import type { ArticleMeta } from "./report-article"
import type { LineupResponse } from "./lineup-lookup"
import { REPORT_RECHECK_DAYS } from "./report-budget"

export interface ReportContext {
  eventId: string
  homeTeam: string
  awayTeam: string
  kickoffMs: number
  candidateUrl: string
  finalScore: string
  article: ArticleMeta
  paragraphs: string[]
  extracted: { score: string | null; events: MatchEvent[] } | null
  lineup: LineupResponse
  stats: MatchStatRow[] | null
  // Per-reservation token usage for the two-week 4–6th-start rescue-cost review.
  // Operational metadata only: deliberately excluded from input_version.
  usageByAttempt?: Record<
    string,
    Partial<
      Record<
        "compose" | "verify",
        {
          model: string
          usage: unknown
          latencyMs: number
        }
      >
    >
  >
}

export interface ReportWork {
  game_id: string
  event_id: string | null
  context: ReportContext | null
  input_version: string | null
  status: "ready" | "dictionary" | "held" | "draft" | "stored"
  reason: string | null
  missing_names: string[] | null
  held_at: string | null
  finished_at: string | null
  manual_resume: boolean
  updated_at: string
  lease_until: string | null
}
export interface ReportWorkStatus extends ReportWork {
  used: number
  budget: number
  unresolved: number
}
export interface ReportLease {
  token: string
  work: ReportWork
}
export interface ComposeReservation {
  id: number
  compose_index: number
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createServiceRoleClient().rpc(name, args)
  if (error) throw new Error(`${name}:${error.code}`)
  return data as T
}

export const claimReportWork = (gameId: string) =>
  rpc<ReportLease | null>("claim_match_report", { p_game_id: gameId })

export async function saveReportWork(gameId: string, token: string, patch: Partial<ReportWork>) {
  const { data, error } = await createServiceRoleClient()
    .from("match_report_work")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("game_id", gameId)
    .eq("lease_token", token)
    .gt("lease_until", new Date().toISOString())
    .select("game_id")
    .maybeSingle()
  if (error || !data) throw new Error(`report-work-write:${error?.code ?? "lease-expired"}`)
}

export async function releaseReportWork(gameId: string, token: string) {
  const { error } = await createServiceRoleClient()
    .from("match_report_work")
    .update({ lease_token: null, lease_until: null })
    .eq("game_id", gameId)
    .eq("lease_token", token)
  if (error) console.warn(`[report-work] release:${error.code}`)
}

export const reserveReportCompose = (gameId: string, token: string, version: string) =>
  rpc<{ status: "busy" | "held" } | { status: "reserved"; attempt: ComposeReservation }>(
    "reserve_report_compose",
    { p_game_id: gameId, p_token: token, p_version: version }
  )

export async function markReportCall(id: number, field: "compose_called" | "verify_called") {
  const { data, error } = await createServiceRoleClient()
    .from("match_report_attempts")
    .update({ [field]: true })
    .eq("id", id)
    .is("resolved_at", null)
    .gt("reserved_until", new Date().toISOString())
    .select("id")
    .maybeSingle()
  if (error || !data) throw new Error(`report-call-write:${error?.code ?? "reservation-expired"}`)
}

export const finishReportCompose = (
  gameId: string,
  token: string,
  id: number,
  stage: "compose" | "verify" | "draft",
  reason: string | null,
  passed: boolean | null,
  draft: MatchReport | null = null
) =>
  rpc<void>("finish_report_compose", {
    p_game_id: gameId,
    p_token: token,
    p_attempt_id: id,
    p_stage: stage,
    p_reason: reason,
    p_verify_passed: passed,
    p_draft: draft,
  })

export async function holdReportDictionary(
  gameId: string,
  lease: ReportLease,
  version: string,
  missing: string[]
) {
  // Avoid appending identical dictionary holds on every cron/page visit.
  if (lease.work.status === "dictionary" && lease.work.input_version === version) return
  const reason = `선수 표기 미등재: ${missing.join(", ")}`
  const { error } = await createServiceRoleClient().from("match_report_attempts").insert({
    game_id: gameId,
    event_id: lease.work.event_id,
    stage: "dictionary",
    input_version: version,
    missing_names: missing,
    reason,
  })
  if (error) throw new Error(`report-dictionary-write:${error.code}`)
  await saveReportWork(gameId, lease.token, {
    status: "dictionary",
    input_version: version,
    missing_names: missing,
    reason,
    held_at: lease.work.held_at ?? new Date().toISOString(),
  })
}

export async function loadReportDraft(
  gameIds: string[]
): Promise<{ event_id: string; draft: MatchReport } | null> {
  const { data, error } = await createServiceRoleClient()
    .from("match_report_attempts")
    .select("event_id, draft")
    .in("game_id", gameIds)
    .eq("stage", "draft")
    .eq("verify_passed", true)
    .not("draft", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`report-draft-read:${error.code}`)
  return data
}

export async function listReportWork(): Promise<ReportWorkStatus[]> {
  const rows: ReportWorkStatus[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await createServiceRoleClient()
      .from("match_report_work_status")
      .select("*")
      .neq("status", "stored")
      .not("context", "is", null)
      .order("updated_at")
      .order("game_id")
      .range(offset, offset + 499)
    if (error) throw new Error(`report-work-read:${error.code}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}

export function reportRetryEligible(work: ReportWork, now = Date.now()): boolean {
  // Verified drafts survive the automatic generation window.
  if (work.status === "draft" || work.manual_resume) return true
  return (
    !!work.context &&
    !!work.finished_at &&
    now - Date.parse(work.finished_at) <= REPORT_RECHECK_DAYS * 86400_000
  )
}

export async function listReportRetryTargets() {
  return (await listReportWork())
    .filter((w) => reportRetryEligible(w))
    .map((w) => ({
      gameId: w.game_id,
      homeTeam: w.context!.homeTeam,
      awayTeam: w.context!.awayTeam,
    }))
}

export const resumeReportWork = (gameId: string, version: string, reason: string, actor: string) =>
  rpc<void>("resume_match_report", {
    p_game_id: gameId,
    p_version: version,
    p_reason: reason,
    p_actor: actor,
  })
