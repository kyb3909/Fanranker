import { resolvePlayerName, type PlayerIdentity, type SquadName } from "@/lib/lfa/player-name"
import type { LineupResponse } from "@/lib/match/lineup-types"
import { playerForMotmOption, type MotmOption } from "@/lib/motm/options"

export interface LabelDecision {
  path: string[]
  team: string
  before: string
  after: string
  reason: string
  /** 수리 후에도 한글이 아니면 false — 영문 풀네임은 표기 개선일 뿐 한글화 완료가 아니다. */
  korean: boolean
}
type SquadLookup = (team: string) => SquadName[]

function labelDecision(
  before: string,
  raw: string,
  team: string,
  path: string[],
  squads: SquadLookup,
  identity?: PlayerIdentity
): LabelDecision | null {
  if (/[가-힣]/.test(before) || !/[A-Za-z]{2}/.test(before)) return null
  const resolution = resolvePlayerName(raw, squads(team), identity)
  const resolved = [
    "provider-id",
    "unique-name",
    "unanimous-name",
    "single-korean",
    "full-name",
  ].includes(resolution.reason)
  const after = resolved ? resolution.label : before
  return {
    path,
    team,
    before,
    after,
    reason: resolution.reason,
    korean: /[가-힣]/.test(after),
  }
}

export function relocalizeLineup(payload: LineupResponse, squads: SquadLookup) {
  const after = structuredClone(payload)
  const decisions: LabelDecision[] = []
  if (after.status !== "ready") return { after, decisions }
  for (const side of ["home", "away"] as const) {
    for (const group of ["starters", "bench"] as const) {
      for (const [index, player] of after[side][group].entries()) {
        const identity: PlayerIdentity | undefined =
          after.source === "lfa" && player.id ? { provider: "lfa", playerId: player.id } : undefined
        const decision = labelDecision(
          player.label,
          player.roman || player.label,
          after[side].teamLabel,
          [side, group, String(index), "label"],
          squads,
          identity
        )
        if (!decision) continue
        player.label = decision.after
        decisions.push(decision)
      }
    }
  }
  return { after, decisions }
}

export function relocalizeMotm(
  options: MotmOption[],
  lineup: LineupResponse | undefined,
  squads: SquadLookup
) {
  const after = structuredClone(options)
  const decisions: LabelDecision[] = []
  for (const [index, option] of after.entries()) {
    const player = lineup ? playerForMotmOption(option, lineup) : null
    const identity: PlayerIdentity | undefined =
      lineup?.status === "ready" && lineup.source === "lfa" && player?.id
        ? { provider: "lfa", playerId: player.id }
        : undefined
    const decision = labelDecision(
      option.label,
      player?.roman || option.label,
      option.team_label,
      [String(index), "label"],
      squads,
      identity
    )
    if (!decision) continue
    option.label = decision.after
    decisions.push(decision)
  }
  return { after, decisions }
}

/** Enforce the repair boundary independently of the name matcher before any database write. */
export function assertLabelOnly(before: unknown, after: unknown, changes: LabelDecision[]) {
  const expected = structuredClone(before)
  for (const change of changes) {
    const path = change.path
    if (path.at(-1) !== "label") throw new Error("Repair may only edit labels")
    let node = expected as Record<string, unknown>
    for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>
    if (node.label !== change.before) throw new Error("Unexpected original label")
    node.label = change.after
  }
  if (JSON.stringify(expected) !== JSON.stringify(after))
    throw new Error("Repair changed non-label fields")
}
