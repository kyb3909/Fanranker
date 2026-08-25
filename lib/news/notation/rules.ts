/**
 * 표기 규칙 — 순수 함수만. I/O 없음 (로딩은 ./load, 공개 표면은 ./index).
 *
 * 이 파일이 존재하는 이유는 2026-08-09 하루에 같은 병이 다섯 번 터졌기 때문이다:
 * 감독 이름이 4중 방어를 통과, 매체명 영·한 혼용 68건, 사전 1,000행 무음 절단,
 * 네이버가 오답 확정, 표기 감시 자체가 사각. 전부 원인이 하나였다 —
 * **정답을 담은 사전은 하나인데 그걸 읽는 경로가 7개였고 전부 제각각이었다.**
 * category 필터도, 페이징도, 검사 범위도, 최소 글자수도, 실패 처리도 달랐다.
 *
 * 그래서 규칙을 여기 한 곳에 모은다. 소비자는 규칙을 다시 쓰지 않는다.
 */

// 자모 바이그램 유사도 — 순수 함수라 이 파일의 "I/O 없음" 원칙을 깨지 않는다
import { koSimilarity } from "@/lib/news/alias-suggest"

export interface NotationEntry {
  id: string
  category: string
  preferred_ko: string
  romanized: string | null
  surfaces: string[] | null
  hangul_alts: string[] | null
  /** 소속팀 표기 `|` 구분 — 성씨 한 토막을 그 팀 기사에서만 믿게 하는 열쇠 */
  disambiguation?: string | null
}

// ─────────────────────────────────────────────────────────────
// 1. 인물 표기 치환 (alt → preferred)
// ─────────────────────────────────────────────────────────────

export type NamingPair = [from: string, to: string]

/**
 * 사전 행 → 치환 쌍. 안전 규칙:
 *  - alt 가 2자 미만이면 제외 (일반 단어 오폭 방지)
 *  - **한글이 없는 alt 는 제외** — 본문 치환에 영문을 걸면 'Goal'→'골닷컴' 처럼
 *    "Goal of the season" 을 박살낸다. 영문 표기 통일은 제목 라벨(source label)의 몫이다.
 *  - alt 가 다른 항목의 대표 표기와 같으면 제외 (그건 다른 사람/구단이다)
 *  - 긴 표기 우선 정렬 ('코디 갓포'를 먼저, 그 다음 '갓포' — 이중 치환 방지)
 */
export function buildNamingPairs(
  rows: Pick<NotationEntry, "preferred_ko" | "hangul_alts">[]
): NamingPair[] {
  const preferredSet = new Set(rows.map((r) => r.preferred_ko))
  const pairs: NamingPair[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const alt of row.hangul_alts ?? []) {
      const from = alt?.trim()
      if (!from || from.length < 2) continue
      if (!/[가-힣]/.test(from)) continue
      if (from === row.preferred_ko) continue
      // ⚠️ **길이 변형은 치환하지 않는다** — 어느 쪽이 길든 오표기가 아니다.
      //
      // ① alt 가 더 긴 경우: '뉴캐슬 유나이티드'(대표: 뉴캐슬), '파브리시오 로마노'.
      //    줄이면 인용문까지 건드린다 — 실측에서 CEO 발언 "'뉴캐슬 유나이티드 2.0'" 이
      //    "'뉴캐슬 2.0'" 으로 훼손됐다.
      // ② alt 가 더 짧은 경우(성씨): '제임스'(대표: 다니엘 제임스). **성씨는 여러 사람이
      //    공유한다.** 실측 2026-08-10: 네이버 시드가 shortName 을 별칭으로 넣은 탓에
      //    골키퍼 **'제임스 트래포드'가 '다니엘 제임스 트래포드'로** 바뀌려 했다
      //    (리즈 윙어 Daniel James 와 섞임). '벤자민 멘디'→'벤자민 노벨 멘디'도 같은 건.
      //
      // 진짜 오표기는 길이가 아니라 **철자**가 다르다(갓포↔각포, 카릭↔캐릭) — 그건 서로
      // 부분 문자열이 아니므로 이 규칙에 안 걸린다. 길이 통일이 필요하면 위치가 고정된
      // 제목 라벨에서만 한다. foldLengthVariants·findNotationViolations 와 같은 원칙이다.
      const fromC = from.replace(/\s+/g, "")
      const prefC = row.preferred_ko.replace(/\s+/g, "")
      if (fromC.includes(prefC) || prefC.includes(fromC)) continue
      if (preferredSet.has(from)) continue
      if (seen.has(from)) continue // 서로 다른 항목이 같은 alt 를 주장 — 첫 항목 승
      seen.add(from)
      pairs.push([from, row.preferred_ko])
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length)
  return pairs
}

