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

export interface NotationEntry {
  id: string
  category: string
  preferred_ko: string
  romanized: string | null
  surfaces: string[] | null
  hangul_alts: string[] | null
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
      // alt 가 대표 표기를 **포함**하면 오표기가 아니라 더 긴 정식명이다 —
      // '뉴캐슬 유나이티드'(대표: 뉴캐슬), '파브리시오 로마노'(대표: 로마노).
      // 본문에서 이걸 줄이면 인용문까지 건드린다: 실측에서 CEO 발언
      // "'뉴캐슬 유나이티드 2.0'" 이 "'뉴캐슬 2.0'" 으로 바뀌었다.
      // 길이 통일은 **제목 라벨**(source label)에서만 한다 — 위치가 고정돼 안전하다.
      // findNotationViolations 와 같은 규칙이다: 포함 관계면 오표기가 아니다.
      if (from.includes(row.preferred_ko)) continue
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
 * 3자 이하 약어(bbc·espn·psg…)는 대부분 preferred 와 같아 어차피 바뀔 게 없고,
 * 다른 뜻일 위험만 남는다 — 놓치는 건 안전하지만 엉뚱하게 바꾸는 건 안전하지 않다.
 */
const MIN_LABEL_KEY_LENGTH = 4

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
 * 사전 행 → {키: 대표표기} 맵.
 * 키 출처: preferred_ko / hangul_alts / surfaces / romanized, 그리고 도메인 몸통.
 * 서로 다른 항목이 같은 키를 주장하면 **먼저 온 항목이 이긴다** (치환 쌍과 같은 규율).
 */
export function buildSourceLabelMap(
  rows: Pick<NotationEntry, "preferred_ko" | "romanized" | "surfaces" | "hangul_alts">[]
): Map<string, string> {
  const map = new Map<string, string>()
  const add = (raw: string | null | undefined, preferred: string) => {
    if (!raw) return
    for (const key of [sourceKey(raw), domainBody(raw)]) {
      if (key.length < MIN_LABEL_KEY_LENGTH) continue
      if (!map.has(key)) map.set(key, preferred)
    }
  }
  for (const row of rows) {
    const preferred = row.preferred_ko?.trim()
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
export function normalizeSourceLabel(title: string, map: Map<string, string>): string {
  const m = LABEL_RE.exec(title)
  if (!m) return title
  const label = m[1].trim()
  const preferred = map.get(sourceKey(label))
  if (!preferred || preferred === label) return title
  return `[${preferred}]${title.slice(m[0].length)}`
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

/** 로마자 → 비교용 토큰 ("Michael Carrick" → ["michael","carrick"]) */
function romanTokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
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
export function findUniqueRomanizedMatch<T extends Pick<NotationEntry, "romanized">>(
  dictionary: T[],
  romanized: string | null
): T | null {
  const want = romanTokens(romanized)
  if (want.length === 0) return null
  const wantSet = new Set(want)
  const wantKey = [...want].sort().join(" ")

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
  /** 영어 원문에 실제로 나타날 수 있는 형태만 */
  en: string[]
}

/**
 * 사전 → 스캐너용 힌트. en 은 **영어 원문에 나타날 수 있는 형태만** 남긴다:
 *  - 도메인(theathletic.com)은 기사 본문에 안 나오므로 제외
 *  - 한글은 영어 원문 매칭에 무의미하므로 제외
 *  - 3자 이하는 제외 — 'as'·'om' 같은 약어가 아무 문장에나 걸린다 (라벨 키와 같은 규율)
 */
export function buildNotationHints(
  rows: Pick<NotationEntry, "preferred_ko" | "romanized" | "surfaces">[]
): NotationHint[] {
  const out: NotationHint[] = []
  for (const row of rows) {
    const ko = row.preferred_ko?.trim()
    if (!ko) continue
    const en = [...new Set([row.romanized ?? "", ...(row.surfaces ?? [])])]
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 3 && !s.includes(".") && !/[가-힣]/.test(s))
    if (en.length > 0) out.push({ ko, en })
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// 5. 위반 탐지 (발행물에 오표기가 살아 있는가)
// ─────────────────────────────────────────────────────────────

export interface NotationViolation {
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
