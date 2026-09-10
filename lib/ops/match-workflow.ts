import type { SupabaseClient } from "@supabase/supabase-js"
import { readAuditByIds, type AuditMatchGroup } from "./match-identities"

type Detail = {
  game_id: string
  lfa_match_id: string | null
  finished: boolean
  updated_at: string
  payload: { homeScore?: number | null; awayScore?: number | null; stats?: unknown[] } | null
}
type Lineup = { game_id: string; payload: { status?: string; projected?: boolean } | null }
type Thread = { match_game_id: string; deleted_at: string | null }
type Report = { game_id: string }
type Poll = { game_id: string | null; match_key: string; kind: string }

/** null means the DB could not be checked, not that the artifact is absent. */
export interface WorkflowEvidence {
  id: boolean | null
  lineup: boolean | null
  thread: boolean | null
  score: boolean | null
  stat: boolean | null
  motm: boolean | null
  report: boolean | null
}

export async function inspectMatchWorkflow(db: SupabaseClient, groups: AuditMatchGroup[]) {
  const ids = groups.flatMap((g) => g.ids)
  const keys = groups.flatMap((g) => g.pollKeys)
  const errors: string[] = []
  async function inspect<T>(label: string, query: Promise<T[]>): Promise<T[] | null> {
    try {
      return await query
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
  const [details, lineups, threads, reports, polls] = await Promise.all([
    inspect(
      "상세",
      readAuditByIds<Detail>(
        db,
        "match_details_cache",
        "game_id,lfa_match_id,payload,finished,updated_at",
        "game_id",
        ids
      )
    ),
    inspect(
      "라인업",
      readAuditByIds<Lineup>(db, "match_lineups", "game_id,payload", "game_id", ids)
    ),
    inspect(
      "불판",
      readAuditByIds<Thread>(db, "posts", "match_game_id,deleted_at", "match_game_id", ids)
    ),
    inspect("리포트", readAuditByIds<Report>(db, "match_reports", "game_id", "game_id", ids)),
    inspect(
      "MOTM",
      Promise.all([
        readAuditByIds<Poll>(db, "polls", "game_id,match_key,kind", "game_id", ids),
        readAuditByIds<Poll>(db, "polls", "game_id,match_key,kind", "match_key", keys),
      ]).then((rows) => rows.flat())
    ),
  ])
  const rows = groups.map((group) => {
    const own = (id: string | null) => id != null && group.ids.includes(id)
    // Keep the existing FT preference; among equal states prefer the newest saved evidence.
    const det = details
      ?.filter((d) => own(d.game_id))
      .sort(
        (a, b) =>
          Number(b.finished) - Number(a.finished) || b.updated_at.localeCompare(a.updated_at)
      )[0]
    const evidence: WorkflowEvidence = {
      id:
        group.lfaMatchIds.length > 0 ||
        (details ? details.some((d) => own(d.game_id) && !!d.lfa_match_id) : null),
      lineup: lineups
        ? lineups.some(
            (l) => own(l.game_id) && l.payload?.status === "ready" && l.payload.projected !== true
          )
        : null,
      thread: threads ? threads.some((t) => own(t.match_game_id) && t.deleted_at == null) : null,
      score: details ? det?.payload?.homeScore != null && det?.payload?.awayScore != null : null,
      stat: details ? Array.isArray(det?.payload?.stats) && det.payload.stats.length > 0 : null,
      motm: polls
        ? polls.some(
            (p) => p.kind === "motm" && (own(p.game_id) || group.pollKeys.includes(p.match_key))
          )
        : null,
      report: reports ? reports.some((r) => own(r.game_id)) : null,
    }
    return { group, evidence }
  })
  return { rows, errors }
}