export function applyNamingPairs(text: string, pairs: NamingPair[]): string {
  let t = text
  for (const [from, to] of pairs) {
    if (t.includes(from)) t = t.split(from).join(to)
  }
  return t
}

/** TipTap 트리의 text 노드에만 치환 적용 (구조·URL·attrs 는 건드리지 않음) */
export function applyNamingPairsToTipTap(node: unknown, pairs: NamingPair[]): unknown {
  if (Array.isArray(node)) return node.map((n) => applyNamingPairsToTipTap(n, pairs))
  if (!node || typeof node !== "object") return node
  const n = node as Record<string, unknown>
  const out: Record<string, unknown> = { ...n }
  if (typeof n.text === "string") out.text = applyNamingPairs(n.text, pairs)
  if (n.content) out.content = applyNamingPairsToTipTap(n.content, pairs)
  return out
}

// ─────────────────────────────────────────────────────────────
// 2. 출처 라벨 (제목 앞 대괄호)
// ─────────────────────────────────────────────────────────────

/** 도메인 끝에서 떼어낼 TLD 조각 (theathletic.com → theathletic, bbc.co.uk → bbc) */
const TLD_PARTS = new Set([
  "com",
  "net",
  "org",
  "co",
  "uk",
  "es",
  "fr",
  "it",
  "de",
  "pt",
  "nl",
  "br",
  "us",
  "io",
  "tv",
  "info",
  "london",
])

/**
 * 짧은 키는 버린다. `[AFC]`가 아스널로, `[OM]`이 마르세유로 둔갑하는 것을 막는다.
 * 3자 이하 **로마자** 약어(afc·om·psg…)는 다른 뜻일 위험이 크다.
 *
 * ⚠️ 한글은 기준이 다르다. '모레토'(3자)는 약어가 아니라 온전한 이름인데 4자 하한에
 * 걸려 키가 안 만들어졌고, 그 결과 **사전에 있는데도 "모르는 라벨"로 취급돼**
 * `[모레토]` 가 도메인 폴백으로 `[야후 스포츠]` 가 될 뻔했다(2026-08-09 드라이런).
 * 한글 3자 조합이 다른 뜻일 확률은 로마자 약어와 비교가 안 된다.
 */
function isLabelKeyUsable(key: string, fromDomain = false): boolean {
  if (/[가-힣]/.test(key)) return key.length >= 2
  // 도메인에서 나온 키는 약어와 다르다 — 'bbc'(bbc.com)는 모호하지 않은데 4자 하한에
  // 걸려 키가 안 만들어졌고, 그래서 `[Mokbel]`(source_url=bbc.com)이 `[BBC]` 로
  // 못 바뀌었다. 위험한 건 팀 surfaces 의 약어('afc')지 도메인이 아니다.
  return fromDomain ? key.length >= 3 : key.length >= 4
}

