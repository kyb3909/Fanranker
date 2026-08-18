/**
 * 팀·선수 이름 대조 공용 규칙 (나무위키 수확기 2종이 공유).
 *
 * 여기 담긴 규칙은 전부 실사고에서 나왔다 — 주석의 ⚠️ 는 되돌리면 안 되는 것들이다.
 */

/** 분해해도 기본 글자가 안 나오는 문자들 */
const LATIN_ODD: Record<string, string> = { ø: "o", Ø: "O", đ: "d", Đ: "D", ł: "l", Ł: "L" }

/**
 * 라틴 발음기호만 접는다 — **길이를 보존해야** 인덱스가 원문과 맞는다.
 *
 * ⚠️ 문자열 전체에 `normalize("NFD")` 를 걸면 안 된다. 한글 음절이 자모 3개로 쪼개져
 *    길이가 늘어나고, 그 인덱스로 원문을 잘라 이름을 회수하면 엉뚱한 자리가 나온다
 *    (2026-08-18 실사고 — 표를 제대로 받고도 대조가 0건이던 이유).
 */
export function foldLatin(s: string): string {
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
export function teamTokens(s: string): string[] {
  return s
    .replace(/[·\-]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !TEAM_NOISE.has(t))
}

/** 토큰 한 쌍이 같은 말인가 — 포함까지 허용 ("코루냐" ⊂ "아코루냐") */
export function tokenAkin(a: string, b: string): boolean {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.length >= 3 && l.includes(s)
}

/**
 * 한글만 남긴 식별 키. 사전은 약어를 붙여 쓰고("AS로마") 나무위키는 띄어 쓴다("AS 로마").
 *
 * ⚠️ 2글자 한글 토큰을 부분 포함으로 풀어주는 방식으로 해결하면 안 된다 —
 *    "레알" 이 "비야레알" 의 부분문자열이라 레알 마드리드가 비야레알로 붙는다 (실측).
 */
export function hangulKey(s: string): string {
  return s.replace(/[^가-힣]/g, "")
}

/**
 * 사전 팀이 이 구단 문서의 팀인가 — 한쪽 토큰 집합이 다른 쪽에 전부 담기면 같은 팀.
 *
 * ⚠️ 별칭은 **정확일치만** 본다. 2글자 별칭 "레알" 을 부분 매칭에 쓰면
 *    "레알 소시에다드"가 레알 마드리드로 붙는다 (2026-08-18 실측 오답).
 */
export function teamMatchScore(docName: string, nameKr: string, aliases: string[]): number {
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
  return t.filter((x) => d.some((y) => tokenAkin(x, y))).length
}

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
 * 이름을 기준으로 잡으면 "Macia Carlos" 가 "카를로스 로메로" 로 붙는 오답이 난다.
 */
export function pickAnchor(nameEn: string): string | null {
  for (const t of nameEn.split(/\s+/).filter(Boolean)) {
    if (PARTICLES.has(t.toLowerCase())) continue
    if (t.replace(/[^A-Za-z]/g, "").length >= 4) return t
  }
  return null
}

/** 대조용 정규화 — 발음기호·구두점·공백을 지운 소문자 */
export function latinKey(s: string): string {
  return foldLatin(s)
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase()
}

/**
 * 사람 이름이 아니라 **문서 산문 조각**인가.
 *
 * 나무위키 본문에서 "한글 뒤 로마자" 를 주울 때 문장이 딸려 들어온다 —
 * "1884년에 창단하여 Derby…" 가 선수 한글명 "년에 창단하여" 가 됐다 (2026-08-18 실측).
 * 음역된 사람 이름에는 조사·서술어 어미가 붙지 않는다는 성질로 거른다.
 */
const PROSE_TAIL =
  /(년에|하여|하고|했다|한다|에서|으로|이며|였다|까지|부터|있는|되는|하는|이던|들이|원곡은)$/
const PROSE_WORD =
  /^(창단|우승|시즌|리그|구단|경기|소속|이후|당시|수용|홈구장|출신|현재|기록|이적료|계약|원곡)$/
export function isProseFragment(kr: string): boolean {
  const tokens = kr.split(/[\s·]+/).filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.some((t) => PROSE_TAIL.test(t) || PROSE_WORD.test(t))
}
