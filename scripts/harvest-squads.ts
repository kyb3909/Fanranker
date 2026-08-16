/**
 * 팀 스쿼드 수확 — soccerway(영문·등번호·포지션) × 나무위키(한글명) 대조 → team_squads (2026-08-16).
 *
 * ## 방법 (운영자 지정)
 * "영어 이름을 soccerway 에서 가져오고, 그 팀 문서를 나무위키에서 찾으면 스쿼드 리스트가
 *  있다. 거기 있는 이름을 비교해서 채워넣으면 된다."
 * 나무위키 스쿼드 표는 한글명과 영문명이 나란히 있다(실측: |윌리엄 살리바|William|Saliba|)
 * — 발음 추측이 아니라 **영문명 토큰 대조**로 붙인다. 전 토큰이 근접 창에서 일치할 때만
 * 채우고, 모호하면 null(검수 대기)로 남긴다. 사전 오염 방지: 등재는 전부 status=proposed.
 *
 * ## 실행
 *   pnpm exec tsx scripts/harvest-squads.ts --team arsenal          # dry-run, 표 출력
 *   pnpm exec tsx scripts/harvest-squads.ts --team arsenal --apply  # team_squads upsert
 *   pnpm exec tsx scripts/harvest-squads.ts --all --apply           # team_dictionary 전 팀
 *
 * confirmed 로 확정된 name_kr 는 재수확이 덮어쓰지 않는다.
 */
import "dotenv/config"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { fetchTeamSquad, type SquadMember } from "@/lib/soccerway/squad"

