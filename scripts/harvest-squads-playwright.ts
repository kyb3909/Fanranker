/**
 * 나무위키 선수단 수확 — Playwright 판 (2026-08-18 운영자 지시).
 *
 * ## 왜 브라우저인가
 * 서버 HTML 을 정규식으로 긁으면 표의 **셀 경계가 사라진다**. 나무위키는 이름 첫 글자를
 * 태그로 감싸서 "Borja" 가 "B orja" 로 쪼개지고, 어느 한글이 어느 로마자의 짝인지는
 * "가까이 있으니 짝일 것" 이라는 추정으로 메워야 했다. 그 추정이 본문 산문을 물어와
 * "20,000명 수용" 에서 한글명 "명 수용" 이 나왔다 (2026-08-18 실사고).
 *
 * DOM 은 셀이 노드로 나뉘어 있어 추정이 필요 없다. `textContent` 는 태그를 무시하고
 * 이어 붙이므로 "Borja" 가 온전히 나온다. 운영자 지적("Playwright 가 더 정확")이 맞다.
 *
 * ## 어디서 명단을 찾나
 * 구단마다 다르다 — 본문에 실린 곳(데포르티보 아 코루냐)도, `틀:{구단}` 에만 있는 곳
 * (비야레알 CF)도 있다. 그래서 구단 문서를 열어 표를 걷고, 부족하면 **"스쿼드/선수단"
 * 링크를 따라가** 다시 걷는다.
 *
 * ⚠️ DB 를 건드리지 않는다. 결과는 CSV 로만 낸다 (운영자 검수 우선).
 *
 * 실행:
 *   pnpm exec tsx scripts/harvest-squads-playwright.ts
 *   pnpm exec tsx scripts/harvest-squads-playwright.ts --out=workspace/squad-all.csv --headed
 */
