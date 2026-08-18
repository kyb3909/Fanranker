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
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
  if (!res.ok) return []
  const html = await res.text()

  const start = html.indexOf(sectionHint)
  const seg = start >= 0 ? html.slice(start, start + window) : html

  // ⚠️ 작은따옴표 속성 — 큰따옴표로 짜면 거의 안 잡힌다
  const re = /href='\/w\/([^']+)'\s+title='([^']+)'/g
  const out: NamuClub[] = []
  const seen = new Set<string>()
  for (const m of seg.matchAll(re)) {
    const doc = decodeURIComponent(m[1]).replace(/#.*$/, "")
    if (seen.has(doc) || !isClubDoc(doc)) continue
    seen.add(doc)
    out.push({ doc, title: m[2], url: `https://namu.wiki/w/${encodeURIComponent(doc)}` })
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

/** 나무위키 문서 본문 텍스트 */
export async function fetchNamuDocText(doc: string): Promise<string | null> {
  const res = await fetch(`https://namu.wiki/w/${encodeURIComponent(doc)}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) return null
  return stripNamuHtml(await res.text())
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
  const res = await fetch(`https://namu.wiki/w/${encodeURIComponent(clubDoc)}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
  })
  const html = res.ok ? await res.text() : ""
  const body = html ? stripNamuHtml(html) : null
  if (hasSquadTable(body)) parts.push(body)

  // ② `틀:{구단 문서명}` — 규칙으로 바로 맞는 경우
  const direct = await fetchNamuDocText(`틀:${clubDoc}`)
  if (hasSquadTable(direct)) parts.push(direct)

  // ③ 규칙이 빗나가면 본문의 "스쿼드" 링크를 따라간다
  if (parts.length === 0 && html) {
    const m = html.match(/href='\/w\/(%ED%8B%80[^']+)'[^>]*>스쿼드<\/a>/)
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

/** 구간 파싱이 실패했다고 볼 문서 크기 — 이보다 많으면 리그 명단이 아니다 */
export const CLUB_LIST_SANITY_MAX = 40
