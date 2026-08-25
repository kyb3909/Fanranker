/**
 * 나무위키 리그 문서 → 참가 구단 문서 목록 (2026-08-18).
 *
 * ## 왜 리그 문서를 경유하나
 * 기존 수확기는 팀 한글명으로 나무위키 URL 을 **추측**했다 (`/w/{한글명}`, `/Go?q=`,
 * 검색 폴백). 표기가 조금만 달라도 빗나가고 — 실제로 라리가 팀 대부분이 그렇게 실패해
 * 스쿼드가 통째로 비어 있었다 ("레반테" vs 실제 문서 "레반테 UD").
 *
 * 리그 문서의 "시즌 참가 구단" 표에는 그 시즌 구단의 **정확한 문서 링크**가 전부 있다.
 * 추측 대신 그 링크를 따라간다.
 *
 * ## 파싱 주의
 * 나무위키는 SPA 지만 서버 렌더 HTML 에 본문이 들어 있다. 단 **속성 따옴표가 작은따옴표**다
 * (`href='/w/...' title='...'`) — 큰따옴표로 정규식을 짜면 링크가 5개만 잡힌다(실측).
 */

const HEADERS = {
  "Accept-Language": "ko-KR,ko;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

/**
 * ⚠️⚠️ **나무위키가 평범한 fetch 를 막는다** (2026-08-25 실측).
 *
 * `fetch` 로 문서를 받으면 **403 + Cloudflare 챌린지**(`<title>Just a moment...</title>`,
 * 본문 5.7KB)가 온다. 정규식은 멀쩡한데 파싱할 HTML 자체가 안 온다 —
 * 그래서 두 수확기가 **조용히 "참가 구단 0개"** 로 끝나고 있었다(라리가·튀르키예 모두 0).
 * 실패가 아니라 빈 성공으로 보여서 아무도 못 알아챘다.
 *
 * 2026-08-18 당시엔 fetch 로 됐다(그때 `namu_league` 로 1,357명이 들어왔다).
 * 즉 우리 코드가 아니라 **저쪽 차단 정책이 바뀐 것**이다.
 *
 * 그래서 실제 브라우저로 받는다. Playwright 는 **스크립트 실행 시점에만** 동적 import 한다 —
 * 이 모듈이 앱 번들에 끌려들어가지 않게(현재 임포터는 scripts 두 개뿐이지만 규율로 지킨다).
 */
async function fetchNamuHtml(url: string): Promise<string | null> {
  // 1차: 평범한 fetch. 차단이 풀리면 이쪽이 훨씬 빠르므로 먼저 시도한다.
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
    if (res.ok) {
      const html = await res.text()
      if (!/Just a moment|cf-browser-verification|challenge-platform/i.test(html)) return html
    }
  } catch {
    /* 아래 브라우저 경로로 */
  }

  // 2차: 실제 브라우저 — Cloudflare 챌린지를 통과한다
  //
  // ⚠️ **headless 로는 못 뚫는다** (2026-08-25 실측). `chromium.launch()` 기본값(headless)은
  //    `net::ERR_TIMED_OUT` 으로 끝나고, 같은 URL 을 headed 브라우저로 열면 1.2MB 본문이
  //    정상 수신된다. Cloudflare 가 headless 를 식별해 붙잡는다.
  //    그래서 창을 띄운다 — 수확기는 사람이 돌리는 CLI 라 창이 떠도 무방하다.
  //    (CI·크론에서 돌릴 일이 생기면 그때는 다른 우회가 필요하다. 지금은 수동 전용.)
  try {
    const browser = await getBrowser()
    const page = await browser.newPage({ userAgent: HEADERS["User-Agent"], locale: "ko-KR" })
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
      // 챌린지가 끼면 몇 초 뒤 본문으로 넘어간다
      await page.waitForTimeout(3000)
      const html = await page.content()
      if (/Just a moment|challenge-platform/i.test(html)) {
        await page.waitForTimeout(5000)
        return await page.content()
      }
      return html
    } finally {
      await page.close()
    }
  } catch (e) {
    console.warn(`[namu] 문서 수신 실패: ${url} — ${e instanceof Error ? e.message : e}`)
    return null
  }
}

/**
 * ⚠️ 브라우저는 **한 번만 띄우고 재사용**한다. 문서마다 launch/close 하면 문서당 5초씩
 *    붙어 리그 하나(구단 20개 × 문서 2~3개)에 몇 분이 그냥 사라진다.
 *    프로세스가 끝날 때 `closeNamuBrowser()` 로 닫는다 — 안 닫으면 창이 남는다.
 */
let browserPromise: Promise<import("playwright").Browser> | null = null
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = import("playwright").then((pw) =>
      pw.chromium.launch({
        headless: false,
        args: ["--disable-blink-features=AutomationControlled"],
      })
    )
  }
  return browserPromise
}

/** 수확 스크립트 종료 시 호출 — 안 부르면 브라우저 창이 남는다 */
export async function closeNamuBrowser(): Promise<void> {
  if (!browserPromise) return
  const b = await browserPromise.catch(() => null)
  browserPromise = null
  await b?.close().catch(() => {})
}