const NAMU_HEADERS = {
  "Accept-Language": "ko-KR,ko;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

/** 이름 뒤에 붙는 비이름 한글 어휘 — 매칭 하한선 밖으로 */
const NON_NAME = new Set([
  "주장",
  "부주장",
  "임대",
  "감독",
  "코치",
  "선수",
  "이적",
  "영입",
  "방출",
  "출장",
  "골키퍼",
  "수비수",
  "미드필더",
  "공격수",
])

/**
 * 라틴 분음부호 접기 — **글자당 1:1 로 길이를 보존**한다.
 * ⚠️ 통짜 NFD 정규화는 한글까지 자모로 분해해 인덱스가 틀어진다 (실측: Saliba 창에서
 *    엉뚱한 위치의 한글을 집어옴). 원문 인덱스로 되짚어야 하므로 길이 불변이 필수.
 */
const FOLD_MAP: Record<string, string> = {
  // NFD 로 분해되지 않는 라틴 글자들 (실측: Ødegaard 가 안 잡히던 원인)
  Ø: "O",
  ø: "o",
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Þ: "T",
  þ: "t",
  Æ: "A",
  æ: "a",
  Œ: "O",
  œ: "o",
  ẞ: "S",
  ß: "s",
}

function foldLatin(s: string): string {
  let out = ""
  for (const ch of s) {
    if (ch.charCodeAt(0) < 128) {
      out += ch
      continue
    }
    if (FOLD_MAP[ch]) {
      out += FOLD_MAP[ch]
      continue
    }
    const d = ch.normalize("NFD")
    out += /[A-Za-z]/.test(d[0]) ? d[0] : ch
  }
  return out
}

/** HTML → 셀 경계 '|' 로 구분된 평문 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "|")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\|[\s|]*\|/g, "|")
}

/**
 * 정식 문서명 오버라이드 — 검색·Go 로 못 닿는 구단 (2026-08-16 실측 잔여분).
 * 나무위키 리그 문서는 JS 셸이라 링크 수집이 안 되고, 검색 랭킹은 도시 문서가 이긴다.
 * 제목이 틀려도 스코어링(스쿼드 대조 수)이 걸러주므로 추측 등재의 위험은 없다.
 * ⚠️ K/J리그·국대는 문서를 찾아도 스쿼드 표에 로마자 열이 없어 대조 자체가 불가 —
 *    여기 넣어도 소용없다. 그쪽은 발음 역변환(별도 과제)의 몫.
 */
const NAMU_DOC_OVERRIDES: Record<string, string[]> = {
  브라이턴: ["브라이튼 앤 호브 알비온 FC"], // 나무위키는 '브라이튼' 표기
  발렌시아: ["발렌시아 CF"],
  아약스: ["AFC 아약스"],
  "FK보되 글림트": ["FK 보되/글림트", "보되/글림트"],
  로센보르그BK: ["로센보르그 BK"],
  릴레스트룀SK: ["릴레스트룀 SK"],
  "슬로반 브라티슬라바": ["ŠK 슬로반 브라티슬라바"],
  "슈투름 그라츠": ["SK 슈투름 그라츠"],
  "포르튀나 시타르트": ["포르투나 시타르트"],
  "루아얄 위니옹 생질루아즈": ["로얄 위니옹 생질루아즈", "위니옹 생질루아즈"],
  "링컨 시티": ["링컨 시티 FC"],
}

/** 나무위키 팀 문서 탐색 — 후보 URL 을 순회하며 스쿼드 영문명이 가장 많이 겹치는 문서 채택 */
async function findNamuDoc(
  nameKr: string,
  nameEn: string,
  squad: SquadMember[]
): Promise<{ url: string; text: string } | null> {
  const candidates = [
    ...new Set([
      ...(NAMU_DOC_OVERRIDES[nameKr] ?? []),
      nameKr,
      `${nameKr} FC`,
      `FC ${nameKr}`,
      nameEn,
    ]),
  ]
  // Go?q= 는 나무위키의 "바로가기" — 표기 차이를 넘어 정답 문서로 302 해준다
  // (실측: AC밀란 → /w/AC 밀란). 직접 후보가 다 빗나가는 팀의 구원투수.
  const urls = [
    ...candidates.map((c) => `https://namu.wiki/w/${encodeURIComponent(c)}`),
    `https://namu.wiki/Go?q=${encodeURIComponent(nameKr)}`,
    `https://namu.wiki/Go?q=${encodeURIComponent(`${nameKr} FC`)}`,
  ]

  // 점수 = 실제 한글 대조에 성공하는 선수 수 — 표면 등장 횟수보다 훨씬 강한 신호
  let best: { url: string; text: string; score: number } | null = null
  const seen = new Set<string>()
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: NAMU_HEADERS })
      if (!res.ok) continue
      if (seen.has(res.url)) continue // Go 리다이렉트가 직접 후보와 같은 문서로 온 경우
      seen.add(res.url)
      const text = htmlToText(await res.text())
      const score = squad.filter((p) => matchKoreanName(p.nameEn, text) !== null).length
      if (!best || score > best.score) best = { url: res.url, text, score }
      if (score >= squad.length * 0.6) break // 충분히 확신 — 더 안 돈다
    } catch {
      /* 다음 후보 */
    }
  }
  const threshold = Math.max(3, squad.length * 0.2)

  // 최후 폴백: 나무위키 검색 — 구단 문서명이 "SSC 나폴리"처럼 수식어를 달고 있으면
  // 직접 후보도 Go 도 못 맞춘다 (Go?q=나폴리 는 도시 문서로 간다, 2026-08-16 실측).
  // 검색 상위 문서들을 후보로 넣고 같은 스코어링으로 거른다 — 오답 문서는 대조가 0 에
  // 수렴하므로 안전하다.
  if (!best || best.score < threshold) {
    try {
      const res = await fetch(
        `https://namu.wiki/Search?q=${encodeURIComponent(`${nameKr} 축구`)}`,
        { headers: NAMU_HEADERS }
      )
      if (res.ok) {
        const docs = [
          ...new Set(
            [...(await res.text()).matchAll(/href="\/w\/([^"#?]+)"/g)]
              .map((m) => decodeURIComponent(m[1]))
              .filter((x) => !/사용자:|틀:|분류:|파일:|토론:|\//.test(x)) // 서브문서("…/클럽 경력") 제외
          ),
        ].slice(0, 6)
        for (const doc of docs) {
          const url = `https://namu.wiki/w/${encodeURIComponent(doc)}`
          if (seen.has(url)) continue
          try {
            const dr = await fetch(url, { headers: NAMU_HEADERS })
            if (!dr.ok) continue
            seen.add(dr.url)
            const text = htmlToText(await dr.text())
            const score = squad.filter((p) => matchKoreanName(p.nameEn, text) !== null).length
            if (!best || score > best.score) best = { url: dr.url, text, score }
            if (score >= squad.length * 0.6) break
          } catch {
            /* 다음 문서 */
          }
        }
      }
    } catch {
      /* 검색 실패 — 아래 임계 판정으로 */
    }
  }

  if (!best || best.score < threshold) return null
  return { url: best.url, text: best.text }
}

// 한 글자 음절 허용 — "벤 화이트"의 '벤'이 잘리면 이름이 반토막 난다. 전체 길이로 거른다.
const HANGUL_RUN = /[가-힣]+(?:[·\s-][가-힣]+)*/g

/** 영문명 전 토큰이 근접 창에서 일치하는 지점을 찾아, 직전 한글 이름 런을 회수 */
function matchKoreanName(nameEn: string, namuText: string): string | null {
  const plain = foldLatin(namuText) // 길이 보존 — 아래 인덱스가 원문과 일치
  const tokens = foldLatin(nameEn)
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return null
  const anchor = tokens.reduce((a, b) => (b.length > a.length ? b : a)) // 가장 긴 토큰 기준

  const found = new Set<string>()
  const anchorRe = new RegExp(`(?<![A-Za-z])${anchor}(?![A-Za-z])`, "gi")
  for (let m = anchorRe.exec(plain); m; m = anchorRe.exec(plain)) {
    const i = m.index
    const win = plain.slice(Math.max(0, i - 120), i + 120)
    const allHit = tokens.every((t) => new RegExp(`(?<![A-Za-z])${t}(?![A-Za-z])`, "i").test(win))
    if (!allHit) continue
    // 앵커 앞쪽에서 마지막 한글 런 = 같은 행의 한글명 셀
    const before = namuText.slice(Math.max(0, i - 120), i)
    const runs = [...before.matchAll(HANGUL_RUN)]
      .map((r) => r[0].trim())
      .filter((r) => !NON_NAME.has(r) && r.length >= 2 && r.length <= 20)
    if (runs.length === 0) continue
    found.add(runs[runs.length - 1])
    if (found.size > 1) return null // 서로 다른 한글명이 잡힘 — 모호, 검수로
  }
  return found.size === 1 ? [...found][0] : null
}

interface TeamRow {
  soccerway_team_id: string
  slug: string
  name_en: string
  name_kr: string
}

// database.types.ts 에 team_squads 미반영 상태 — 라인업 배선 시 타입 재생성 예정이라 any
async function harvestTeam(team: TeamRow, apply: boolean, sb: SupabaseClient<any>) {
  const squad = await fetchTeamSquad(team.slug, team.soccerway_team_id)
  if (!squad) {
    console.log(`✗ ${team.name_kr}: soccerway 스쿼드 파싱 실패`)
    return { total: 0, matched: 0 }
  }
  const namu = await findNamuDoc(team.name_kr, team.name_en, squad)
  if (!namu) {
    console.log(
      `✗ ${team.name_kr}: 나무위키 문서를 못 찾음 (스쿼드 ${squad.length}명은 영문만 등재 가능)`
    )
  }

  const rows = squad.map((p) => ({
    ...p,
    nameKr: namu ? matchKoreanName(p.nameEn, namu.text) : null,
  }))

  // 서로 다른 선수가 같은 한글명으로 붙으면 둘 다 무효 (동명 셀 오인)
  const byKo = new Map<string, number>()
  for (const r of rows) if (r.nameKr) byKo.set(r.nameKr, (byKo.get(r.nameKr) ?? 0) + 1)
  for (const r of rows) if (r.nameKr && byKo.get(r.nameKr)! > 1) r.nameKr = null

  const matched = rows.filter((r) => r.nameKr).length
  console.log(`\n■ ${team.name_kr} (${team.slug}) — ${rows.length}명, 한글 대조 ${matched}명`)
  if (namu) console.log(`  나무위키: ${decodeURIComponent(namu.url)}`)
  for (const r of rows) {
    const no = r.jerseyNumber != null ? String(r.jerseyNumber).padStart(2) : "--"
    console.log(
      `  ${no} ${r.position.padEnd(5)} ${r.nameEn.padEnd(26)} ${r.nameKr ?? "· (검수 필요)"}`
    )
  }

  if (apply) {
    // confirmed name_kr 보존 — 기존 확정 행 조회 후 제외
    const { data: existing } = await sb
      .from("team_squads")
      .select("player_id, name_kr, status")
      .eq("soccerway_team_id", team.soccerway_team_id)
    const confirmedKo = new Map(
      (existing ?? [])
        .filter((e) => e.status === "confirmed" && e.name_kr)
        .map((e) => [String(e.player_id), String(e.name_kr)])
    )
    const payload = rows.map((r) => ({
      soccerway_team_id: team.soccerway_team_id,
      player_id: r.playerId,
      player_slug: r.playerSlug,
      name_en: r.nameEn,
      name_kr: confirmedKo.get(r.playerId) ?? r.nameKr,
      jersey_number: r.jerseyNumber,
      position: r.position,
      status: confirmedKo.has(r.playerId) ? "confirmed" : "proposed",
      source: "namu",
      updated_at: new Date().toISOString(),
    }))
    const { error } = await sb
      .from("team_squads")
      .upsert(payload, { onConflict: "soccerway_team_id,player_id" })
    console.log(error ? `  ✗ upsert 실패: ${error.message}` : `  ✓ ${payload.length}행 upsert`)
  }
  return { total: rows.length, matched }
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--apply")
  const teamArg = args.includes("--team") ? args[args.indexOf("--team") + 1] : null
  const all = args.includes("--all")
  const missingOnly = args.includes("--missing")
  if (!teamArg && !all && !missingOnly) {
    console.log("사용법: --team <slug|id> [--apply] | --all [--apply] | --missing [--apply]")
    process.exit(1)
  }

  const sb = createClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  let q = sb.from("team_dictionary").select("soccerway_team_id, slug, name_en, name_kr")
  if (teamArg) q = q.or(`slug.eq.${teamArg},soccerway_team_id.eq.${teamArg}`)
  const { data: teamsRaw, error } = await q.order("name_en")
  let teams = teamsRaw
  if (!error && teams?.length && missingOnly) {
    // 한글 대조가 1건도 없는 팀만 — 문서 미발견 팀 재수확용
    const ok = new Set<string>()
    for (let from = 0; ; from += 1000) {
      // PostgREST 기본 1,000행 상한 — 페이지로 전량 수집
      const { data: page } = await sb
        .from("team_squads")
        .select("soccerway_team_id")
        .not("name_kr", "is", null)
        .range(from, from + 999)
      for (const r of page ?? []) ok.add(String(r.soccerway_team_id))
      if (!page || page.length < 1000) break
    }
    teams = teams.filter((t) => !ok.has(String(t.soccerway_team_id)))
    console.log(`--missing: 한글 0건 팀 ${teams.length}개 대상`)
  }
  if (error || !teams?.length) {
    console.log("팀 조회 실패:", error?.message ?? "0건")
    process.exit(1)
  }

  let total = 0
  let matched = 0
  for (const t of teams as unknown as TeamRow[]) {
    const r = await harvestTeam(t, apply, sb)
    total += r.total
    matched += r.matched
    if (teams.length > 1) await new Promise((res) => setTimeout(res, 1500)) // 예의상 간격
  }
  console.log(`\n합계: ${total}명 중 한글 대조 ${matched}명 (${apply ? "적용됨" : "dry-run"})`)
}

main()
