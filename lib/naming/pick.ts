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

/**
 * 길이 변형 접기 — 같은 이름의 짧은/긴 형태는 **경쟁 관계가 아니다** (2026-08-10).
 *
 * 실사고: '로날드 아라우호'가 7일간 4번 막히고도 한 번도 등재되지 않았다. 이유는
 *   네이버: 아라우호 6,790 / 로날드 아라우호 3,957 → "표기 경합 — 사람 검수"
 * 인데, 이 둘은 **철자가 다른 게 아니라 길이가 다르다.** 짧은 쪽이 많은 건 당연하다 —
 * 그의 모든 기사에 들어 있는 부분 문자열이니까. 철자 다툼이 없는데 시스템이 다툼으로
 * 오독해 영원히 보류했다. 같은 구조로 '비니시우스 주니어/주니오르'도 갇혔었다.
 *
 * 반대로 진짜 대안(샤비/하비/자비 알론소, 캐릭/카릭)은 서로 부분 문자열이 아니라
 * 그대로 비교된다 — 이 접기는 그 판정을 건드리지 않는다.
 *
 * 같은 변형군에서는 **검색량이 큰 쪽을 남긴다** — 한국 언론 실사용이 정답이라는
 * 이 모듈의 원칙 그대로다. 남지 않은 형태는 등재 시 별칭이 되므로 버려지지 않는다.
 */
export function foldLengthVariants(
  counts: { candidate: string; total: number }[]
): { candidate: string; total: number }[] {
  const compact = (s: string) => s.replace(/\s+/g, "")
  const kept: { candidate: string; total: number }[] = []
  for (const c of [...counts].sort((a, b) => b.total - a.total)) {
    const n = compact(c.candidate)
    const isVariant = kept.some((k) => {
      const kn = compact(k.candidate)
      return kn.includes(n) || n.includes(kn)
    })
    if (!isVariant) kept.push(c)
  }
  return kept
}

export function pickWinner(counts: { candidate: string; total: number }[]): SpellingVerdict {
  const sorted = [...counts].sort((a, b) => b.total - a.total)
  // 판정은 접힌 목록으로, **근거(counts)는 원본 그대로** 남긴다 — 사전 notes 에
  // 실제로 무엇을 얼마로 비교했는지가 남아야 나중에 판정을 재검토할 수 있다.
  const folded = foldLengthVariants(sorted)
  const top = folded[0]
  const second = folded[1]
  if (!top || top.total < MIN_TOTAL) {
    return { winner: null, counts: sorted, reason: "검색량 부족 — 사람 검수" }
  }
  if (second && second.total > 0 && top.total < second.total * MIN_RATIO) {
    return { winner: null, counts: sorted, reason: "표기 경합 — 사람 검수" }
  }
  return { winner: top.candidate, counts: sorted, reason: `네이버 ${top.total}건 우세` }
}