/** 비교용 키 — 대소문자·공백·구두점을 접는다 ("The Athletic" ≡ "theathletic.com"의 몸통) */
export function sourceKey(s: string): string {
  return s.toLowerCase().replace(/[\s.·'’`"\-_&,]/g, "")
}

/** 도메인에서 몸통만: theathletic.com → theathletic, bbc.co.uk → bbc */
function domainBody(domain: string): string {
  const parts = domain.toLowerCase().split(".")
  while (parts.length > 1 && TLD_PARTS.has(parts[parts.length - 1])) parts.pop()
  return sourceKey(parts.join(""))
}

/**
 * 대괄호를 벗긴다 — 대괄호는 제목에서 라벨이 **놓이는 자리**지 표기 자체가 아니다.
 *
 * ⚠️ 실제 사고 (2026-08-22 운영자 제보): 교정 학습기가 제목 라벨을 통째로 집어
 * `[Marca]` → `[마르카]` 를 사전에 등록했고, 그 항목의 romanized("Marca")가 깨끗한
 * 항목(`마르카`)과 **같은 키를 주장**했다. 라벨 교정이 `[${preferred}]` 를 다시
 * 씌우면서 제목이 `[[마르카]]` 로 나갔다. 쓰는 쪽(learn-corrections)에서 막지만,
 * 사전은 사람도 고치는 곳이라 읽는 쪽에도 같은 가드를 둔다.
 */
function stripBrackets(s: string): string {
  return s.replace(/[[\]]/g, "").trim()
}

/**
 * 사전 행 → {키: 대표표기} 맵.
 * 키 출처: preferred_ko / hangul_alts / surfaces / romanized, 그리고 도메인 몸통.
 * 서로 다른 항목이 같은 키를 주장하면 **먼저 온 항목이 이긴다** (치환 쌍과 같은 규율).
 */
export function buildSourceLabelMap(
  rows: Pick<NotationEntry, "preferred_ko" | "romanized" | "surfaces" | "hangul_alts">[]
): Map<string, string> {
  const map = new Map<string, string>()
  const add = (rawIn: string | null | undefined, preferred: string) => {
    const raw = rawIn ? stripBrackets(rawIn) : ""
    if (!raw) return
    const looksLikeDomain = raw.includes(".")
    for (const [key, fromDomain] of [
      [sourceKey(raw), false],
      [domainBody(raw), looksLikeDomain],
    ] as const) {
      if (!isLabelKeyUsable(key, fromDomain)) continue
      if (!map.has(key)) map.set(key, preferred)
    }
  }
  for (const row of rows) {
    // 대표 표기에 대괄호가 섞여 있으면 벗긴다 — 그대로 두면 `[${preferred}]` 가 이중이 된다
    const preferred = stripBrackets(row.preferred_ko ?? "")
    if (!preferred) continue
    add(preferred, preferred)
    for (const alt of row.hangul_alts ?? []) add(alt, preferred)
    for (const surface of row.surfaces ?? []) add(surface, preferred)
    add(row.romanized, preferred)
  }
  return map
}

/** 제목 맨 앞의 `[라벨]` — 대괄호가 없거나 너무 길면 출처 라벨이 아니다 */
const LABEL_RE = /^\[([^\]]{1,40})\]/

/**
 * 제목의 출처 라벨을 대표 표기로 교정. 사전에 없으면 **그대로 둔다** —
 * 모르는 출처를 억지로 바꾸지 않는 것이 fail-safe 방향이다.
 *
 * ⚠️ **제목의 대괄호 라벨만** 바꾼다. 본문 치환은 절대 금지 —
 * 'Goal' → '골닷컴'을 본문에 걸면 "Goal of the season"이 박살난다. 라벨은 위치가
 * 고정돼 있어서 오탐이 원천적으로 불가능하다는 것이 이 설계의 전부다.
 */
export function normalizeSourceLabel(
  title: string,
  map: Map<string, string>,
  /**
   * 원문 URL. 라벨이 사전에 **없을 때만** 이 도메인으로 매체명을 채운다 (2026-08-09).
   *
   * 왜 필요한가: 스캐너가 레딧 원제의 대괄호를 그대로 옮겨서 `[Tom Garry]` `[Mokbel]`
   * `[Stone]` 같은 **기자 성씨 영문**이 제목에 나간다. 독자에게 아무 의미가 없고
   * 신뢰도 판단도 못 하게 만든다 — 게다가 `[Mokbel]` 의 source_url 은 bbc.com 이라
   * 다른 기사의 `[BBC]` 와 같은 매체인데 이름이 갈린다.
   * 도메인은 LLM 이 지어낼 수 없는 사실이므로, 모르는 라벨보다 언제나 낫다.
   *
   * ⚠️ 사전에 **있는** 라벨은 건드리지 않는다 — `[로마노]` `[온스테인]` 처럼 기자명이
   * 매체명보다 정보가 많은 경우가 있고, 그건 이미 운영자가 등재해 인정한 것이다.
   *
   * ⚠️ **한글 라벨도 건드리지 않는다.** 폴백의 목적은 "독자가 못 읽는 라벨"을 없애는
   * 것이지 기자명을 매체명으로 바꾸는 게 아니다. 드라이런에서 `[루크 에드워즈]` →
   * `[텔레그래프]`, `[게타페]` → `[마르카]` 처럼 **정보가 오히려 줄어드는** 변환이
   * 나왔다. 한글로 적혀 있으면 이미 읽을 수 있으므로 그대로 둔다.
   */
  sourceUrl?: string | null
): string {
  const m = LABEL_RE.exec(title)
  if (!m) return title
  const label = m[1].trim()
  const preferred = map.get(sourceKey(label))
  if (preferred) return preferred === label ? title : `[${preferred}]${title.slice(m[0].length)}`

  if (/[가-힣]/.test(label)) return title
  const fromDomain = sourceUrl ? lookupBySourceUrl(map, sourceUrl) : undefined
  if (!fromDomain || fromDomain === label) return title
  return `[${fromDomain}]${title.slice(m[0].length)}`
}

/**
 * URL → 매체 표기. **호스트만 보면 안 된다** — The Athletic 기사는 전부
 * `nytimes.com/athletic/...` 로 온다(실측 6건 전수). 호스트로만 판정하면 디 애슬레틱
 * 기사가 뉴욕타임스로 나간다. 그래서 `host/첫경로` 를 먼저 찾고, 없으면 호스트로 내린다.
 */
function lookupBySourceUrl(map: Map<string, string>, url: string): string | undefined {
  let host = ""
  let seg = ""
  try {
    const u = new URL(url)
    host = u.hostname.replace(/^www\./, "")
    seg = u.pathname.split("/").filter(Boolean)[0] ?? ""
  } catch {
    return undefined
  }
  if (!host) return undefined
  if (seg) {
    const scoped = map.get(domainBody(`${host}/${seg}`)) ?? map.get(sourceKey(`${host}/${seg}`))
    if (scoped) return scoped
  }
  return map.get(domainBody(host))
}

// ─────────────────────────────────────────────────────────────
// 3. 신원 판정 (기사 표기 → 사전 항목)
// ─────────────────────────────────────────────────────────────

/**
 * 사전에 없는 인물명 추리기 — 미등재는 자동발행 제외 사유가 된다.
 * 환각 음차("기마랑에")·오식별("Luis Hall") 차단. 사전은 검수·교정 학습으로
 * 계속 자라므로 커버리지는 시간이 해결한다. 미등재 = 사람 검수로 강등일 뿐.
 */
export function unknownPersonNames(
  namesKr: string[],
  dictionary: Pick<NotationEntry, "preferred_ko" | "hangul_alts">[]
): string[] {
  const known = new Set<string>()
  for (const d of dictionary) {
    known.add(d.preferred_ko.replace(/\s+/g, ""))
    for (const alt of d.hangul_alts ?? []) known.add(alt.replace(/\s+/g, ""))
  }
  return namesKr.filter((n) => {
    const key = n.replace(/\s+/g, "")
    if (known.has(key)) return false
    // 성/이름 부분 표기 허용 — "브루노 기마랑이스" 등재 시 "기마랑이스"도 통과
    for (const k of known) if (k.includes(key) || key.includes(k)) return false
    return true
  })
}

/**
 * 로마자 → 비교용 토큰 ("Michael Carrick" → ["michael","carrick"]).
 *
 * ⚠️ **발음 부호를 먼저 벗긴다.** 축구 이름에는 diacritic 이 흔한데(Leão·Guimarães·
 * Muñoz·Šeško·Højlund), 벗기지 않으면 `a-z` 분할이 글자 한가운데를 쪼갠다:
 *   "Rafael Leão" → ["rafael","le","o"] → ["rafael","le"]   ← 'ã' 에서 끊김
 *   "Rafael Leao" → ["rafael","leao"]
 * 두 표기가 같은 사람인데 토큰이 달라져 신원 매칭이 조용히 실패한다 (2026-08-10 실측:
 * 사전에 '하파엘 레앙'이 정확히 있는데도 오표기를 구해내지 못했다).
 * ø·đ 처럼 분해되지 않는 글자는 NFD 로 안 벗겨지므로 따로 치환한다.
 */
function romanTokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1)
}

