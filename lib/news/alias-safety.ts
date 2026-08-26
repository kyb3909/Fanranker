/**
 * 사전에 **별칭을 붙여도 되는가** 판정 (순수 모듈).
 *
 * ## 무슨 사고였나 (2026-08-26 발견)
 * 자동 학습이 이름 조각만 보고 별칭을 붙여 **서로 다른 사람을 한 항목에 뭉갰다.**
 * 발행된 기사 4건에 엉뚱한 사람 이름이 박혔다.
 *
 *   루벤 디아스(맨시티 DF)  ← "루벤 아모림"(맨유 감독), "루벤 로프터스-치크"(밀란 MF)
 *   레온                   ← "라파엘 레앙"(밀란 FW)
 *   뤼터                   ← "조르지뉴"(아스날 MF)
 *   트로이 디니(은퇴)       ← "트레이 뇨니"(리버풀 유망주)
 *
 * 뿌리는 하나다: **이름 문자열만으로는 사람을 가릴 수 없다.** FPL 에서 온 항목의
 * `romanized` 가 성 없이 이름 조각(`"Rúben"`, `"D.Leon"`)뿐이라, "루벤 ○○" 이
 * 전부 같은 사람으로 보였다.
 *
 * ## 왜 자모까지 내려가나
 * 한국어 음차는 **표기가 흔들린다** — "로던/로든", "부스코비치/부슈코비치" 는 같은
 * 사람이다. 글자 단위로 비교하면 이런 정상 변형까지 막힌다 (실측: 로던/로든 은
 * 글자 겹침 0.33). 자모로 내려가면 "던/든"(ㄷ_ㄴ 공유)은 닮았고 "디니/뇨니" 는
 * 안 닮았다는 것이 구분된다.
 *
 * ⚠️ 이 판정은 **막는 쪽으로만** 쓴다. 통과했다고 옳다는 뜻이 아니라, 명백히
 *    위험한 것을 걸러낼 뿐이다. 최종 확인은 발행 전 스쿼드 대조와 사람이 한다.
 */

/** 한글 음절을 자모로 푼다 ("던" → ["ㄷ","ㅓ","ㄴ"]). 한글이 아니면 글자 그대로. */
export function toJamo(text: string): string[] {
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
  const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
  const JONG = "_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"
  const out: string[] = []
  for (const ch of String(text ?? "")) {
    const code = ch.charCodeAt(0) - 0xac00
    if (code < 0 || code > 11171) {
      if (/\s/.test(ch)) continue
      out.push(ch.toLowerCase())
      continue
    }
    out.push(CHO[Math.floor(code / 588)])
    out.push(JUNG[Math.floor((code % 588) / 28)])
    const jong = JONG[code % 28]
    if (jong !== "_") out.push(jong)
  }
  return out
}

/**
 * 자모 기준 닮음 정도 (0~1). 순서를 보존하는 최장공통부분수열 기반 —
 * 단순 집합 겹침은 "디아스"와 "스아디"를 같다고 본다.
 */
export function jamoSimilarity(a: string, b: string): number {
  const x = toJamo(a)
  const y = toJamo(b)
  if (x.length === 0 || y.length === 0) return 0

  // LCS 길이 (짧은 이름들이라 O(n·m) 로 충분하다)
  const dp: number[] = new Array(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    let prev = 0
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j]
      dp[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return (2 * dp[y.length]) / (x.length + y.length)
}

/** 마지막 낱말 = 성으로 본다 (한국어 축구 표기는 "이름 성" 순서다) */
function surname(fullName: string): string {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts[parts.length - 1] ?? ""
}

function wordCount(s: string): number {
  return String(s ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * 성이 같은 사람의 표기 변형인가. 이 값 미만이면 **다른 사람**으로 본다.
 * 실측 기준 (2026-08-26):
 *   로던 / 로든            0.80  ← 같은 사람, 통과해야 한다
 *   부스코비치 / 부슈코비치  0.90  ← 같은 사람
 *   디니 / 뇨니            0.50  ← 다른 사람 (트로이 디니 ≠ 트레이 뇨니)
 *   디아스 / 아모림        0.00  ← 다른 사람
 */
export const SURNAME_MIN_SIMILARITY = 0.62

export interface AliasEntry {
  preferred_ko: string
  romanized?: string | null
}

export type AliasVerdict = { ok: true } | { ok: false; reason: string }

/**
 * 이 별칭을 이 항목에 붙여도 되는가.
 *
 * 막는 조건은 전부 **오늘 실제로 사고를 낸 모양**이다 — 상상해서 만든 규칙이 아니다.
 */
export function canAbsorbAlias(entry: AliasEntry, alias: string): AliasVerdict {
  const preferred = String(entry.preferred_ko ?? "").trim()
  const alt = String(alias ?? "").trim()
  const romanized = String(entry.romanized ?? "").trim()

  if (!preferred || !alt) return { ok: false, reason: "정본 또는 별칭이 비었다" }
  if (alt === preferred) return { ok: false, reason: "정본과 같다" }

  // ① 너무 짧은 한글 별칭 — 한국어엔 낱말 경계가 없어 다른 말 속에 박힌다
  //    (실사고: "건"·"번"·"영"·"힐" 이 한국어 문장 속에서 걸려 기사 생산이 멈췄다)
  if (/^[가-힣]+$/.test(alt) && alt.length <= 2) {
    return { ok: false, reason: `2글자 이하 한글 별칭은 낱말 속에 박힌다 ("${alt}")` }
  }

  // ② 로마자가 잘린 항목 — 성이 없으면 "루벤 ○○" 을 전부 같은 사람으로 본다
  //    (실사고: romanized "Rúben" 에 아모림·로프터스-치크가 붙었다)
  if (romanized && wordCount(romanized) === 1 && wordCount(preferred) >= 2) {
    return {
      ok: false,
      reason: `로마자가 잘려 있다 ("${romanized}" — 정본은 "${preferred}"). 성이 없는 항목엔 별칭을 붙이지 않는다`,
    }
  }

  // ③ 성만 있는 항목에 풀네임을 붙이지 않는다
  //    (실사고: "레온"(D.Leon) 에 "라파엘 레앙" 이 붙었다)
  if (wordCount(preferred) === 1 && wordCount(alt) >= 2) {
    return {
      ok: false,
      reason: `성만 있는 항목("${preferred}")에 풀네임("${alt}")을 붙이면 다른 사람을 뭉갠다`,
    }
  }

  // ④ 성이 다르면 다른 사람이다 — 음차 흔들림은 자모가 닮는다
  const [sa, sb] = [surname(preferred), surname(alt)]
  const sim = jamoSimilarity(sa, sb)
  if (sim < SURNAME_MIN_SIMILARITY) {
    return {
      ok: false,
      reason: `성이 다르다 ("${sa}" vs "${sb}", 닮음 ${sim.toFixed(2)} < ${SURNAME_MIN_SIMILARITY})`,
    }
  }

  return { ok: true }
}
