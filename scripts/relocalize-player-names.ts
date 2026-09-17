/** Label-only repair using the existing Supabase. No provider calls or local database.
 * Preview: pnpm exec tsx scripts/relocalize-player-names.ts --out=output/player-names-plan.json
 * Apply exactly that preview: ... --apply=output/player-names-plan.json --sha256=<printed hash>
 */
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { parse } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { readPages } from "../lib/dictionary/read-pages"
import { applyLabelRepair } from "../lib/dictionary/label-repair-store"
import {
  assertLabelOnly,
  relocalizeLineup,
  relocalizeMotm,
  type LabelDecision,
} from "../lib/dictionary/relocalize-labels"
import { resolveTeamName, type TeamNameRow } from "../lib/match/team-name-resolution"
import type { SquadName } from "../lib/lfa/player-name"
import type { LineupResponse } from "../lib/match/lineup-types"
import type { MotmOption } from "../lib/motm/options"

const project = "ekysrlhdrapmsnrkytif"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const arg = (key: string) =>
  process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3)
interface Patch {
  table: "match_lineups" | "polls"
  id: string
  before: LineupResponse | MotmOption[]
  after: LineupResponse | MotmOption[]
  changes: LabelDecision[]
}
interface Plan {
  version: 1
  project: string
  createdAt: string
  dictionaryHash: string
  counts: Record<string, number>
  patches: Patch[]
  unresolved: (LabelDecision & { table: string; id: string })[]
  /** 수리 후에도 영문으로 남는 표시 칸 전체 (unmatched·full-name 포함) — 한글화 미완료의 실제 크기. */
  latinRemaining: { fields: number; byReason: Record<string, number> }
}