/**
 * 로마자 토큰 포함 관계로 **같은 인물인 기존 항목**을 찾는다 (2026-08-09).
 *
 * 실사고: 기사가 성씨만 '카릭'이라 썼는데 사전에는 '마이클 캐릭'(Michael Carrick)이
 * 풀네임으로만 있었다. 자모 유사도는 길이 차이 때문에 이 둘을 못 잇고, 네이버 검증은
 * LLM 이 낸 후보([카릭, 마이클 카릭, 미하엘 카릭])에 정답이 없어서 **오표기를 152건
 * 근거로 확정**했다. 같은 방식으로 'Xabi Alonso'가 '샤비 알론소'로 확정되기도 했다.
 *
 * 로마자는 LLM 이 거의 틀리지 않는다(누구인지는 안다) — 흔들리는 건 한글 음차뿐이다.
 * 그래서 로마자로 신원을 맞추고, **한글 표기는 사전을 따른다**. 사전이 네이버보다 위다.
 *
 * ⚠️ 유일할 때만 흡수한다. 'Silva' 한 토큰은 Gabriel Silva·Thiago Silva 양쪽의
 * 부분집합이라 아무 데나 붙을 수 있다 — 후보가 둘 이상이면 판단하지 않는다.
 * 단 **정확 일치가 있으면 그것이 이긴다**. 같은 인물이 성씨 항목('캐릭')과 풀네임
 * 항목('마이클 캐릭')으로 둘 다 등재되는 건 정상인데(각포/코디 각포 선례), 부분집합만
 * 보면 둘 다 걸려 "모호함"으로 포기해버린다.
 */
