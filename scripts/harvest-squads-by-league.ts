/**
 * 리그 경유 스쿼드 한글명 수확 (2026-08-18 운영자 지시).
 *
 * "나무위키 라리가 문서 → 시즌 참가 구단 20팀 → 각 구단 문서의 선수단 목록"
 *
 * ## 기존 수확기와 뭐가 다른가
 * `harvest-squads.ts` 는 팀 한글명으로 나무위키 URL 을 **추측**했다 (`/w/{한글명}` → 검색
 * 폴백). 표기가 조금만 달라도 빗나간다 — 라리가는 그래서 대부분 실패했다
 * ("레반테" 로 찾는데 실제 문서는 "레반테 UD").
 *
 * 여기서는 **리그 문서의 참가 구단 표에 박힌 링크**를 따라간다. 추측이 없다.
 * 구단 ↔ 우리 사전 팀 연결은 문서명·별칭을 정규화 대조하고, **1건일 때만** 채택한다
 * (fail-closed — 엉뚱한 팀 스쿼드를 넣는 것이 최악).
 *
 * 이름 대조는 기존과 같은 규율: 나무위키 표의 **영문명 토큰**이 근접 창에서 전부 일치할 때
 * 그 행의 한글 이름을 회수한다. 발음 추측 없음. 모호하면 null(검수 대기).
 * `confirmed` 로 확정된 한글명은 덮어쓰지 않는다.
 *
 * 실행:
 *   pnpm exec tsx scripts/harvest-squads-by-league.ts --league 라리가
 *   pnpm exec tsx scripts/harvest-squads-by-league.ts --league 라리가 --apply
 *   pnpm exec tsx scripts/harvest-squads-by-league.ts --all --apply
 */
import "dotenv/config"
import { writeFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import { isProseFragment } from "../lib/namu/team-match"
import {
  CLUB_LIST_SANITY_MAX,
  DEFAULT_HARVEST_LEAGUES,
  fetchLeagueClubs,
  fetchSquadDocText,
  LEAGUE_DOCS,
} from "../lib/namu/league-clubs"

const APPLY = process.argv.includes("--apply")
/** DB 를 건드리지 않고 제안만 CSV 로 받는다 (운영자 검수 우선 워크플로) */
const csvArg = process.argv.find((a) => a.startsWith("--csv"))
const CSV_OUT = csvArg
  ? csvArg.includes("=")
    ? csvArg.split("=")[1]
    : "workspace/squad-harvest.csv"
  : null
const ALL = process.argv.includes("--all")
const leagueArg = process.argv.find((a) => a.startsWith("--league"))
const LEAGUE = leagueArg?.includes("=")
  ? leagueArg.split("=")[1]
  : process.argv[process.argv.indexOf("--league") + 1]

/** 분해해도 기본 글자가 안 나오는 문자들 */
const LATIN_ODD: Record<string, string> = { ø: "o", Ø: "O", đ: "d", Đ: "D", ł: "l", Ł: "L" }

/**
 * 라틴 발음기호만 접는다 — **길이를 보존해야** 아래 인덱스가 원문과 맞는다.
 *
 * ⚠️ 문자열 전체에 `normalize("NFD")` 를 걸면 안 된다. 한글 음절이 자모 3개로 쪼개져
 *    길이가 통째로 늘어나고, 그 인덱스로 원문을 잘라 한글 이름을 회수하면 엉뚱한 자리가
 *    나온다 (2026-08-18 실사고 — 표를 제대로 받고도 대조가 0건이던 진짜 이유).
 *    그래서 라틴 확장 영역 글자만 한 글자씩 접는다.
 */
function foldLatin(s: string): string {
  return s.replace(/[À-ɏ]/g, (c) => {
    if (LATIN_ODD[c]) return LATIN_ODD[c]
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "")
    return base.length === 1 ? base : c
  })
}

