/**
 * 선수 한글명 **후보** 생성 (2026-08-25 운영자 요청: "전체 후보를 올려놓은 다음에 검수").
 *
 * ## 어디에 쓰는가
 * `team_squads.name_kr` 이 비어 있는 선수에게 **로마자 → 한글 음차 후보**를 만들어
 * `name_kr_draft` 에 넣는다.
 *
 * ⚠️⚠️ **`name_kr` 에는 절대 쓰지 않는다.** 화면(`cachedSquad` 등)은 status 를 보지 않고
 *    `name_kr` 을 그대로 쓰므로, 여기에 넣으면 검수 안 된 추정치가 즉시 라이브로 나간다.
 *    이 스크립트가 만드는 건 **제안일 뿐**이고, 운영자가 검수 화면에서 승인해야 name_kr 이 된다.
 *
 * ## 왜 기계가 만드나
 * 수확기(나무위키 경유)가 2026-08-25 현재 Cloudflare 로 막혀 있고, 뚫어도 이름 추출 층이
 * 따로 깨져 있다(150명 중 2명 대조). 어차피 최종 판정은 운영자가 하므로 후보 생성원을
 * 수확기에서 LLM 으로 바꾼다 — 품질 관문은 그대로다.
 *
 * ## 규율
 * - **국적 힌트를 준다.** 같은 철자도 언어마다 다르게 읽는다 (Yılmaz 터키어 / Silva 포르투갈어).
 * - **한국 선수는 원래 이름으로.** "Hyeon-Gyu Oh" → 오현규. 음차하면 "오 현규" 같은 게 나온다.
 * - 모호하면 **비워 둔다**. 틀린 후보는 검수자의 시간을 더 쓰게 만든다.
 * - 이미 `name_kr` 이 있으면 건드리지 않는다.
 *
 * 실행:
 *   pnpm exec tsx scripts/draft-squad-names.ts --team <soccerway_team_id>
 *   pnpm exec tsx scripts/draft-squad-names.ts --league 라리가
 *   pnpm exec tsx scripts/draft-squad-names.ts --all           # 화면에 뜨는 팀 전체
 *   ... --apply    # 붙이면 DB 에 쓴다 (기본은 미리보기)
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { chatParams } from "../lib/llm/openai-params"

const APPLY = process.argv.includes("--apply")
const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const TEAM = arg("team")
const LEAGUE = arg("league")
const ALL = process.argv.includes("--all")
const MODEL = process.env.SQUAD_DRAFT_MODEL || "gpt-4.1"

/** 한 번에 보낼 선수 수 — 너무 크면 모델이 뒤쪽을 대충 만든다 (실측 25가 안정적) */
const BATCH = 25

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface Row {
  soccerway_team_id: string
  player_slug: string
  name_en: string
  team_kr: string
}

/** 화면에 실제로 뜨는 리그 — 여기 밖 팀은 후보를 만들어도 볼 일이 없다 */
const SCREEN_LEAGUES = ["EPL", "라리가", "세리에A", "분데스리", "프리그1", "UCL", "UEL", "UECL"]

async function loadTargets(): Promise<Row[]> {
  // 최근·예정 경기에 나오는 팀만 — 전 세계 스쿼드를 다 만들 이유가 없다
  const { data: games } = await supabase
    .from("betman_games")
    .select("home_team_name, away_team_name, league_code, match_time")
    .in("league_code", LEAGUE ? [LEAGUE] : SCREEN_LEAGUES)
    .gte("match_time", new Date(Date.now() - 60 * 86400_000).toISOString())
  const names = new Set<string>()
  for (const g of games ?? []) {
    if (g.home_team_name) names.add(String(g.home_team_name))
    if (g.away_team_name) names.add(String(g.away_team_name))
  }

  const { data: dict } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_kr")
    .not("name_kr", "is", null)
  const teamIds = new Map<string, string>()
  for (const d of dict ?? []) {
    if (TEAM ? d.soccerway_team_id === TEAM : names.has(String(d.name_kr))) {
      teamIds.set(String(d.soccerway_team_id), String(d.name_kr))
    }
  }
  if (teamIds.size === 0) return []

  const out: Row[] = []
  const ids = [...teamIds.keys()]
  // .in() 대량 배열은 400 이 난다 (메모리: reference_sentry_api 의 재발 패턴) — 잘라서 돈다
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await supabase
      .from("team_squads")
      .select("soccerway_team_id, player_slug, name_en")
      .in("soccerway_team_id", ids.slice(i, i + 50))
      .is("name_kr", null)
      .is("name_kr_draft", null)
      .neq("status", "rejected")
    for (const r of data ?? []) {
      out.push({
        soccerway_team_id: String(r.soccerway_team_id),
        player_slug: String(r.player_slug),
        name_en: String(r.name_en),
        team_kr: teamIds.get(String(r.soccerway_team_id)) ?? "",
      })
    }
  }
  return out
}