/**
 * 신원 판정에 쓸 수 없는 로마자 — **이니셜 축약형**(`J.Araujo`, `A.García`).
 *
 * 2026-08-10 실사고: FPL 시드 747건 중 49건이 이 형태다. `romanTokens` 가 1글자
 * 토큰을 버리므로 `J.Araujo` 가 `["araujo"]` 가 되고, 그러면 **성이 같은 모든 선수가
 * 한 사람으로 뭉친다.** 실측: `findUniqueRomanizedMatch(dict, "Ronald Araujo")` 가
 * 본머스의 J.Araujo(아라우조)를 돌려줬다 — 기사가 '아라우호'로 옳게 써도 이 매칭이
 * '아라우조'로 흡수해버린다. 이니셜은 사람을 특정하지 못하므로 앵커로 쓰지 않는다.
 */
function isInitialForm(romanized: string | null): boolean {
  return /^[A-Za-z]\s*\./.test((romanized ?? "").trim())
}

export function findUniqueRomanizedMatch<T extends Pick<NotationEntry, "romanized">>(
  dictionary: T[],
  romanized: string | null
): T | null {
  if (isInitialForm(romanized)) return null
  const want = romanTokens(romanized)
  if (want.length === 0) return null
  const wantSet = new Set(want)
  const wantKey = [...want].sort().join(" ")
  // 이니셜 축약형 항목은 후보에서 제외 — 신원을 특정하지 못한다
  dictionary = dictionary.filter((d) => !isInitialForm(d.romanized))

  // ① 로마자 토큰 집합이 정확히 같은 항목 (성씨 입력 → 성씨 항목)
  const exact = dictionary.filter(
    (d) => [...new Set(romanTokens(d.romanized))].sort().join(" ") === wantKey
  )
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null // 동명이인 — 판단하지 않는다

  // ② 포함 관계 (성씨 입력 → 풀네임 항목, 또는 그 반대)
  const subset = dictionary.filter((d) => {
    const have = new Set(romanTokens(d.romanized))
    if (have.size === 0) return false
    return want.every((t) => have.has(t)) || [...have].every((t) => wantSet.has(t))
  })
  return subset.length === 1 ? subset[0] : null
}