export interface NamuClub {
  /** 나무위키 문서명 (예: "비야레알 CF") */
  doc: string
  /** 표에 표기된 이름 — 문서명과 같지만 별칭 대조용으로 남긴다 */
  title: string
  url: string
}

/** 구단 문서가 아닌 것 — 틀·리그·시즌 문서가 같은 표 영역에 섞여 나온다 */
function isClubDoc(doc: string): boolean {
  if (doc.startsWith("틀:") || doc.startsWith("분류:") || doc.startsWith("파일:")) return false
  if (/^\d{4}[-–]\d{2}/.test(doc)) return false // 시즌 문서
  if (/리그|리가|세리에|프리메이라|쉬페르|디비전|카티고리아스|챔피언십/.test(doc)) return false
  return true
}

/**
 * 리그 문서에서 참가 구단 문서를 뽑는다.
 * `sectionHint` 이후 구간만 훑어 이웃 리그 틀·역대 우승팀 링크가 섞이는 것을 줄인다.
 */
export async function fetchLeagueClubs(
  leagueDoc: string,
  { sectionHint = "시즌 참가", window = 40000 } = {}
): Promise<NamuClub[]> {
  const url = `https://namu.wiki/w/${encodeURIComponent(leagueDoc)}`
  const html = await fetchNamuHtml(url)
  if (!html) return []

  // ⚠️ 브라우저로 받으면 속성이 **큰따옴표**로 정규화된다. 서버 HTML(작은따옴표)과
  //    둘 다 받아야 한다 — 한쪽만 보면 경로에 따라 0개가 된다.
  const start = html.indexOf(sectionHint)
  const seg = start >= 0 ? html.slice(start, start + window) : html

  // 서버 HTML 은 작은따옴표, 브라우저 content() 는 큰따옴표로 정규화된다 — 둘 다 훑는다
  const patterns = [
    /href='\/w\/([^']+)'\s+title='([^']+)'/g,
    /href="\/w\/([^"]+)"\s+title="([^"]+)"/g,
  ]
  const out: NamuClub[] = []
  const seen = new Set<string>()
  for (const re of patterns) {
    for (const m of seg.matchAll(re)) {
      const doc = decodeURIComponent(m[1]).replace(/#.*$/, "")
      if (seen.has(doc) || !isClubDoc(doc)) continue
      seen.add(doc)
      out.push({ doc, title: m[2], url: `https://namu.wiki/w/${encodeURIComponent(doc)}` })
    }
  }
  return out
}

/** 나무위키 서버 HTML → 본문 텍스트 */
function stripNamuHtml(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      // 숫자 엔티티가 살아 있으면 이름 안에 끼어든다 — "N&#39;Dicka" 는 어떤 대조도 못 뚫는다
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      // ⚠️ 나무위키는 이름 **첫 글자를 별도 태그로 감싼다**. 태그를 공백으로 치환하면
      //    "Borja" 가 "B orja" 로 쪼개져 토큰 대조가 전부 빗나간다 — 라리가 전 구단이
      //    0명 대조로 끝난 진짜 원인이었다 (2026-08-18 실측: "Santi C omesaña V eiga").
      .replace(/(?<![A-Za-z])([A-Za-z]) (?=[a-z]{2})/g, "$1")
  )
}

/** 나무위키 문서 본문 텍스트 — 리그 문서와 같은 차단을 받으므로 같은 경로를 쓴다 */
export async function fetchNamuDocText(doc: string): Promise<string | null> {
  const html = await fetchNamuHtml(`https://namu.wiki/w/${encodeURIComponent(doc)}`)
  return html ? stripNamuHtml(html) : null
}

/**
 * 스쿼드 표인가 — **머리글이 아니라 내용으로** 판정한다.
 *
 * ⚠️ "로마자 성명" 같은 열 이름을 찾으면 안 된다. 그 머리글이 없는 양식이 따로 있어서
 *    (VfB 슈투트가르트: `파비안 브레틀로 Fabian Bredlow ｜GK 1995.03.02`) 멀쩡한 명단을
 *    통째로 버렸다 (2026-08-18 실사고 — 독일·네덜란드·J리그 구단이 "문서 본문 없음" 이던 이유).
 *    양식이 뭐든 명단이면 **한글 이름 바로 뒤에 로마자 이름**이 줄줄이 나온다. 그걸 센다.
 */