import "dotenv/config"
import { writeFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import { chromium, type Browser } from "playwright"
import {
  CLUB_LIST_SANITY_MAX,
  fetchLeagueClubs,
  fetchSquadDocText,
  LEAGUE_DOCS,
} from "../lib/namu/league-clubs"
import { isProseFragment, latinKey, pickAnchor, teamMatchScore } from "../lib/namu/team-match"

const outArg = process.argv.find((a) => a.startsWith("--out="))
const OUT = outArg ? outArg.slice(6) : "workspace/squad-all-20260818.csv"
const HEADED = process.argv.includes("--headed")
const CONCURRENCY = 3

/**
 * 대상 리그 (2026-08-18 운영자: "유럽 5대리그 + 챔피언십 정도면 돼 일단은").
 * 세군다·K/J리그 등은 `LEAGUE_DOCS` 에 남아 있지만 여기서는 부르지 않는다.
 */
const TARGET_LEAGUES = ["EPL", "라리가", "세리에A", "분데스리", "프리그1", "챔피언십"]

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

interface DictTeam {
  soccerway_team_id: string
  name_kr: string
  aliases_kr: string[] | null
}

interface SquadRow {
  soccerway_team_id: string
  player_id: string
  name_en: string | null
  name_kr: string | null
  jersey_number: number | null
  position: string | null
  source: string | null
  status: string | null
}

/** 나무위키 표에서 걷어온 (한글, 로마자) 짝 */
interface Pair {
  kr: string
  roman: string
}

/** Supabase 는 한 번에 1,000행만 준다 — 페이지네이션 없이 읽으면 표가 조용히 잘린다 */
async function fetchAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = []
  for (let page = 0; ; page++) {
    const { data } = await run(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** 한 문서에서 (한글, 로마자) 짝을 전부 걷는다 */
async function scrapePairs(
  browser: Browser,
  doc: string
): Promise<{ pairs: Pair[]; links: string[] }> {
  const ctx = await browser.newContext({ locale: "ko-KR", userAgent: UA })
  const page = await ctx.newPage()
  // 이미지·폰트는 명단과 무관하다 — 200여 문서를 도니 끄는 편이 빠르다
  await page.route("**/*", (route) =>
    ["image", "font", "media"].includes(route.request().resourceType())
      ? route.abort()
      : route.continue()
  )
  try {
    await page.goto("https://namu.wiki/w/" + encodeURIComponent(doc), {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    // 접힌 표를 편다 — CSS 토글이라 내용은 이미 있지만, 열어두면 추출이 안정적이다
    const toggles = await page.getByText("펼치기", { exact: false }).all()
    for (const t of toggles.slice(0, 40)) {
      try {
        await t.click({ timeout: 1200 })
      } catch {
        /* 안 열려도 DOM 에 내용이 있으므로 무시 */
      }
    }
    await page.waitForTimeout(400)

    return await page.evaluate(() => {
      const KR_NAME = /^[가-힣][가-힣 ·]{1,18}$/
      const LATIN_NAME = /^[A-Za-zÀ-ÿ'’.\-\s]{3,40}$/
      // 한 칸에 이름·포지션·생년월일이 다 들어간 양식이 있다 (VfB 슈투트가르트:
      // `파비안 브레틀로 Fabian Bredlow ｜GK 1995.03.02 2019~2027`). 칸 전체를 요구하면
      // 이런 구단이 통째로 0쌍이 된다 — 로마자 뒤 구분자(｜)나 숫자에서 끊는다.
      const INLINE =
        /^([가-힣][가-힣 ·]{1,18})\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\-\s]{2,39}?)\s*(?:[｜|]|\d|$)/
      // ⚠️ 한글 칸이라고 다 이름이 아니다 — 국적 칸이 "스페인 국기", 포지션 칸이 "골키퍼" 다.
      //    이걸 안 거르면 전 선수의 한글명이 국적으로 채워진다 (2026-08-18 실측).
      const NOT_NAME =
        /국기$|코치|감독|단장|디렉터|주장|명단|스쿼드|^(골키퍼|수비수|미드필더|공격수|등번호|국적|포지션|비고|이름|번호|선수|한글 성명|로마자 성명)$/
      const pairs: { kr: string; roman: string }[] = []

      // ⚠️ 페이지의 모든 `tr` 을 긁으면 안 된다. 역대 선수·레전드·유스 표가 같이 딸려와
      //    커티스 존스가 "토니 존스" 로, 해리 케인이 남의 이름으로 붙었다 (2026-08-18 실측).
      //    **스쿼드 표만** 본다: 표 안에 "스쿼드/선수 명단" 이 적혀 있거나 짝이 15쌍 이상.
      //    중첩 표는 가장 안쪽만 본다 — 바깥 표는 페이지 전체를 감싸고 있어 판별이 무의미하다.
      const innermost = [...document.querySelectorAll("table")].filter(
        (t) => t.querySelector("table") === null
      )
      // ⚠️ page.evaluate 안에서는 화살표 함수를 **변수에 담지 말 것**. tsx(esbuild) 가
      //    keepNames 로 `__name(...)` 을 붙이는데 그 헬퍼가 브라우저에 없어서
      //    "ReferenceError: __name is not defined" 로 전 구단이 0쌍이 된다 (2026-08-18 실측).
      for (const table of innermost) {
        const tablePairs: { kr: string; roman: string }[] = []
        for (const tr of [...table.querySelectorAll("tr")]) {
          const cells = [...tr.querySelectorAll("td,th")].map((c) => (c.textContent ?? "").trim())
          if (cells.length === 0) continue
          // 양식 A: `… | 한글 성명 | 로마자 성명 | …` — 표 순서가 정보다.
          //         로마자 칸을 먼저 찾고 **그 바로 앞쪽**에서 한글 이름을 되짚는다.
          const j = cells.findIndex((c) => LATIN_NAME.test(c) && /[A-Za-z]{3}/.test(c))
          let kr = ""
          for (let i = j - 1; i >= 0 && !kr; i--) {
            if (KR_NAME.test(cells[i]) && !NOT_NAME.test(cells[i])) kr = cells[i]
          }
          if (kr && j >= 0) {
            tablePairs.push({ kr, roman: cells[j] })
            continue
          }
          // 양식 B: 한 칸에 "한글 로마자" 가 같이 들어 있다 (VfB 슈투트가르트 류)
          for (const c of cells) {
            const m = c.match(INLINE)
            if (m && !NOT_NAME.test(m[1].trim())) {
              tablePairs.push({ kr: m[1].trim(), roman: m[2].trim() })
            }
          }
        }
        if (tablePairs.length === 0) continue
        const label = table.textContent ?? ""
        // 스쿼드 표인지 가리는 신호 두 가지. 표 안의 "스쿼드" 글자에 기대면 안 된다 —
        // 아스날 본문 명단에는 그 글자가 없다 (2026-08-18 실측).
        //   ① 포지션 코드가 여러 번 나온다 (GK/DF/MF/FW) — 역대 선수 목록엔 없다
        //   ② 한 팀 명단은 60명을 넘지 않는다 — 리버풀 204쌍의 정체가 역대 선수 표였고,
        //      거기서 커티스 존스가 "토니 존스" 로 붙었다
        const posHits = (label.match(/\b(GK|DF|MF|FW)\b/g) ?? []).length
        const isSquad = tablePairs.length <= 60 && (posHits >= 5 || /시즌 스쿼드/.test(label))
        if (isSquad) pairs.push(...tablePairs)
      }

      // 명단이 다른 문서에 있는 구단 — 명단으로 가는 링크를 넘겨준다.
      // 바르셀로나처럼 **시즌 문서**(`FC 바르셀로나/2026-27 시즌#s-3`)로 보내는 구단이 있어
      // 틀 문서만 노리면 놓친다. 대신 U-21·U-18·B팀·여자부는 1군이 아니므로 제외한다.
      const links = [...document.querySelectorAll("a")]
        .filter((a) => {
          const txt = (a.textContent ?? "").trim()
          if (txt.length > 20 || !/스쿼드|선수단|선수 명단/.test(txt)) return false
          return !/U-?\d|언더|유스|여자|아카데미|\bB\b|2군|리저브/.test(txt)
        })
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => h.startsWith("/w/"))
      return { pairs, links: [...new Set(links)] }
    })
  } catch (e) {
    // 조용히 삼키면 "전 구단 0쌍" 이 정상처럼 보인다 — 원인을 남긴다
    console.log(`  ! ${doc}: ${(e as Error).message.split("\n")[0].slice(0, 120)}`)
    return { pairs: [], links: [] }
  } finally {
    await ctx.close()
  }
}

/**
 * 텍스트에서 (한글, 로마자) 짝 걷기 — DOM 이 안 통할 때의 폴백.
 *
 * 구단 명단 틀 중에는 선수 한 명이 중첩 표로 들어가 있어 DOM 셀 규칙이 안 먹는 것들이
 * 있다 (PSG·바르셀로나·인테르 등이 0~3쌍으로 나온다). 그런 문서는 텍스트로 읽는다 —
 * 표든 아니든 명단은 **한글 이름 바로 뒤에 로마자 이름**이 오는 형태이기 때문이다.
 * 짝은 성 토큰 정확일치로만 쓰이고 모호하면 버리므로, 재료가 조금 지저분해도 안전하다.
 */
function pairsFromText(text: string): Pair[] {
  const re =
    /([가-힣][가-힣 ·]{1,18}?)\s+([A-ZÀ-Þ][A-Za-zÀ-ÿ'’.-]{1,}(?:\s+[A-ZÀ-Þ][A-Za-zÀ-ÿ'’.-]{1,}){0,3})/g
  const out: Pair[] = []
  // 이름 앞에 상태 표기가 붙어 나온다 ("복귀 라파 마린", "임대 …") — 떼어낸다
  const ROLE = /^(복귀|임대|이적|방출|영입|주장|부주장|감독|코치)\s+/
  for (const m of text.matchAll(re)) {
    let kr = m[1].trim()
    while (ROLE.test(kr)) kr = kr.replace(ROLE, "")
    if (kr.length < 2 || isProseFragment(kr)) continue
    if (/코치|감독|단장|디렉터|명단|스쿼드|국기/.test(kr)) continue
    out.push({ kr, roman: m[2].trim() })
  }
  return out
}

/**
 * 선수 영문명 → 이 구단 표의 한글명. 성이 겹치면 null (fail-closed).
 *
 * `확신` 을 같이 돌려준다 — 성만 맞은 건인지, 이름까지 맞은 건인지. 성만 맞으면
 * **동성 다른 선수**일 수 있다 (실측: 렉섬 Kieffer Moore 가 "알렉스 무어" 로 붙었다).
 * 표에 우리 선수가 아예 없고 같은 성의 다른 선수만 있으면 fail-closed 가 안 걸린다.
 */
function matchName(nameEn: string, pairs: Pair[]): { kr: string; sure: boolean } | null {
  const anchorRaw = pickAnchor(nameEn)
  if (!anchorRaw) return null
  const anchor = latinKey(anchorRaw)
  if (anchor.length < 4) return null
  const mine = new Set(
    nameEn
      .split(/\s+/)
      .map(latinKey)
      .filter((t) => t.length >= 3)
  )

  let sure = false
  const hits = new Set<string>()
  for (const p of pairs) {
    // ⚠️ **토큰 정확일치만** 본다. 통짜 문자열 포함을 폴백으로 두면 성이 남의 이름 속에
    //    묻혀 걸린다 — "Kane" 이 "Atakan Etüz"(atakanetuz) 안에서 잡혀 해리 케인이
    //    "아타칸 에튀즈" 가 됐다 (2026-08-18 실측). DOM 은 토큰이 깨끗해 폴백이 필요 없다.
    const tokens = p.roman.split(/\s+/).map(latinKey).filter(Boolean)
    if (!tokens.includes(anchor)) continue
    // 성 말고 다른 토큰까지 겹치면 동명이인 걱정이 없다
    if (tokens.filter((t) => mine.has(t)).length >= 2) sure = true
    hits.add(p.kr)
    if (hits.size > 1) return null // 동성 선수 — 검수로
  }
  return hits.size === 1 ? { kr: [...hits][0], sure } : null
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? JSON.stringify(s) : s
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const dict = await fetchAll<DictTeam>((f, t) =>
    supabase
      .from("team_dictionary")
      .select("soccerway_team_id, name_kr, aliases_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
      .range(f, t)
  )
  const squads = await fetchAll<SquadRow>((f, t) =>
    supabase
      .from("team_squads")
      .select(
        "soccerway_team_id, player_id, name_en, name_kr, jersey_number, position, source, status"
      )
      .neq("status", "rejected")
      .range(f, t)
  )
  console.log(`사전 ${dict.length}팀 / 스쿼드 ${squads.length}행`)

  // ── 팀 → 나무위키 문서. 리그 문서의 참가 구단 링크를 따라가므로 URL 추측이 없다.
  //    한 팀을 여러 문서가 주장하면 **가장 강한 것 하나만** (파리 FC 가 PSG 를 물어간 실사고).
  const docOf = new Map<string, { doc: string; score: number }>()
  for (const lg of TARGET_LEAGUES) {
    const leagueDoc = LEAGUE_DOCS[lg]
    if (!leagueDoc) continue
    const clubs = await fetchLeagueClubs(leagueDoc)
    if (clubs.length === 0 || clubs.length > CLUB_LIST_SANITY_MAX) {
      console.log(`  · ${lg} 구단 목록 ${clubs.length}개 — 건너뜀`)
      continue
    }
    for (const club of clubs) {
      const scored = dict
        .map((d) => ({
          d,
          score: teamMatchScore(club.doc, d.name_kr, (d.aliases_kr ?? []).map(String)),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
      const top = scored[0]
      if (!top || scored.filter((x) => x.score === top.score).length > 1) continue
      const prev = docOf.get(top.d.soccerway_team_id)
      if (!prev || top.score > prev.score) {
        docOf.set(top.d.soccerway_team_id, { doc: club.doc, score: top.score })
      }
    }
    console.log(`  ✓ ${lg} — 누적 ${docOf.size}팀 문서 확보`)
  }
  console.log(`대상 ${TARGET_LEAGUES.join("·")} — ${docOf.size}팀`)

  // ── 문서에서 짝 걷기
  const browser = await chromium.launch({ headless: !HEADED })
  const queue = [...docOf.keys()]
  const totalTeams = queue.length
  const pairsOf = new Map<string, Pair[]>()
  const docUsed = new Map<string, string>()
  let done = 0

  async function worker() {
    for (;;) {
      const id = queue.shift()
      if (!id) return
      const { doc } = docOf.get(id)!
      let { pairs, links } = await scrapePairs(browser, doc)
      let used = doc
      // 본문에 명단이 없으면 다른 문서를 찾는다. 후보 순서:
      //   ① 본문의 "스쿼드/선수단" 링크
      //   ② `틀:{구단 문서명}` — 나무위키 명단 틀의 관용 이름. 링크 수집이 빗나가도
      //      이 규칙 하나로 대부분 잡힌다 (링크가 0개로 돌아오는 구단이 실제로 많다).
      if (pairs.length < 15) {
        const candidates = [
          ...links.slice(0, 3).map((h) => decodeURIComponent(h.slice(3)).replace(/#.*$/, "")),
          `틀:${doc}`,
        ]
        for (const sub of candidates) {
          const r = await scrapePairs(browser, sub)
          if (r.pairs.length > pairs.length) {
            pairs = r.pairs
            used = sub
          }
          if (pairs.length >= 15) break
        }
      }
      // DOM 이 안 통한 구단은 텍스트로 한 번 더 — 중첩 표 구단이 여기서 살아난다
      let via = "DOM"
      if (pairs.length < 15) {
        const text = await fetchSquadDocText(doc)
        const textPairs = text ? pairsFromText(text) : []
        if (textPairs.length > pairs.length) {
          pairs = textPairs
          via = "텍스트"
        }
      }
      pairsOf.set(id, pairs)
      docUsed.set(id, used)
      done++
      console.log(
        `  ${pairs.length >= 15 ? "✓" : "·"} ${used.padEnd(26)} ${pairs.length}쌍 (${via})`
      )
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await browser.close()

  // ── CSV: 전 스쿼드 행
  const teamName = new Map(dict.map((d) => [d.soccerway_team_id, d.name_kr]))
  const rows = squads
    .filter((r) => docOf.has(r.soccerway_team_id)) // 대상 리그 구단만
    .map((r) => {
      const hit = matchName(String(r.name_en ?? ""), pairsOf.get(r.soccerway_team_id) ?? [])
      const found = hit?.kr ?? ""
      return {
        팀: teamName.get(r.soccerway_team_id) ?? r.soccerway_team_id,
        등번호: r.jersey_number ?? "",
        포지션: r.position ?? "",
        영문명: r.name_en ?? "",
        현재_한글명: r.name_kr ?? "",
        나무위키_한글명: found,
        확신: hit ? (hit.sure ? "성+이름" : "성만") : "",
        일치: r.name_kr && found ? (r.name_kr === found ? "같음" : "다름") : "",
        출처문서: docUsed.get(r.soccerway_team_id) ?? "",
        상태: r.status ?? "",
        출처: r.source ?? "",
        soccerway_team_id: r.soccerway_team_id,
        player_id: r.player_id,
      }
    })
    .sort(
      (a, b) =>
        String(a.팀).localeCompare(String(b.팀), "ko") ||
        String(a.등번호).padStart(3, "0").localeCompare(String(b.등번호).padStart(3, "0"))
    )

  const head = Object.keys(rows[0] ?? {})
  const csv = [
    head.join(","),
    ...rows.map((r) => head.map((h) => csvCell(r[h as keyof typeof r])).join(",")),
  ].join("\r\n")
  writeFileSync(OUT, "﻿" + csv, "utf8")

  const newlyFilled = rows.filter((r) => !r.현재_한글명 && r.나무위키_한글명).length
  const conflict = rows.filter((r) => r.일치 === "다름").length
  const teamsWithTable = [...pairsOf.values()].filter((p) => p.length >= 15).length
  console.log(
    `\n${OUT}\n  전체 ${rows.length}행 / 명단 확보 ${teamsWithTable}/${totalTeams}팀` +
      `\n  빈칸을 새로 채운 후보 ${newlyFilled}행 / 기존값과 다름 ${conflict}행`
  )
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})