// ─────────────────────────────────────────────────────────────
// 4. 예방 힌트 재료 (스캐너가 쓰기 전에 정답을 받아가는 용도)
// ─────────────────────────────────────────────────────────────

export interface NotationHint {
  ko: string
  /**
   * 사람인가 라벨(구단·매체)인가.
   * ⚠️ 스캐너의 **이름 환각 검사**가 이걸로 범위를 좁힌다 — 구단명은 원문에 없어도
   *    문맥으로 정당하게 등장할 수 있지만(리그·상대팀 언급), 사람 이름이 원문에
   *    없는데 기사에 나오면 그건 지어낸 것이다. 2026-08-25 실사고: 원문 한 문장짜리
   *    아스널 기사에 "이고르 파이샤오 영입설"이 통째로 붙어 나갔다.
   */
  kind: "person" | "label"
  /** 영어 원문에 실제로 나타날 수 있는 형태만. **어디에 나와도** 이 사람으로 본다 */
  en: string[]
  /**
   * 팀이 같이 언급될 때만 믿는 표기 — 보통 성씨 한 토막이다.
   *
   * ⚠️ 이게 왜 따로인가 (2026-08-25 실사고): 맨시티 이적 기사의 "Savio" 가 "사비오" 로
   *    나갔다. 정답(사비뉴)은 스쿼드 사전에 있었는데 **뉴스 사전에 그 철자가 없었다.**
   *    그렇다고 성씨 한 토막을 전역으로 풀면 더 나빠진다 — 실측으로 `savio` 를 전역
   *    조회하면 J리그 우라와 레드의 **마테우스 사비우**가 나온다. 맨시티 기사에
   *    일본 리그 선수 이름이 박힐 뻔했다.
   *    그래서 성씨는 **그 선수의 팀이 같은 글에 있을 때만** 쓴다.
   */
  enTeam?: string[]
  /** 위 조건을 여는 열쇠 — 소속팀을 가리키는 표기들(영문·한글) */
  team?: string[]
}

/**
 * 사전 → 스캐너용 힌트. en 은 **영어 원문에 나타날 수 있는 형태만** 남긴다:
 *  - 도메인(theathletic.com)은 기사 본문에 안 나오므로 제외
 *  - 한글은 영어 원문 매칭에 무의미하므로 제외
 *  - 3자 이하는 제외 — 'as'·'om' 같은 약어가 아무 문장에나 걸린다 (라벨 키와 같은 규율)
 */
export function buildNotationHints(
  rows: Pick<
    NotationEntry,
    "category" | "preferred_ko" | "romanized" | "surfaces" | "disambiguation"
  >[]
): NotationHint[] {
  const out: NotationHint[] = []
  for (const row of rows) {
    const ko = row.preferred_ko?.trim()
    if (!ko) continue
    const all = [...new Set([row.romanized ?? "", ...(row.surfaces ?? [])])]
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 3 && !s.includes(".") && !/[가-힣]/.test(s))

    /**
     * 소속팀 표기 — 스쿼드 동기화가 `disambiguation` 에 `|` 로 넣어둔다.
     * ⚠️ 옛 항목의 `disambiguation` 은 "Spurs" 같은 **메모**다. 그건 팀 열쇠로 쓰기엔
     *    거칠지만, 아래에서 팀 표기는 **성씨를 잠그는 용도로만** 쓰이므로
     *    (없으면 성씨를 안 쓸 뿐) 틀린 표기를 주입하지는 않는다.
     */
    const team = (row.disambiguation ?? "")
      .split("|")
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)

    /**
     * 성씨 한 토막(공백 없음)은 팀이 있어야 믿는다 — 위 `enTeam` 주석의 사고 방지.
     * ⚠️ 팀 정보가 없는 **옛 항목은 종전대로 전역**이다. 'simons'·'savinho' 처럼
     *    사람이 넣어 잘 돌던 표기까지 갑자기 막으면 멀쩡한 교정이 사라진다.
     */
    const scoped = team.length > 0
    const en = all.filter((s) => !scoped || s.includes(" "))
    const enTeam = scoped ? all.filter((s) => !s.includes(" ")) : []

    if (en.length === 0 && enTeam.length === 0) continue
    const kind: NotationHint["kind"] =
      row.category === "player" || row.category === "coach" ? "person" : "label"
    out.push(enTeam.length > 0 ? { ko, kind, en, enTeam, team } : { ko, kind, en })
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// 5. 위반 탐지 (발행물에 오표기가 살아 있는가)
// ─────────────────────────────────────────────────────────────

