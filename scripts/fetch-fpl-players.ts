/**
 * FPL 선수 몸값 동기화 — `public/data/fpl-players.json` 갱신 (2026-08-25).
 *
 *   pnpm exec tsx scripts/fetch-fpl-players.ts          # 미리보기(파일 안 씀)
 *   pnpm exec tsx scripts/fetch-fpl-players.ts --write  # 실제 저장
 *
 * ## 왜 스크레이핑이 아닌가
 * 운영자 요청은 "Playwright 로 공식 프리미어리그 선수 몸값을 가져와 달라" 였지만,
 * FPL 은 **로그인 없이 열리는 공개 JSON API** 가 있다 (`bootstrap-static`).
 * 브라우저를 띄울 이유가 없고, DOM 변경에 안 깨지며, 매 시즌 재실행이 한 줄이다.
 * (로그인이 필요한 건 *본인 팀* 정보뿐이다 — 선수 몸값·포지션·소속은 전부 공개다.)
 *
 * ## 한글 표기
 * 이 프로젝트의 진짜 자산은 몸값이 아니라 **한글 표기**다. 두 곳에서 끌어온다:
 *  1. 기존 `fpl-players.json` (820명 전원 한글) — 시즌이 바뀌어도 이름은 그대로다
 *  2. `team_squads.name_kr` (3,580명) — LFA 스쿼드 피드로 쌓인 사전
 * 둘 다 못 찾으면 영문을 그대로 둔다. 새로 올라온 선수는 사전에 없는 게 정상이고,
 * 운영자가 나중에 채우면 다음 실행부터 붙는다. **자동 번역은 하지 않는다** —
 * 표기 사고의 단골 원인이다 (docs: 표기 정본 = 운영자 확정 > 네이버 > 구글).
 */

import "dotenv/config"
import { promises as fs } from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const API = "https://fantasy.premierleague.com/api/bootstrap-static/"
const OUT = path.join(process.cwd(), "public", "data", "fpl-players.json")

type Position = "GK" | "DF" | "MF" | "FW"

/** FPL element_type → 우리 포지션 코드 */
const POS: Record<number, Position> = { 1: "GK", 2: "DF", 3: "MF", 4: "FW" }

interface OutPlayer {
  id: string
  name: string
  nameKo: string
  team: string
  teamKo: string
  position: Position
  price: number
}

interface FplElement {
  id: number
  web_name: string
  first_name: string
  second_name: string
  team: number
  element_type: number
  now_cost: number
  status: string
}

interface FplTeam {
  id: number
  name: string
  short_name: string
}

/** 표기 비교용 정규화 — 악센트·공백·대소문자를 지운다 */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