async function main() {
  const env = Object.assign(
    {},
    ...[".env", ".env.local"].filter(fs.existsSync).map((f) => parse(fs.readFileSync(f, "utf8"))),
    process.env
  )
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${project}.supabase.co`)
    throw Error("Unexpected Supabase project")
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [teams, squads] = await Promise.all([
    readPages((from, to) =>
      db
        .from("team_dictionary")
        .select("soccerway_team_id,name_kr,aliases_kr,status")
        .order("soccerway_team_id")
        .range(from, to)
    ),
    readPages((from, to) =>
      db
        .from("team_squads")
        .select("soccerway_team_id,player_id,name_en,name_kr,source,status")
        .order("soccerway_team_id")
        .order("player_id")
        .range(from, to)
    ),
  ])
  const dictionaryHash = hash(JSON.stringify({ teams, squads }))
  const apply = arg("apply")
  if (process.argv.includes("--apply"))
    throw Error("Apply requires --apply=<reviewed plan> --sha256=<hash>")
  if (apply) {
    const bytes = fs.readFileSync(apply, "utf8")
    if (hash(bytes) !== arg("sha256")) throw Error("Reviewed plan hash mismatch")
    const plan = JSON.parse(bytes) as Plan
    if (plan.version !== 1 || plan.project !== project || plan.dictionaryHash !== dictionaryHash)
      throw Error("Dictionary or project changed; generate a new preview")
    for (const p of plan.patches) {
      if (!["match_lineups", "polls"].includes(p.table) || !/^[0-9a-f-]{36}$/i.test(p.id))
        throw Error("Invalid patch target")
      assertLabelOnly(p.before, p.after, p.changes)
    }
    const votes = () =>
      readPages((from, to) =>
        db.from("poll_votes").select("id,poll_id,option_key").order("id").range(from, to)
      )
    const beforeVotes = await votes()
    const results: { table: string; id: string; status: string; fields?: number }[] = []
    const journal = `${apply}.applied.json`
    const save = () =>
      fs.writeFileSync(
        journal,
        JSON.stringify(
          { checkedAt: new Date().toISOString(), project, planSha256: hash(bytes), results },
          null,
          2
        )
      )
    for (const p of plan.patches) {
      try {
        const status = await applyLabelRepair(db, p)
        results.push({
          table: p.table,
          id: p.id,
          status,
          fields: status === "applied" ? p.changes.length : 0,
        })
      } catch (error) {
        results.push({
          table: p.table,
          id: p.id,
          status: `error:${error instanceof Error ? error.message : "unknown"}`,
        })
        save()
        throw error
      }
      save()
    }
    const afterVotes = await votes()
    const byId = new Map(afterVotes.map((v) => [v.id, v]))
    const preserved = beforeVotes.every((v) => isDeepStrictEqual(v, byId.get(v.id)))
    const summary = {
      applied: results.filter((r) => r.status === "applied").length,
      conflicts: results.filter((r) => r.status !== "applied").length,
      labelFields: results.reduce((n, r) => n + (r.fields ?? 0), 0),
      votesBefore: beforeVotes.length,
      votesAfter: afterVotes.length,
      existingVotesPreserved: preserved,
    }
    fs.writeFileSync(`${apply}.verification.json`, JSON.stringify(summary, null, 2))
    console.log(JSON.stringify(summary, null, 2))
    if (!preserved || summary.conflicts) process.exitCode = 2
    return
  }

  const dict: TeamNameRow[] = teams
    .filter((t) => t.status !== "rejected" && t.name_kr)
    .map((t) => ({
      id: String(t.soccerway_team_id),
      nameKr: String(t.name_kr),
      aliases: Array.isArray(t.aliases_kr) ? t.aliases_kr.map(String) : [],
    }))
  const byTeam = new Map<string, SquadName[]>()
  for (const r of squads) {
    const key = String(r.soccerway_team_id),
      rows = byTeam.get(key) ?? []
    rows.push({
      playerId: String(r.player_id),
      nameEn: String(r.name_en),
      nameKr: r.name_kr ? String(r.name_kr) : null,
      source: String(r.source),
      status: String(r.status),
    })
    byTeam.set(key, rows)
  }
  const lookup = (team: string) => byTeam.get(resolveTeamName(dict, team) ?? "") ?? []
  const [lineups, polls] = await Promise.all([
    readPages((from, to) =>
      db.from("match_lineups").select("game_id,payload").order("game_id").range(from, to)
    ),
    readPages((from, to) =>
      db.from("polls").select("id,game_id,options").eq("kind", "motm").order("id").range(from, to)
    ),
  ])
  const plan: Plan = {
    version: 1,
    project,
    createdAt: new Date().toISOString(),
    dictionaryHash,
    counts: {
      teams: teams.length,
      squads: squads.length,
      lineups: lineups.length,
      polls: polls.length,
    },
    patches: [],
    unresolved: [],
    latinRemaining: { fields: 0, byReason: {} },
  }
  const add = (
    table: Patch["table"],
    id: string,
    before: Patch["before"],
    repair: { after: Patch["after"]; decisions: LabelDecision[] }
  ) => {
    const changes = repair.decisions.filter((d) => d.before !== d.after)
    if (changes.length) {
      assertLabelOnly(before, repair.after, changes)
      plan.patches.push({ table, id, before, after: repair.after, changes })
    }
    plan.unresolved.push(
      ...repair.decisions
        .filter(
          (d) => d.before === d.after && ["ambiguous", "translation-conflict"].includes(d.reason)
        )
        .map((d) => ({ ...d, table, id }))
    )
    for (const d of repair.decisions) {
      if (d.korean) continue
      plan.latinRemaining.fields++
      plan.latinRemaining.byReason[d.reason] = (plan.latinRemaining.byReason[d.reason] ?? 0) + 1
    }
  }
  const byGame = new Map(lineups.map((r) => [String(r.game_id), r.payload as LineupResponse]))
  for (const r of lineups)
    add(
      "match_lineups",
      String(r.game_id),
      r.payload as LineupResponse,
      relocalizeLineup(r.payload as LineupResponse, lookup)
    )
  for (const r of polls) {
    if (!Array.isArray(r.options)) throw Error(`Invalid options: ${r.id}`)
    add(
      "polls",
      String(r.id),
      r.options as MotmOption[],
      relocalizeMotm(r.options as MotmOption[], byGame.get(String(r.game_id)), lookup)
    )
  }
  const output = arg("out") ?? "output/player-names-plan.json"
  fs.mkdirSync(path.dirname(output), { recursive: true })
  if (fs.existsSync(output)) throw Error("Preview file already exists; use a new --out path")
  const bytes = JSON.stringify(plan, null, 2)
  fs.writeFileSync(output, bytes)
  console.log(
    JSON.stringify(
      {
        output,
        sha256: hash(bytes),
        counts: plan.counts,
        changedRows: plan.patches.length,
        lineupRows: plan.patches.filter((p) => p.table === "match_lineups").length,
        pollRows: plan.patches.filter((p) => p.table === "polls").length,
        changedLabels: plan.patches.reduce((n, p) => n + p.changes.length, 0),
        // 한글로 바뀐 칸만 한글화 성과다. 영문 풀네임 정리는 latinRemaining 에 그대로 남는다.
        koreanLabels: plan.patches.reduce(
          (n, p) => n + p.changes.filter((c) => c.korean).length,
          0
        ),
        unresolved: plan.unresolved.length,
        latinRemaining: plan.latinRemaining,
        samples: plan.patches.flatMap((p) => p.changes).slice(0, 12),
      },
      null,
      2
    )
  )
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Repair failed")
  process.exitCode = 1
})