interface NotationViolation {
  entryId: string
  alt: string
  preferred: string
}

/**
 * 사전이 **오표기로 아는 문자열**이 발행물에 살아 있다 = 교정 파이프라인이 샜다는 직접 증거.
 *
 * 2026-08-09 이전 이 검사는 선수만·제목만·1,000행 절단 상태였고, 그래서 그날 나온
 * 오표기(하비/샤비/자비 알론소, 카릭, 영문 매체 라벨)를 **하나도 못 잡았다**.
 * 전부 운영자가 눈으로 찾았다 — 탐지를 사람에게 의존하는 상태가 진짜 문제였다.
 *
 * alt 2자 허용: '카릭'·'각포' 같은 성씨 오표기가 3자 하한에 걸려 빠져나갔다.
 */
export function findNotationViolations(
  haystack: string,
  dictionary: NotationEntry[]
): NotationViolation[] {
  const out: NotationViolation[] = []
  for (const d of dictionary) {
    for (const alt of d.hangul_alts ?? []) {
      if (!alt || alt.length < 2 || alt === d.preferred_ko) continue
      // ⚠️ alt 가 대표 표기를 **포함**하면 그건 오표기가 아니라 더 긴 정식 표기다.
      // hangul_alts 에는 성질이 다른 두 가지가 섞여 산다:
      //   · 진짜 오표기      — '하비 알론소'(정: 사비 알론소), '카릭'(정: 캐릭)
      //   · 더 긴 정식 표기  — 'FC 바르셀로나'(대표: 바르셀로나), '마테오 모레토'(대표: 모레토)
      // 후자는 축약형을 대표로 쓰려고 등재한 것이지 틀린 게 아니다. 제목 라벨은 통일하되
      // 본문에 있다고 위반으로 올리면 첫날부터 오탐이 쏟아지고, **시끄러운 감시는 곧
      // 무시당해 없느니만 못하다**. 포함 관계 한 줄이 둘을 정확히 가른다.
      if (alt.includes(d.preferred_ko)) continue
      if (haystack.includes(alt)) {
        out.push({ entryId: d.id, alt, preferred: d.preferred_ko })
      }
    }
  }
  return out
}

interface AliasPoisoning {
  entryId: string
  preferred: string
  alt: string
  /** 왜 의심스러운가 — 알림에 그대로 실어 사람이 1초 만에 판단하게 한다 */
  reason: string
}

/**
 * "이 alt 는 사전의 **다른 항목**을 가리킨다"고 볼 자모 유사도 하한.
 *
 * 실측(2026-08-11)으로 정했다. 세 번 헛짚은 끝에 나온 값이다:
 *   · 글자 겹침 0.34   → 무리뉴 변형('조세 모리냐' 0.20)이 오탐
 *   · 자모 유사도 단독 → 오염 최대 0.364 > 정상 최소 0.167 로 **선을 그을 수 없었다**
 *   · 이 규칙          → 오염 0.909·1.000 vs 오탐 후보 최대 0.750 으로 깨끗이 갈렸다
 * 사전 1,225행 전체에 0.8 을 적용해 경보 0건(오탐 없음)을 확인했다.
 */
