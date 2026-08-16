/**
 * 금액 증거 검사 — 원문에 없는 금액은 제목에서 뺀다 (2026-08-08 오너 확정:
 * "금액은 굳이 없으면 빼도 좋아. 오피셜로 영입했다는 소식만 전해도 돼")
 *
 * 실측 배경 (환각 연구 §1): "£75m sale" 원문이 "1억 유로 영입" 헤드라인이 되고
 * (부풀림), "€140m" 이 "1,400억"이 되는(환율 왜곡 — 실제 ≈2,100억) 수치 조작이
 * 30일 표본에서 반복 확인됐다. 환산·반올림을 모델에 맡기면 틀린다.
 *
 * 규칙 (결정론): 제목의 금액 표현에서 숫자 토큰(콤마 제거 정수)을 뽑아 **원문의
 * 숫자 토큰 집합에 정확히 존재할 때만** 유지, 없으면 금액 표현째 제거한다.
 * 정확한 환산값도 원문에 그 숫자가 없으면 제거된다 — 오너 정책상 허용
 * (금액 없는 오피셜 > 환산 금액의 정확성 논쟁).
 */

/**
 * 제목 속 금액 표현 — 앞말(이적료·최대·약)과 뒷말(단위·통화·조사)까지 한 덩어리로.
 * 한국 헤드라인은 통화 생략형("1,400억")이 흔해 億/만 단위는 통화 없이도 금액이다.
 */
const AMOUNT_PHRASE_RE =
  /(?:\s*(?:이적료|총액|최대|약|무려))?\s*[0-9][\d,.]*\s*(?:(?:억|천만|백만|만)\s*(?:유로|파운드|원|달러)?|(?:유로|파운드|원|달러|€|£|\$|m\b|million))(?:\s*[+＋]\s*[\d,.]+\s*[^\s…]*)?(?:\s*(?:에|의|짜리|규모(?:의)?))?/gi

/** 텍스트의 숫자 토큰(콤마 제거, 2자리 이상 또는 단위 동반 1자리) */
export function numericTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/[0-9][\d,]*(?:\.\d+)?/g)) {
    const cleaned = m[0].replace(/,/g, "")
    out.add(cleaned)
    // 소수점 표기(1.4)는 정수부도 후보로
    if (cleaned.includes(".")) out.add(cleaned.split(".")[0])
  }
  return out
}

interface AmountStripResult {
  title: string
  /** 제거된 금액 표현들 (원장·로그용) */
  removed: string[]
}

export function stripUnevidencedAmounts(title: string, sourceText: string): AmountStripResult {
  const evidence = numericTokens(sourceText)
  const removed: string[] = []

  const stripped = title.replace(AMOUNT_PHRASE_RE, (phrase) => {
    const tokens = [...numericTokens(phrase)]
    if (tokens.length === 0) return phrase
    const evidenced = tokens.some((t) => evidence.has(t))
    if (evidenced) return phrase
    removed.push(phrase.trim())
    return ""
  })

  if (removed.length === 0) return { title, removed }

  // 제거 후 공백·구두점 정리 ("영입  …" / "영입 ," 방지)
  const cleaned = stripped
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,….])/g, "$1")
    .replace(/[·,]\s*$/g, "")
    .trim()

  return { title: cleaned, removed }
}
