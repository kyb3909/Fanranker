/**
 * 반쪽 라인업 일괄 수리 CLI (2026-08-31 일회성 복구).
 *
 * ## 무엇을 고치나
 * LFA 로 채워진 저장 라인업이 **전부 벤치 0 명**이었다. 원인은 두 가지 shape 오독:
 *  · 벤치 필드명이 `subs` 인데 코드가 `substitutes ?? bench` 를 읽었다
 *  · `is_projected`(예상 라인업) 플래그를 안 봐서 킥오프 전 예상 XI 가 그대로 굳었다
 *    (첼시:브라이턴 — 저장분은 리스 제임스 선발, 실제로는 68분 교체 투입)
 *
 * 코드는 `lib/lfa/lineup-shape.ts` 로 고쳤지만 **저장분은 다시 안 읽으므로** 이미
 * 굳은 행은 스스로 낫지 않는다. 그 행들을 확정 라인업으로 갈아끼운다.
 *
 * ## 규율
 * - 대상은 **양 팀 벤치가 모두 빈** ready 라인업 + 킥오프가 지난 경기뿐.
 * - LFA 가 예상 라인업을 주거나 벤치가 없으면 **건드리지 않는다** (기존 행 유지).
 * - 경기당 LFA 1크레딧. `--limit` 로 상한을 둔다.
 * - `--post` 없이는 아무것도 쓰지 않는다 (기본이 미리보기).
 *
 *   pnpm exec tsx scripts/backfill-lineup-bench.ts --days=14           # 미리보기
 *   pnpm exec tsx scripts/backfill-lineup-bench.ts --days=14 --post    # 실제 적재
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { normalizeLfaLineups } from "@/lib/lfa/lineup-shape"
import { localizePlayerName, type SquadName } from "@/lib/lfa/player-name"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

interface StoredSidePlayer {
  label: string
  number: number | null
  roman: string | null
}
interface StoredSide {
  teamLabel: string
  formation: string | null
  starters: StoredSidePlayer[]
  bench: StoredSidePlayer[]
}
interface StoredLineup {
  status: string
  kickoff: string
  home: StoredSide
  away: StoredSide
  fetchedAt: string
}

/** 팀 한글명 → 스쿼드 (표기 흔들림 흡수는 lib/match/resolve-team-id 와 같은 규칙) */
function makeSquadLookup(sb: SupabaseClient) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s&·．.\-_'"()]/g, "")
  const cache = new Map<string, SquadName[]>()
  let dict: { id: string; nameKr: string; aliases: string[] }[] | null = null

  return async (teamKr: string): Promise<SquadName[]> => {
    const hit = cache.get(teamKr)
    if (hit) return hit
    if (!dict) {
      const { data } = await sb
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, aliases_kr")
        .neq("status", "rejected")
        .not("name_kr", "is", null)
      dict = (data ?? []).map((r) => ({
        id: String(r.soccerway_team_id),
        nameKr: String(r.name_kr),
        aliases: ((r.aliases_kr as string[] | null) ?? []).map(String),
      }))
    }
    const a = norm(teamKr)
    const exact = dict.find((d) => d.nameKr === teamKr)
    const byAlias = dict.filter((d) => d.aliases.includes(teamKr))
    const contains =
      a.length >= 3
        ? dict.filter((d) => {
            const b = norm(d.nameKr)
            return b.length >= 3 && (a.includes(b) || b.includes(a))
          })
        : []
    const team =
      exact ?? (byAlias.length === 1 ? byAlias[0] : contains.length === 1 ? contains[0] : null)
    if (!team) {
      cache.set(teamKr, [])
      return []
    }
    const { data } = await sb
      .from("team_squads")
      .select("name_en, name_kr")
      .eq("soccerway_team_id", team.id)
      .neq("status", "rejected")
    const squad = (data ?? []).map((r) => ({
      nameEn: String(r.name_en ?? ""),
      nameKr: r.name_kr ? String(r.name_kr) : null,
    }))
    cache.set(teamKr, squad)
    return squad
  }
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--post")
  const days = Number(args.find((a) => a.startsWith("--days="))?.slice(7) ?? 14)
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 300)
  const apiKey = process.env.LIVE_FOOTBALL_API_KEY
  if (!apiKey) throw new Error("LIVE_FOOTBALL_API_KEY 없음")

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const squadFor = makeSquadLookup(sb)

  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const { data: rows, error } = await sb
    .from("match_lineups")
    .select("game_id, event_id, payload")
    .gte("updated_at", since)
  if (error) throw error

  // 대상 = 양 팀 벤치가 모두 비고, 킥오프가 지난 ready 라인업
  const targets = (rows ?? [])
    .map((r) => ({ ...r, payload: r.payload as unknown as StoredLineup }))
    .filter(
      (r) =>
        r.payload?.status === "ready" &&
        r.payload.home?.bench?.length === 0 &&
        r.payload.away?.bench?.length === 0 &&
        new Date(r.payload.kickoff).getTime() < Date.now()
    )
    .slice(0, limit)

  console.log(
    `대상 ${targets.length}행 (최근 ${days}일, 상한 ${limit})${apply ? "" : " — 미리보기"}`
  )
  if (targets.length === 0) return

  let fixed = 0
  const skipped: Record<string, number> = {}
  const bump = (k: string) => (skipped[k] = (skipped[k] ?? 0) + 1)

  for (const t of targets) {
    const qs = new URLSearchParams({ api_key: apiKey, match_id: t.event_id, lang: "en" })
    const res = await fetch(`https://live-football-api.com/api/v1/lineups?${qs}`).catch(() => null)
    if (!res?.ok) {
      bump(`http_${res?.status ?? "네트워크"}`)
      continue
    }
    const body = (await res.json().catch(() => null)) as { data?: unknown } | null
    const shaped = normalizeLfaLineups((body as { data?: unknown })?.data ?? (body as unknown))
    if (!shaped) {
      bump("모양_불일치")
      continue
    }
    // 예상 라인업은 절대 저장하지 않는다 — 그게 이 사고의 절반이었다
    if (shaped.projected) {
      bump("예상_라인업")
      continue
    }
    if (shaped.home.subs.length === 0 && shaped.away.subs.length === 0) {
      bump("벤치_없음")
      continue
    }

    const [hs, as_] = await Promise.all([
      squadFor(t.payload.home.teamLabel),
      squadFor(t.payload.away.teamLabel),
    ])
    const people = (
      list: { name?: string; number?: number | string | null }[],
      squad: SquadName[]
    ) =>
      list.map((p) => {
        const raw = String(p.name ?? "").trim()
        const n = Number(p.number)
        return {
          label: localizePlayerName(raw, squad),
          number: Number.isFinite(n) && n > 0 ? n : null,
          roman: raw,
        }
      })

    const payload = {
      status: "ready",
      kickoff: t.payload.kickoff,
      home: {
        teamLabel: t.payload.home.teamLabel,
        formation: shaped.home.formation,
        starters: people(shaped.home.starting, hs),
        bench: people(shaped.home.subs, hs),
      },
      away: {
        teamLabel: t.payload.away.teamLabel,
        formation: shaped.away.formation,
        starters: people(shaped.away.starting, as_),
        bench: people(shaped.away.subs, as_),
      },
      fetchedAt: new Date().toISOString(),
    }

    const tag = `${payload.home.teamLabel} vs ${payload.away.teamLabel}`
    console.log(
      `  ${apply ? "적재" : "예정"} ${tag} — 벤치 ${payload.home.bench.length}/${payload.away.bench.length}, 포메이션 ${payload.home.formation ?? "-"}/${payload.away.formation ?? "-"}`
    )
    if (apply) {
      const { error: upErr } = await sb
        .from("match_lineups")
        .update({ payload, updated_at: new Date().toISOString() })
        .eq("game_id", t.game_id)
      if (upErr) {
        bump(`쓰기_${upErr.code ?? "실패"}`)
        continue
      }
    }
    fixed++
  }

  console.log(`\n${apply ? "적재" : "적재 예정"} ${fixed}/${targets.length}행`)
  if (Object.keys(skipped).length) console.log("건너뜀:", skipped)
  if (!apply) console.log("\n--post 를 붙이면 실제로 적재합니다.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
