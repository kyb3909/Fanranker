/**
 * 결장 사유 한글화 — **순수 모듈** (2026-08-25 분리).
 *
 * ⚠️ preview.ts 안에 있던 것을 옮겼다. 거기는 Supabase 를 import 하므로 테스트가 env 없이
 *    못 돌았다 — 실제로 이 표에 `leg`·`stress` 가 빠져 프로덕션에 "Leg 부상",
 *    "허벅지 근육 stress" 가 떠 있었는데 **테스트를 붙일 수가 없어서** 못 잡았다.
 *    day-freshness·score-gate·nickname-match 와 같은 이유로 순수 모듈로 뺀다.
 */

/**
 * 결장 사유 한글화 (2026-08-17 운영자: "결장 이유도 모두 한글로").
 *
 * 어휘가 닫혀 있어(부위 + 유형 조합) 사전이 아니라 **부분 치환**으로 처리한다:
 * "Thigh Muscle Strain" → "허벅지 근육 염좌". 못 바꾼 토큰은 그대로 남겨
 * 정보가 사라지지 않게 한다 (빈칸보다 영문이 낫다).
 * 긴 표현부터 치환해야 "Hamstring Injury" 가 "Injury" 에 먼저 걸리지 않는다.
 */
const INJURY_TERMS: [RegExp, string][] = [
  // 통 문장형 사유 — 부분 치환보다 먼저 통째로 잡는다 (2026-08-18 실측 미번역분)
  [/\bnot included in the (?:match )?squad\b/gi, "명단 제외"],
  [/\bimpact[- ]related\b/gi, "타박"],
  [/\black of match fitness\b/gi, "경기 감각 부족"],
  [/\bknock\b/gi, "타박"],
  // 상태·유형 (먼저)
  [/\bcruciate ligament\b/gi, "십자인대"],
  [/\bligament\b/gi, "인대"],
  [/\bmuscle strain\b/gi, "근육 염좌"],
  [/\bmuscular problems?\b/gi, "근육 문제"],
  [/\bstrains?\b/gi, "염좌"],
  [/\bsprains?\b/gi, "염좌"],
  [/\bruptures?\b/gi, "파열"],
  [/\btears?\b/gi, "파열"],
  // ⚠️ 복합어가 먼저다 — 아래 fracture 가 먼저 걸리면 "Stress Fracture" 가 "Stress 골절"
  //    이 되고, 뒤에서 stress 가 걸려 "피로 골절" 로 어색하게 띄어써진다 (테스트가 잡음).
  [/\bstress fractures?\b/gi, "피로골절"],
  [/\bfractures?\b/gi, "골절"],
  [/\bbroken\b/gi, "골절"],
  [/\btendon\b/gi, "힘줄"],
  [/\bsurgery\b/gi, "수술"],
  [/\bconcussion\b/gi, "뇌진탕"],
  [/\billness\b/gi, "질병"],
  [/\bfitness\b/gi, "컨디션"],
  [/\bsuspend(?:ed|ision)?\b/gi, "출전정지"],
  [/\bsuspension\b/gi, "출전정지"],
  [/\bred card\b/gi, "퇴장 징계"],
  [/\bdoubtful\b/gi, "출전 불투명"],
  [/\bunknown\b/gi, "사유 미상"],
  [/\bpersonal reasons?\b/gi, "개인 사정"],
  [/\binternational duty\b/gi, "대표팀 차출"],
  [/\bproblems?\b/gi, "문제"],
  [/\binjur(?:y|ies|ed)\b/gi, "부상"],
  [/\bout\b/gi, "결장"],
  // 부위
  [/\bhamstring\b/gi, "햄스트링"],
  [/\bachilles\b/gi, "아킬레스건"],
  [/\bthigh\b/gi, "허벅지"],
  [/\bcalf\b/gi, "종아리"],
  [/\bgroin\b/gi, "사타구니"],
  [/\bknee\b/gi, "무릎"],
  [/\bankle\b/gi, "발목"],
  [/\bfoot\b/gi, "발"],
  [/\btoe\b/gi, "발가락"],
  [/\bhip\b/gi, "고관절"],
  [/\bback\b/gi, "허리"],
  [/\bshoulder\b/gi, "어깨"],
  [/\belbow\b/gi, "팔꿈치"],
  [/\bwrist\b/gi, "손목"],
  [/\bhand\b/gi, "손"],
  [/\bhead\b/gi, "머리"],
  [/\bface\b/gi, "얼굴"],
  [/\bnose\b/gi, "코"],
  [/\brib\b/gi, "갈비뼈"],
  [/\bchest\b/gi, "가슴"],
  [/\babdominal\b/gi, "복부"],
  [/\bpubic\b/gi, "치골"],
  [/\bmeniscus\b/gi, "반월판"],
  [/\bmuscle\b/gi, "근육"],
  // 2026-08-25 실측 누락 보강 — 프로덕션 매치센터에 "Leg 부상", "허벅지 근육 stress",
  // "종아리 stress" 가 그대로 노출되고 있었다. 한국어 화면에 영어 의학 용어가 남는 건
  // 사전이 부족해서지 구조 문제가 아니다.
  [/\bstress\b/gi, "피로"],
  [/\bcontusion\b|\bbruise\b/gi, "타박상"],
  [/\bvirus\b/gi, "바이러스 감염"],
  [/\bcovid(?:-19)?\b/gi, "코로나"],
  // 부위 추가분
  [/\bleg\b/gi, "다리"],
  [/\bshin\b/gi, "정강이"],
  [/\bneck\b/gi, "목"],
  [/\barm\b/gi, "팔"],
  [/\bfingers?\b/gi, "손가락"],
  [/\bheel\b/gi, "뒤꿈치"],
  [/\bquadriceps\b|\bquad\b/gi, "대퇴사두근"],
  [/\badductor\b/gi, "내전근"],
  [/\bpelvis\b|\bpelvic\b/gi, "골반"],
]

export function localizeInjuryStatus(raw: string): string {
  let s = String(raw ?? "").trim()
  if (!s) return s
  for (const [re, ko] of INJURY_TERMS) s = s.replace(re, ko)
  // "허벅지/고관절 부상" 처럼 슬래시 구분은 가운뎃점이 한국어에서 자연스럽다
  s = s
    .replace(/\s*\/\s*/g, "·")
    .replace(/\s{2,}/g, " ")
    .trim()

  /**
   * ⚠️ **못 옮긴 단어를 조용히 흘려보내지 않는다** (2026-08-25).
   *
   * 이 표에 없는 단어는 영어 그대로 화면에 나간다. 실제로 "Leg 부상"·"근육 stress" 가
   * 프로덕션에 떠 있었는데, **아무 신호도 없어서** 운영자 제보 전까지 아무도 몰랐다.
   * 사전 방식은 구멍이 생기는 게 정상이므로, 구멍이 **보이게** 만드는 쪽이 중요하다.
   *
   * 영어를 한글로 바꾸려 시도하지 않는다 — 틀린 한글보다 영어 원문이 낫다. 로그만 남긴다.
   */
  const leftover = s.match(/[A-Za-z]{3,}/g)
  if (leftover?.length) {
    console.warn(`[lfa/preview] 부상 사유 미번역: ${leftover.join(", ")} (원문: ${raw})`)
  }
  return s
}