/** 구단 접두·접미 약어와 조사 수준 토큰 — 식별에 기여하지 않는다 */
const TEAM_NOISE = new Set([
  "fc",
  "cf",
  "sd",
  "cd",
  "ud",
  "rc",
  "rcd",
  "ca",
  "sc",
  "ac",
  "클루브",
  "클럽",
  "데",
  "라",
  "더",
])

/**
 * 팀명 → 식별 토큰 집합.
 * 통짜 문자열 비교는 "RC 셀타 데 비고" ↔ "셀타 비고" 를 못 잇는다 — 토큰으로 쪼갠다.
 */
function teamTokens(s: string): string[] {
  return s
    .replace(/[·\-]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !TEAM_NOISE.has(t))
}

/** 토큰 한 쌍이 같은 말인가 — 포함까지 허용 ("코루냐" ⊂ "아코루냐") */
function tokenAkin(a: string, b: string): boolean {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.length >= 3 && l.includes(s)
}

/**
 * 한글만 남긴 식별 키. 사전은 약어를 붙여 쓰고("AS로마"·"RCD에스파뇰") 나무위키는 띄어
 * 쓰기 때문에("AS 로마") 토큰 대조로는 영영 안 붙는다 — 라틴 약어를 통째로 버리면 붙는다.
 *
 * ⚠️ 2글자 한글 토큰을 부분 포함으로 풀어주는 방식으로 해결하면 안 된다.
 *    "레알" 이 "비야레알" 의 부분문자열이라 레알 마드리드가 비야레알로 붙는다 (실측).
 *    부분 포함이 아니라 **키 전체 정확일치**여야 안전하다.
 */
function hangulKey(s: string): string {
  return s.replace(/[^가-힣]/g, "")
}

/**
 * 사전 팀이 이 구단 문서의 팀인가 — **한쪽 토큰 집합이 다른 쪽에 전부 담기면** 같은 팀.
 * "알라베스" ⊂ "데포르티보 알라베스" ✓ / "셀타 비고" ≡ "RC 셀타 데 비고" ✓
 * "레알 마드리드" vs "레알 소시에다드" 는 마드리드↔소시에다드가 안 맞아 ✗ (오답 차단).
 *
 * ⚠️ 별칭은 **정확일치만** 본다. "레알" 같은 2글자 별칭을 부분 매칭에 쓰면
 *    "레알 소시에다드"가 레알 마드리드로 붙는다 (2026-08-18 실측 오답).
 */
function teamMatchScore(docName: string, nameKr: string, aliases: string[]): number {
  if (aliases.some((a) => a.trim() && a.trim() === docName.trim())) return 100
  const hk = hangulKey(docName)
  if (hk.length >= 2 && (hk === hangulKey(nameKr) || aliases.some((a) => hk === hangulKey(a)))) {
    return 90
  }
  const d = teamTokens(docName)
  const t = teamTokens(nameKr)
  if (d.length === 0 || t.length === 0) return 0
  const covered = (from: string[], into: string[]) =>
    from.every((x) => into.some((y) => tokenAkin(x, y)))
  if (!covered(t, d) && !covered(d, t)) return 0
  // 겹치는 토큰이 많을수록 강한 후보 (동점이면 호출부가 fail-closed)
  return t.filter((x) => d.some((y) => tokenAkin(x, y))).length
}

/** 이름 뒤에 붙는 비이름 한글 어휘 */
const NON_NAME = new Set([
  "주장",
  "부주장",
  "감독",
  "코치",
  "임대",
  "이적",
  "부상",
  "군입대",
  "골키퍼",
  "수비수",
  "미드필더",
  "공격수",
  "포지션",
  "국적",
  "이름",
  "번호",
  "등번호",
  "선수",
  "비고",
])
const HANGUL_RUN = /[가-힣]+(?:[·\s-][가-힣]+)*/g

/** 성에 붙는 관사·전치사 — 단독으로는 사람을 식별하지 못한다 */
const PARTICLES = new Set([
  "van",
  "von",
  "der",
  "den",
  "de",
  "del",
  "della",
  "di",
  "da",
  "dos",
  "das",
  "do",
  "la",
  "le",
  "el",
  "al",
  "bin",
  "ibn",
  "mac",
  "abu",
])