const ALIAS_OWNER_SIM_MIN = 0.8

/**
 * 사전 자체의 오염 탐지 — **alt 가 오표기가 아니라 다른 사람**인 경우.
 *
 * ## 왜 필요한가
 * 2026-08-11 운영자가 발행된 기사에서 "레온"을 발견했다(정: 하파엘 레앙). 파보니
 * 파이프라인이 못 고친 게 아니라 **사전이 레앙을 레온으로 바꾸고 있었다**:
 *   `preferred_ko: "레온"(D.Leon) / hangul_alts: ["라파엘 레앙"]`
 * 이름만으로 네이버를 세던 시절(레온 45,133 vs 레앙 5,209) 만들어진 화석이다.
 * 같은 형태를 훑으니 넷 더 있었다 — 엔소←"엔조 마레스카"(첼시 감독),
 * 안드레아스←"데코"(바르사 디렉터), 올슨←"노르웨이 축구협회 회장"(직함!),
 * 헥터 벨레린←"헥터 포르트"(다른 선수).
 *
 * 발행 게이트에는 이제 `plausibleCorrection` 가드가 있어 새 오염은 막힌다. 그러나
 * **이미 들어앉은 오염은 아무도 안 본다** — 치환이 조용히 성공하므로 위반으로도 안
 * 잡히고, 결국 운영자가 발행된 기사에서 눈으로 찾았다. 그래서 사전 자체를 검사한다.
 *
 * ## 판정 — "이 오표기가 사전의 **다른 항목**을 더 닮았는가"
 * 길이 변형(한쪽이 다른 쪽을 포함)은 통과 — '레앙'↔'하파엘 레앙'은 다툼이 아니다.
 * 그 외에는, alt 가 자기 항목보다 **다른 항목을 뚜렷하게 더 닮았으면** 두 대상을
 * 뭉개고 있다고 본다. '라파엘 레앙'은 자기 항목 '레온'과 0.27 이지만 '하파엘 레앙'과
 * 0.91 이다. 반면 음차 변형은 그런 주인이 따로 없다.
 *
 * ⚠️ **한계**: 진짜 주인이 사전에 있어야 잡힌다. '데코'·'헥터 포르트'처럼 상대가
 * 미등재면 이 검사는 침묵한다. 오탐 없는 좁은 그물을 택한 결과다 —
 * 시끄러운 감시는 곧 무시당해 없느니만 못하기 때문이다.
 *
 * 자동 삭제하지 않는다 — 확정은 사람이다(이 저장소의 감사 원칙).
 */
export function findAliasPoisoning(dictionary: NotationEntry[]): AliasPoisoning[] {
  const compact = (s: string) => s.replace(/\s+/g, "")
  const out: AliasPoisoning[] = []

  for (const d of dictionary) {
    const pk = compact(d.preferred_ko)
    for (const alt of d.hangul_alts ?? []) {
      if (!alt || alt === d.preferred_ko) continue
      const ak = compact(alt)
      if (pk.includes(ak) || ak.includes(pk)) continue // 길이 변형 — 정상

      const own = koSimilarity(d.preferred_ko, alt)
      let best = { id: "", ko: "", sim: 0 }
      for (const other of dictionary) {
        if (other.id === d.id) continue
        const sim = koSimilarity(other.preferred_ko, alt)
        if (sim > best.sim) best = { id: other.id, ko: other.preferred_ko, sim }
      }

      if (best.sim >= ALIAS_OWNER_SIM_MIN && best.sim > own) {
        out.push({
          entryId: d.id,
          preferred: d.preferred_ko,
          alt,
          reason:
            `"${alt}" 은 자기 항목("${d.preferred_ko}", 유사도 ${own.toFixed(2)})보다 ` +
            `"${best.ko}"(${best.id}, ${best.sim.toFixed(2)})를 더 닮았다 — 서로 다른 대상을 뭉갠다`,
        })
      }
    }
  }
  return out
}