async function main() {
  const write = process.argv.includes("--write")

  const res = await fetch(API, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!res.ok) throw new Error(`FPL API ${res.status}`)
  const data = (await res.json()) as { elements: FplElement[]; teams: FplTeam[] }

  const teamById = new Map(data.teams.map((t) => [t.id, t.name]))

  // ── 한글 표기 사전 1: 기존 파일 ──
  const prevKoByName = new Map<string, string>()
  const teamKoByEn = new Map<string, string>()
  try {
    const prev = JSON.parse(await fs.readFile(OUT, "utf-8")) as OutPlayer[]
    for (const p of prev) {
      if (p.nameKo && p.nameKo !== p.name) prevKoByName.set(norm(p.name), p.nameKo)
      if (p.team && p.teamKo) teamKoByEn.set(norm(p.team), p.teamKo)
    }
    console.log(`기존 파일: 선수 한글 ${prevKoByName.size}건 · 팀 한글 ${teamKoByEn.size}건`)
  } catch {
    console.log("기존 파일 없음 — 사전 없이 진행")
  }

  // ── 한글 표기 사전 2: team_squads (LFA 스쿼드 피드) ──
  const squadKoByName = new Map<string, string>()
  const squadKoBySurname = new Map<string, string>()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    const sb = createClient(url, key)
    let from = 0
    for (;;) {
      const { data: rows, error } = await sb
        .from("team_squads")
        .select("name_en, name_kr")
        .not("name_kr", "is", null)
        .range(from, from + 999)
      if (error) {
        console.warn("team_squads 조회 실패:", error.message)
        break
      }
      if (!rows?.length) break
      for (const r of rows) {
        const en = String(r.name_en ?? "").trim()
        const kr = String(r.name_kr ?? "").trim()
        if (!en || !kr) continue
        squadKoByName.set(norm(en), kr)
        // ⚠️ FPL 은 `web_name` 으로 **성만** 준다("Raya"). 사전은 "성 이름" 형태라
        //    전체 문자열로는 절대 안 맞는다 (실측: 3,577건 중 30건만 매칭).
        //    성 토큰을 따로 색인해 둔다. 성이 겹치면 먼저 온 값을 유지한다.
        const surname = en.split(/\s+/)[0]
        if (surname && !squadKoBySurname.has(norm(surname))) {
          squadKoBySurname.set(norm(surname), kr)
        }
      }
      if (rows.length < 1000) break
      from += 1000
    }
    console.log(
      `team_squads: 선수 한글 ${squadKoByName.size}건 (성 색인 ${squadKoBySurname.size}건)`
    )

    // ── 팀 한글: team_dictionary (승격팀은 기존 파일에 없다) ──
    const { data: teamRows } = await sb
      .from("team_dictionary")
      .select("name_en, name_kr")
      .not("name_kr", "is", null)
    for (const r of teamRows ?? []) {
      const en = String(r.name_en ?? "").trim()
      const kr = String(r.name_kr ?? "").trim()
      if (en && kr && !teamKoByEn.has(norm(en))) teamKoByEn.set(norm(en), kr)
    }
    console.log(`team_dictionary: 팀 한글 누적 ${teamKoByEn.size}건`)
  } else {
    console.warn("Supabase 자격증명 없음 — team_squads 사전 건너뜀")
  }

  // ── 변환 ──
  const out: OutPlayer[] = []
  let fromPrev = 0
  let fromSquad = 0
  let missing = 0
  const missingNames: string[] = []

  for (const e of data.elements) {
    const teamEn = teamById.get(e.team) ?? "Unknown"
    const full = `${e.first_name} ${e.second_name}`.trim()
    const keys = [norm(e.web_name), norm(e.second_name), norm(full)]

    let nameKo = ""
    for (const k of keys) {
      const hit = prevKoByName.get(k)
      if (hit) {
        nameKo = hit
        fromPrev++
        break
      }
    }
    if (!nameKo) {
      for (const k of keys) {
        const hit = squadKoByName.get(k) ?? squadKoBySurname.get(k)
        if (hit) {
          nameKo = hit
          fromSquad++
          break
        }
      }
    }
    if (!nameKo) {
      nameKo = e.web_name // 영문 그대로 — 자동 번역하지 않는다
      missing++
      if (missingNames.length < 25) missingNames.push(`${e.web_name} (${teamEn})`)
    }

    out.push({
      id: `p${e.id}`,
      name: e.web_name,
      nameKo,
      team: teamEn,
      teamKo:
        teamKoByEn.get(norm(teamEn)) ?? teamKoByEn.get(norm(teamEn.split(/\s+/)[0])) ?? teamEn,
      position: POS[e.element_type],
      price: Math.round(e.now_cost) / 10, // FPL 은 10배 정수로 준다 (60 = £6.0)
    })
  }

  // ── 보고 ──
  const byPos = out.reduce<Record<string, number>>((a, p) => {
    a[p.position] = (a[p.position] ?? 0) + 1
    return a
  }, {})
  const prices = out.map((p) => p.price).sort((a, b) => b - a)
  console.log(`\n선수 ${out.length}명 · 팀 ${new Set(out.map((p) => p.team)).size}개`)
  console.log(
    `포지션: ${Object.entries(byPos)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`
  )
  console.log(
    `몸값: 최고 £${prices[0]} · 중앙값 £${prices[Math.floor(prices.length / 2)]} · 최저 £${prices[prices.length - 1]}`
  )
  console.log(`한글: 기존파일 ${fromPrev} · 스쿼드사전 ${fromSquad} · 미등재 ${missing}`)
  const teamKoMissing = out.filter((p) => p.teamKo === p.team).length
  if (teamKoMissing) console.log(`⚠️ 팀 한글 미등재 ${teamKoMissing}건`)
  if (missingNames.length) {
    console.log(`\n한글 미등재 예시 (최대 25):`)
    for (const n of missingNames) console.log(`  · ${n}`)
  }

  if (!write) {
    console.log(`\n미리보기입니다. 저장하려면 --write 를 붙이세요.`)
    return
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 0), "utf-8")
  console.log(`\n✅ 저장: ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