/**
 * 대조 기준점(성) 고르기.
 * soccerway 표기는 **"성 이름" 순**이다 (실측: "Chevalier Lucas", "Zabarnyi Ilya").
 * 그래서 앞쪽 토큰을 우선한다 — 이름을 기준으로 잡으면 "Macia Carlos" 가
 * "카를로스 로메로(Carlos Romero)" 로 붙는 오답이 난다.
 */
function pickAnchor(nameEn: string): string | null {
  const toks = nameEn.split(/\s+/).filter(Boolean)
  for (const t of toks) {
    if (PARTICLES.has(t.toLowerCase())) continue
    if (t.replace(/[^A-Za-z]/g, "").length >= 4) return t
  }
  return null
}

/**
 * 글자·숫자만 남긴 문자열 + 원문 인덱스 역참조.
 * 공백뿐 아니라 구두점도 버린다 — 아포스트로피·하이픈이 이름을 갈라놓는다
 * ("N'Dicka" ↔ Ndicka, "Rak-Sakyi" ↔ RakSakyi).
 */
function compact(text: string): { s: string; idx: number[] } {
  const chars: string[] = []
  const idx: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (!/[A-Za-z0-9가-힣]/.test(text[i])) continue
    chars.push(text[i])
    idx.push(i)
  }
  return { s: chars.join(""), idx }
}

/**
 * 나무위키 표에서 성을 찾아 **바로 앞 한글 이름**을 회수한다.
 *
 * 두 표 양식이 섞여 있지만 순서는 같다 — 한글 성명이 로마자 성명 바로 앞이다.
 *   A: `7 FW 보르하 이글레시아스 Borja Iglesias 1993.01.17`
 *   B: `하파엘 레앙 Rafa el Leão | FW 1999.06.10`
 *
 * ⚠️ 로마자가 임의 위치에서 쪼개진다 (`Rafa el Leão`, `D ésiré`, `Santi C omesaña`).
 *    첫 글자 태그 때문만이 아니라서 정규식 단어 경계로는 못 잡는다 — **공백을 지운 뒤**
 *    찾고, 경계는 원문에 실제 공백이 있었는지로 판정한다.
 *
 * 모호하면(성이 여러 선수와 겹치면) null — 검수 큐로 보낸다.
 */