function hasSquadTable(text: string | null): text is string {
  if (!text) return false
  const pairs = text.match(/[가-힣]{2,}(?:\s[가-힣]{2,})*\s+[A-ZÀ-Þ][A-Za-zÀ-ÿ'’-]{2,}/g)
  return (pairs?.length ?? 0) >= 8
}

/**
 * 구단의 명단 표를 **있는 대로 다 모아** 하나의 텍스트로 돌려준다.
 *
 * ⚠️ 명단이 어디 있는지는 구단마다 다르다 — 한 곳만 보면 안 된다 (2026-08-18 운영자 지적).
 *   - 구단 문서 본문의 "스쿼드" 문단: 데포르티보 아 코루냐가 그렇다 (본문 25,177자에 표 있음)
 *   - `틀:{구단 문서명}`: 비야레알 CF 가 그렇다 (본문 13,528자에 로스터 0, 틀에만 있음)
 * 그래서 둘 다 읽어 합친다. 지난 시즌 표가 섞여도 **선수의 한글 표기는 시즌을 안 탄다**.
 * 같은 성이 여럿이면 호출부가 fail-closed 로 버리므로 재료는 많을수록 낫다.
 *
 * ⚠️ "펼치기·접기" 는 CSS 토글일 뿐이라 브라우저 자동화가 필요 없다 — 접힌 상태의
 *    서버 HTML 에 이미 전 선수가 들어 있다 (실측).
 *
 * ⚠️ 틀 링크를 **문서 첫 등장 순서로** 고르면 안 된다. 페이지 최상단 내비게이션에
 *    `틀:라리가 2` 같은 이웃 리그 틀이 먼저 나와서, 그걸 스쿼드로 착각하면 전 구단이
 *    0명 대조로 끝난다 (2026-08-18 실사고). 앵커 텍스트가 "스쿼드" 인 링크만 본다.
 */
export async function fetchSquadDocText(clubDoc: string): Promise<string | null> {
  const parts: string[] = []

  // ① 구단 문서 본문 — 표가 여기 실려 있는 구단이 있다
  // ⚠️ 여기도 같은 차단을 받는다. 리그 문서만 고치고 이 줄을 놔뒀다가
  //    `UND_ERR_CONNECT_TIMEOUT` 으로 스크립트가 통째로 죽었다 (2026-08-25).
  const html = (await fetchNamuHtml(`https://namu.wiki/w/${encodeURIComponent(clubDoc)}`)) ?? ""
  const body = html ? stripNamuHtml(html) : null
  if (hasSquadTable(body)) parts.push(body)

  // ② `틀:{구단 문서명}` — 규칙으로 바로 맞는 경우
  const direct = await fetchNamuDocText(`틀:${clubDoc}`)
  if (hasSquadTable(direct)) parts.push(direct)

  // ③ 규칙이 빗나가면 본문의 "스쿼드" 링크를 따라간다
  if (parts.length === 0 && html) {
    // 서버 HTML(작은따옴표)·브라우저 content()(큰따옴표) 둘 다 대응
    const m =
      html.match(/href='\/w\/(%ED%8B%80[^']+)'[^>]*>스쿼드<\/a>/) ??
      html.match(/href="\/w\/(%ED%8B%80[^"]+)"[^>]*>스쿼드<\/a>/)
    if (m) {
      const linked = await fetchNamuDocText(decodeURIComponent(m[1]))
      if (hasSquadTable(linked)) parts.push(linked)
    }
  }

  // 구분자를 끼워 두 표의 경계를 넘는 우연한 인접 대조를 막는다
  return parts.length ? parts.join(" ||| ") : null
}

/**
 * 수확 대상 리그 → 나무위키 문서명.
 *
 * "시즌 참가" 구간을 못 찾으면 문서 전체를 훑어 이웃 리그·역대 구단 링크까지 딸려온다
 * (실측: "2. 분데스리가" 117개). 그런 문서는 호출부에서 버린다 — 아래 목록은 구간
 * 파싱이 실제로 통한 것만 남긴 것이다.
 */
export const LEAGUE_DOCS: Record<string, string> = {
  EPL: "프리미어 리그",
  라리가: "라리가",
  세리에A: "세리에 A",
  분데스리: "분데스리가",
  프리그1: "리그 1",
  에레디비시: "에레디비시",
  포르투갈: "프리메이라 리가",
  튀르키예: "쉬페르 리그",
  스코틀랜드: "스코티시 프리미어십",
  오스트리아: "오스트리아 분데스리가",
  스위스: "스위스 슈퍼 리그",
  덴마크: "덴마크 수페르리가",
  K리그1: "K리그1",
  K리그2: "K리그2",
  J1리그: "J1리그",
  J2리그: "J2리그",
  MLS: "메이저 리그 사커",
  챔피언십: "EFL 챔피언십",
  세군다: "세군다 디비시온",
  세리에B: "세리에 B",
  리그2: "리그 2",
  러시아: "러시아 프리미어 리그",
  우크라이나: "우크라이나 프리미어 리그",
}

/**
 * 수확기 기본 대상 (2026-08-19 운영자: "우리는 5대 리그 위주로만 할거야 일단").
 *
 * K리그·J리그·MLS 등은 승부예측 메뉴에만 두기로 했다. `LEAGUE_DOCS` 에는 남겨 둔다 —
 * 나중에 필요하면 `--league K리그1` 로 개별 지정하면 되고, 목록을 지우면 그 매핑을
 * 다시 찾아야 한다.
 */
export const DEFAULT_HARVEST_LEAGUES = [
  "EPL",
  "라리가",
  "세리에A",
  "분데스리",
  "프리그1",
  "챔피언십",
]

/** 구간 파싱이 실패했다고 볼 문서 크기 — 이보다 많으면 리그 명단이 아니다 */
export const CLUB_LIST_SANITY_MAX = 40
