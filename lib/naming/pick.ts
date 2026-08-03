/**
 * 표기 승자 판정 — 순수 로직 (lib/naming/verify 의 네이버 검색량 재료를 판정).
 * "한국 언론 실사용이 정답": 압도적 다수 표기만 채택, 애매하면 사람 검수.
 */

export interface SpellingVerdict {
  /** 확정 표기 (확신 없으면 null) */
  winner: string | null
  /** 후보별 네이버 뉴스 기사 수 — 등재 근거로 사전 notes 에 남긴다 */
  counts: { candidate: string; total: number }[]
  reason: string
}

/** 채택 조건: 1위가 이 수 이상 + 2위의 3배 이상 (압도적 다수) */
const MIN_TOTAL = 30
const MIN_RATIO = 3

/** 클럽·국가대표팀명 — 선수명 추출기가 가끔 뱉는 오탐. 절대 표기 검증 대상 아님 */
const CLUB_NAME_RE =
  /리버풀|첼시|아스날|아스널|토트넘|맨체스터|맨유|맨시티|뉴캐슬|브렌트포드|에버턴|풀럼|울버햄튼|울버햄프턴|브라이턴|브라이튼|본머스|번리|리즈|팰리스|빌라|웨스트햄|노팅엄|선덜랜드|레알 마드리드|바르셀로나|아틀레티코|유벤투스|인터 밀란|인테르|밀란|나폴리|바이에른|뮌헨|도르트문트|레버쿠젠|라이프치히|PSG|파리 생제르맹|포르투|벤피카|아약스|갈라타사라이|페네르바체|국가대표|대표팀/

export function isClubName(name: string): boolean {
  return CLUB_NAME_RE.test(name)
}

/**
 * 교정 타당성 — 바뀌기 전후 표기가 실제로 닮았는가.
 * 실사고(2026-08-04): '리버풀'이 선수로 오인돼 '헨더슨'으로 치환됨. 표기 교정은
 * 음차 차이(갓포↔각포)지 다른 단어로의 교체가 아니다 — 글자 겹침으로 거른다.
 */
export function plausibleCorrection(from: string, to: string): boolean {
  const a = from.replace(/\s+/g, "")
  const b = to.replace(/\s+/g, "")
  if (a === b) return false
  if (a.includes(b)) return false // 풀네임→성 축약은 교정이 아니라 훼손
  if (b.includes(a)) return true // 성→풀네임 확장은 허용
  const setB = new Set(b.split(""))
  const overlap = a.split("").filter((ch) => setB.has(ch)).length
  return overlap / Math.max(a.length, 1) >= 0.34
}

export function pickWinner(counts: { candidate: string; total: number }[]): SpellingVerdict {
  const sorted = [...counts].sort((a, b) => b.total - a.total)
  const top = sorted[0]
  const second = sorted[1]
  if (!top || top.total < MIN_TOTAL) {
    return { winner: null, counts: sorted, reason: "검색량 부족 — 사람 검수" }
  }
  if (second && second.total > 0 && top.total < second.total * MIN_RATIO) {
    return { winner: null, counts: sorted, reason: "표기 경합 — 사람 검수" }
  }
  return { winner: top.candidate, counts: sorted, reason: `네이버 ${top.total}건 우세` }
}
