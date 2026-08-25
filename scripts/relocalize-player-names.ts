/**
 * 저장된 선수 이름에 **표기만 다시 입힌다** — MoTM 투표판 + 매치센터 라인업
 * (2026-08-25 외부 감사 P1-5).
 *
 * ## 왜 필요한가
 * 투표판 옵션에 피드 약어가 그대로 굳어 있다 — "Palacios C." · "Quenda G." · "Budimir A.".
 * 한국 독자에게 이건 이름이 아니라 시스템 찌꺼기다. 실측 38개 폴 / 영문 옵션 475개.
 *
 * 코드(`lib/lfa/player-name.ts`)를 고쳐도 **저장분은 안 바뀐다.** 폴 옵션은 만들 때
 * 한 번 계산해 눕혀 두기 때문이다. 오늘만 세 번째 겪는 함정이라 이번엔 바로 손본다.
 *
 * ⚠️ 이미 한글인 옵션에 다시 돌려도 안전하다 — 한글은 대조 토큰이 비어 매칭이 안 되고
 *    원문이 그대로 돌아온다 (테스트로 고정).
 *
 *   pnpm exec tsx scripts/relocalize-player-names.ts          # 미리보기
 *   pnpm exec tsx scripts/relocalize-player-names.ts --apply
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { localizePlayerName, tidyFeedName, type SquadName } from "../lib/lfa/player-name"

const APPLY = process.argv.includes("--apply")
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

/**
 * 팀 한글 표기 → 팀 id.
 *
 * ⚠️ 정확일치만 쓰면 못 찾는다. 저장분의 팀 표기는 띄어쓰기가 없거나("맨체스터유나이티드")
 *    잘려 있다("맨체스U"). 실측에서 103개 표기가 미해결이었다.
 *    규칙은 `lib/match/resolve-team-id.ts` 와 같다 — 정확일치 → 별칭 → 포함관계.
 *    (그 모듈은 server-only 라 스크립트에서 못 부른다. 규칙이 바뀌면 양쪽 다 고칠 것.)
 */
interface DictRow {
  id: string
  nameKr: string
  aliases: string[]
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s&·．.\-_'"()]/g, "")
    .trim()

async function loadTeamDict(): Promise<DictRow[]> {
  const { data } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_kr, aliases_kr")
    .neq("status", "rejected")
    .not("name_kr", "is", null)
  return (data ?? []).map((r) => ({
    id: String(r.soccerway_team_id),
    nameKr: String(r.name_kr),
    aliases: ((r.aliases_kr as string[] | null) ?? []).map(String),
  }))
}

function resolveTeam(dict: DictRow[], teamKr: string): string | null {
  const src = String(teamKr ?? "").trim()
  if (!src) return null
  const exact = dict.find((d) => d.nameKr === src)
  if (exact) return exact.id
  const byAlias = dict.filter((d) => d.aliases.includes(src))
  if (byAlias.length === 1) return byAlias[0].id
  // 짧은 쪽이 3글자 미만이면 우연히 걸린다 ("렌"·"AC") → 제외
  const a = norm(src)
  if (a.length < 3) return null
  const hits = dict.filter((d) => {
    const b = norm(d.nameKr)
    return b.length >= 3 && (a.includes(b) || b.includes(a))
  })
  return hits.length === 1 ? hits[0].id : null
}

const squadCache = new Map<string, SquadName[]>()
async function squadOf(teamId: string): Promise<SquadName[]> {
  const hit = squadCache.get(teamId)
  if (hit) return hit
  const { data } = await supabase
    .from("team_squads")
    .select("name_en, name_kr")
    .eq("soccerway_team_id", teamId)
    .neq("status", "rejected")
  const rows = (data ?? []).map((r) => ({
    nameEn: String(r.name_en ?? ""),
    nameKr: r.name_kr ? String(r.name_kr) : null,
  }))
  squadCache.set(teamId, rows)
  return rows
}

interface Option {
  key: string
  label: string
  team_label?: string
  [k: string]: unknown
}

async function main() {
  const dict = await loadTeamDict()
  const { data: polls } = await supabase
    .from("polls")
    .select("id, question, options")
    .eq("kind", "motm")

  let touched = 0
  let fields = 0
  let reordered = 0
  const samples: string[] = []
  const noTeam = new Set<string>()

  for (const p of polls ?? []) {
    const options = (p.options ?? []) as Option[]
    if (!Array.isArray(options)) continue
    let changed = false

    for (const o of options) {
      const before = String(o.label ?? "")
      if (!/[A-Za-z]{2,}/.test(before)) continue // 이미 한글이면 건드릴 이유가 없다
      const teamId = o.team_label ? resolveTeam(dict, o.team_label) : null
      if (!teamId) {
        if (o.team_label) noTeam.add(o.team_label)
        continue
      }
      const after = localizePlayerName(before, await squadOf(teamId))
      if (after !== before) {
        // 순서만 뒤집힌 것과 **진짜 이름을 찾은 것**을 나눠 본다 — 후자가 이 작업의 목적이다
        if (after === tidyFeedName(before)) reordered++
        else if (samples.length < 15) samples.push(`${before}  →  ${after}`)
        o.label = after
        changed = true
        fields++
      }
    }

    if (changed) {
      touched++
      if (APPLY) {
        await supabase
          .from("polls")
          .update({ options: options as unknown as Record<string, unknown>[] })
          .eq("id", p.id)
      }
    }
  }

  console.log(
    `투표판 ${polls?.length ?? 0}개 중 ${touched}개 / 이름 ${fields}개 교정 (진짜 이름 ${fields - reordered}, 순서만 ${reordered})`
  )

  // ── 매치센터 저장 라인업 — 같은 병, 같은 약 ──
  // 투표판만 고치면 "투표판은 한글인데 라인업은 영문" 이 된다. 같은 화면 안에서
  // 같은 선수가 두 이름으로 불리는 건 이번 감사가 지적한 바로 그 종류의 사고다.
  const { data: lineups } = await supabase.from("match_lineups").select("game_id, payload")
  let lTouched = 0
  let lFields = 0
  for (const row of lineups ?? []) {
    const payload = row.payload as Record<string, unknown> | null
    if (!payload) continue
    let changed = false
    for (const side of ["home", "away"] as const) {
      const s = payload[side] as
        | { teamLabel?: string; starters?: Option[]; bench?: Option[] }
        | undefined
      if (!s?.teamLabel) continue
      const teamId = resolveTeam(dict, s.teamLabel)
      if (!teamId) {
        noTeam.add(s.teamLabel)
        continue
      }
      const roster = await squadOf(teamId)
      for (const group of [s.starters, s.bench]) {
        for (const pl of group ?? []) {
          const before = String(pl.label ?? "")
          if (!/[A-Za-z]{2,}/.test(before)) continue
          const after = localizePlayerName(before, roster)
          if (after !== before) {
            pl.label = after
            changed = true
            lFields++
          }
        }
      }
    }
    if (changed) {
      lTouched++
      if (APPLY) {
        await supabase
          .from("match_lineups")
          .update({ payload: payload as never })
          .eq("game_id", row.game_id)
      }
    }
  }
  console.log(`라인업 ${lineups?.length ?? 0}건 중 ${lTouched}건 / 이름 ${lFields}개 교정`)
  samples.forEach((s) => console.log("  ", s))
  if (noTeam.size) console.log(`\n팀을 못 찾은 표기 ${noTeam.size}개: ${[...noTeam].join(", ")}`)
  console.log(APPLY ? "\n반영 완료" : "\n미리보기 — --apply 로 반영")
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