function matchKoreanName(nameEn: string, namuText: string): string | null {
  const anchorRaw = pickAnchor(nameEn)
  if (!anchorRaw) return null
  const anchor = foldLatin(anchorRaw)
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase()
  if (anchor.length < 4) return null

  const { s, idx } = compact(foldLatin(namuText))
  const hay = s.toLowerCase()
  const isLatin = (c: string | undefined) => !!c && /[A-Za-z]/.test(c)

  const found = new Set<string>()
  for (let i = hay.indexOf(anchor); i >= 0; i = hay.indexOf(anchor, i + 1)) {
    const start = idx[i]
    const end = idx[i + anchor.length - 1]
    // 경계 판정은 **원문** 기준 — 공백을 지운 문자열에선 이웃 단어가 붙어버린다
    if (isLatin(namuText[start - 1])) continue
    if (isLatin(namuText[end + 1])) continue
    const before = namuText.slice(Math.max(0, start - 80), start)
    const runs = [...before.matchAll(HANGUL_RUN)]
    const last = runs[runs.length - 1]
    if (!last) continue
    // ⚠️ 표에서 한글 이름은 로마자 **바로 앞**에 붙어 있다. 창 안에서 아무 한글이나
    //    주우면 본문 산문이 딸려온다 (실측: "20,000명 수용" → 한글명 "명 수용").
    if (before.length - (last.index + last[0].length) > 2) continue
    // "주장 브루누 마르팅스 인디" 처럼 역할 표기가 앞에 붙어 나온다 — 떼어낸다
    const parts = last[0]
      .trim()
      .split(/[\s·]+/)
      .filter(Boolean)
    while (parts.length && NON_NAME.has(parts[0])) parts.shift()
    const name = parts.join(" ")
    if (!name || name.length < 2 || name.length > 20) continue
    if (isProseFragment(name)) continue // 문서 산문 조각 차단
    if (parts.some((t) => NON_NAME.has(t))) continue
    found.add(name)
    if (found.size > 1) return null // 동성 선수 — 검수로
  }
  return found.size === 1 ? [...found][0] : null
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // --all 은 **기본 대상**(5대 리그+챔피언십)만 돈다. K리그·J리그 등은 승부예측 전용이라
  // 여기서 돌지 않는다 — 필요하면 `--league K리그1` 로 콕 집어 부른다.
  const leagues = ALL ? DEFAULT_HARVEST_LEAGUES : LEAGUE ? [LEAGUE] : []
  if (leagues.length === 0) {
    console.log("사용법: --league 라리가 [--apply] | --all [--apply]")
    console.log("기본(--all):", DEFAULT_HARVEST_LEAGUES.join(", "))
    console.log("개별 지정 가능:", Object.keys(LEAGUE_DOCS).join(", "))
    return
  }

  // ⚠️ Supabase 는 한 번에 1,000행만 준다. 페이지네이션 없이 받으면 사전 뒤쪽 팀들이
  //    통째로 "미등재" 로 보인다 — 아틀레티코 마드리드·레알 소시에다드·오사수나가
  //    그렇게 사라졌다 (2026-08-18 실사고).
  const dict: { soccerway_team_id: string; name_kr: string; aliases_kr: string[] | null }[] = []
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("team_dictionary")
      .select("soccerway_team_id, name_kr, aliases_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
      .range(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    dict.push(...(data as typeof dict))
    if (data.length < 1000) break
  }
  console.log(`사전 ${dict.length}팀 로드`)

  const proposals: Record<string, string | number>[] = []
  let totalFilled = 0
  for (const lg of leagues) {
    const doc = LEAGUE_DOCS[lg] ?? lg
    console.log(`\n${"=".repeat(56)}\n${lg}  (나무위키: ${doc})\n${"=".repeat(56)}`)
    const clubs = await fetchLeagueClubs(doc)
    console.log(`참가 구단 문서 ${clubs.length}개`)
    if (clubs.length === 0) continue
    // 구간 파싱이 빗나가면 문서 전체가 딸려온다 — 그 목록으로 팀을 짝지으면 엉뚱한
    // 구단 명단을 쓰게 되므로 통째로 버린다 (파리 FC 사고와 같은 부류)
    if (clubs.length > CLUB_LIST_SANITY_MAX) {
      console.log(`  ⚠ 목록이 비정상적으로 큼 — 리그 구간 파싱 실패로 보고 건너뜀`)
      continue
    }

    // ── 1단계: 문서 → 사전 팀 후보. 여러 문서가 한 팀을 주장할 수 있으므로
    //    **팀당 가장 강한 문서 하나만** 남긴다.
    //    ⚠️ 먼저 온 문서가 팀을 선점하게 두면 안 된다 — "파리 FC"(2026 승격팀)가
    //       약한 점수로 파리 생제르맹을 물고 가서, 진짜 PSG 문서가 통째로 버려졌다
    //       (2026-08-18 실사고: PSG 0/7 의 정체는 파리 FC 명단이었다).
    const claims = new Map<
      string,
      { club: (typeof clubs)[number]; team: (typeof dict)[number]; score: number }
    >()
    for (const club of clubs) {
      const scored = dict
        .map((d) => ({
          d,
          score: teamMatchScore(club.doc, String(d.name_kr), (d.aliases_kr ?? []).map(String)),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
      const top = scored[0]
      const tied = scored.filter((x) => x.score === top?.score).length
      if (!top || tied > 1) {
        console.log(
          `  · ${club.doc.padEnd(24)} 사전 대조 ${!top ? "0건 (미등재)" : `동점 ${tied}건`} — 건너뜀`
        )
        continue
      }
      const prev = claims.get(top.d.soccerway_team_id)
      if (prev && prev.score >= top.score) {
        console.log(`  · ${club.doc.padEnd(24)} "${prev.club.doc}" 가 더 강한 대조 — 건너뜀`)
        continue
      }
      if (prev) console.log(`  · ${prev.club.doc.padEnd(24)} "${club.doc}" 로 교체`)
      claims.set(top.d.soccerway_team_id, { club, team: top.d, score: top.score })
    }

    // ── 2단계: 확정된 문서에서만 명단을 긁는다
    for (const { club, team } of claims.values()) {
      // 그 팀에서 한글명이 비어 있는 선수만
      const { data: players } = await supabase
        .from("team_squads")
        .select("player_id, name_en, jersey_number")
        .eq("soccerway_team_id", team.soccerway_team_id)
        .is("name_kr", null)
        .neq("status", "rejected")
      if (!players || players.length === 0) {
        console.log(`  ✓ ${String(team.name_kr).padEnd(20)} 채울 선수 없음`)
        continue
      }

      // 명단은 구단 본문이 아니라 `틀:{구단}` 스쿼드 표 문서에 있다
      const text = await fetchSquadDocText(club.doc)
      await new Promise((r) => setTimeout(r, 600)) // 나무위키 예우
      if (!text) {
        console.log(`  ✗ ${String(team.name_kr).padEnd(20)} 문서 본문 없음`)
        continue
      }

      // 한 팀만 들여다볼 때: DEBUG_TEAM=아스널 pnpm exec tsx scripts/harvest-squads-by-league.ts --league EPL
      const debug =
        !!process.env.DEBUG_TEAM && String(team.name_kr).includes(process.env.DEBUG_TEAM)
      if (debug) {
        const at = text.indexOf("스쿼드")
        console.log(`  [debug] 문서="${club.doc}" 표 ${text.length}자`)
        console.log(`  [debug] ${text.slice(at, at + 260)}`)
      }
      let filled = 0
      for (const p of players) {
        const kr = matchKoreanName(String(p.name_en ?? ""), text)
        if (debug) console.log(`     ${String(p.name_en).padEnd(28)} → ${kr ?? "—"}`)
        if (!kr) continue
        proposals.push({
          팀: String(team.name_kr),
          등번호: p.jersey_number ?? "",
          영문명: String(p.name_en ?? ""),
          한글명: kr,
          출처문서: club.doc,
          soccerway_team_id: team.soccerway_team_id,
          player_id: p.player_id,
        })
        if (APPLY) {
          const { error } = await supabase
            .from("team_squads")
            .update({ name_kr: kr, source: "namu_league", updated_at: new Date().toISOString() })
            .eq("soccerway_team_id", team.soccerway_team_id)
            .eq("player_id", p.player_id)
            .is("name_kr", null) // 그 사이 확정된 값은 덮지 않는다
          if (error) continue
        }
        filled++
      }
      totalFilled += filled
      console.log(
        `  ✓ ${String(team.name_kr).padEnd(20)} ${String(filled).padStart(3)}/${players.length} 대조`
      )
    }
  }

  if (CSV_OUT) {
    const LF = String.fromCharCode(10)
    const cell = (v: unknown) => {
      const t = String(v ?? "")
      const risky = t.includes(",") || t.includes(String.fromCharCode(34)) || t.includes(LF)
      return risky ? JSON.stringify(t) : t
    }
    const head = ["팀", "등번호", "영문명", "한글명", "출처문서", "soccerway_team_id", "player_id"]
    const body = proposals.map((r) => head.map((h) => cell(r[h])).join(","))
    const csv = [head.join(","), ...body].join("\r\n")
    writeFileSync(CSV_OUT, "\ufeff" + csv, "utf8")
    console.log(`\n${CSV_OUT} — 제안 ${proposals.length}행 (DB 미반영)`)
  }
  console.log(`\n합계 ${totalFilled}명 대조${APPLY ? " (적용됨)" : " — 드라이런, --apply 로 반영"}`)
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})