const PROMPT = `너는 한국 축구 매체의 표기 담당자다. 축구 선수의 로마자 이름을 한국 축구 매체에서 쓰는 한글 표기로 옮겨라.

규칙:
1. 한국 축구 매체(스포츠 신문·중계)에서 실제로 쓰는 표기를 쓴다. 국립국어원 외래어 표기법보다 매체 관행이 우선이다.
2. 선수의 **국적/언어**에 맞게 읽는다. 같은 철자도 언어마다 다르다 (Silva: 포르투갈어 '실바', García: 스페인어 '가르시아').
3. **한국 선수는 음차하지 말고 원래 한국 이름을 쓴다.** 예: "Hyeon-Gyu Oh" → "오현규", "Heung-Min Son" → "손흥민".
4. 스페인·포르투갈계 복성은 **첫 성만** 쓴다. 예: "Daniel Martínez Moreno" → "다니엘 마르티네스".
5. 널리 알려진 선수는 통용 표기를 쓴다. 예: "Mohamed Salah" → "모하메드 살라".
6. **확신이 없으면 빈 문자열("")을 반환한다.** 틀린 추정은 검수자의 시간을 더 쓰게 만든다.
7. 한글·가운뎃점(·)·공백만 쓴다. 로마자를 섞지 않는다.

입력은 JSON 배열이다. 각 항목의 id 를 그대로 유지해서 답하라.
출력 형식: {"names":[{"id":"<입력 id>","kr":"<한글명 또는 빈 문자열>"}]}`

async function draftBatch(team: string, rows: Row[]): Promise<Map<string, string>> {
  const payload = rows.map((r, i) => ({ id: String(i), en: r.name_en }))
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      ...chatParams(MODEL, { temperature: 0 }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `소속팀: ${team}\n선수:\n${JSON.stringify(payload)}` },
      ],
    }),
  })
  if (!res.ok) {
    console.warn(`  [LLM ${res.status}] ${(await res.text()).slice(0, 160)}`)
    return new Map()
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) return new Map()
  let parsed: { names?: { id?: string; kr?: string }[] }
  try {
    parsed = JSON.parse(content)
  } catch {
    return new Map()
  }
  const out = new Map<string, string>()
  for (const n of parsed.names ?? []) {
    const row = rows[Number(n.id)]
    const kr = (n.kr ?? "").trim()
    if (!row || !kr) continue
    // ⚠️ 모델이 규칙을 어길 수 있다 — 형식은 여기서 다시 막는다 (API 검사와 같은 정규식)
    if (!/^[가-힣·\s-]{2,20}$/.test(kr)) continue
    out.set(row.player_slug, kr)
  }
  return out
}

async function main() {
  if (!TEAM && !LEAGUE && !ALL) {
    console.error("--team <id> / --league <코드> / --all 중 하나가 필요합니다")
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY 가 없습니다")
    process.exit(1)
  }

  const rows = await loadTargets()
  console.log(`대상 ${rows.length}명 (후보 없음 + 확정 없음)`)
  if (rows.length === 0) return

  const byTeam = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byTeam.get(r.soccerway_team_id) ?? []
    arr.push(r)
    byTeam.set(r.soccerway_team_id, arr)
  }

  let made = 0
  let written = 0
  for (const [teamId, list] of byTeam) {
    const teamKr = list[0].team_kr
    const drafts = new Map<string, string>()
    for (let i = 0; i < list.length; i += BATCH) {
      const got = await draftBatch(teamKr, list.slice(i, i + BATCH))
      for (const [slug, kr] of got) drafts.set(slug, kr)
    }
    made += drafts.size
    console.log(`  ${teamKr.padEnd(18)} ${drafts.size}/${list.length} 후보`)

    if (APPLY) {
      for (const [slug, kr] of drafts) {
        const { error } = await supabase
          .from("team_squads")
          .update({ name_kr_draft: kr })
          .eq("soccerway_team_id", teamId)
          .eq("player_slug", slug)
          .is("name_kr", null) // ⚠️ 확정된 이름은 절대 안 건드린다
        if (!error) written++
      }
    }
  }

  console.log(
    `\n합계 후보 ${made}명 / 대상 ${rows.length}명` +
      (APPLY ? ` — DB 기록 ${written}건` : " — 미리보기, --apply 로 반영")
  )
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exitCode = 1
})
