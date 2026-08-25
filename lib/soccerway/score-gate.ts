/**
 * 경기 리포트 스코어 게이트 (2026-08-25 실사고).
 *
 * ⚠️ Supabase 를 끌어오지 않는 **순수 모듈**이다 — match-extras.ts 안에 두면 테스트가
 *    env 없이 못 돈다 (day-freshness·nickname-match 때와 같은 이유).
 *
 * ## 왜 필요한가
 * 같은 경기(풀럼 2-3 첼시)를 세 번 생성했더니 제목이 갈렸다:
 *   1차 "3-2 첼시 승"  2차 "3-2 첼시 승"  3차 **"3-3 무승부"**
 * 세 번째는 **승패 자체가 틀린** 리포트인데 검증을 통과했다. 숫자 게이트가 개별
 * 숫자("3"이 근거에 있나)만 보고 **조합**은 안 봤기 때문이다.
 *
 * 근본 원인은 스코어의 출처였다 — LLM 이 기사 본문에서 뽑은 값을 그대로 믿었다.
 * 우리 DB(betman)에 확정 스코어가 있는데도. 이제 DB 가 정본이고, 이 함수가 마지막 문이다.
 */

export interface ReportLike {
  title: string
  paragraphs: string[]
}

/**
 * 리포트에 적힌 스코어가 확정 스코어와 어긋나면 사유 문자열, 아니면 null.
 *
 * ⚠️ 뒤집힌 형태(3-2 ↔ 2-3)는 **허용**한다. 기사가 원정팀 기준으로 쓰는 건 흔하고
 *    승패가 같으므로 사실 오류가 아니다. 막으려는 건 3-3 처럼 **승패가 뒤집히는** 조합이다.
 * ⚠️ 분 표기("전반 41분")나 xG 소수는 하이픈으로 이어지지 않아 걸리지 않는다.
 */
export function wrongScore(report: ReportLike, finalScore: string): string | null {
  const m = finalScore.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!m) return null // 확정 스코어 형식이 깨졌으면 판단하지 않는다
  const [, h, a] = m
  const ok = new Set([`${h}-${a}`, `${a}-${h}`])

  // ⚠️ **제목만** 본다. 본문은 "전반은 1-1 이었다" 처럼 중간 스코어를 쓸 수 있고 그건
  //    사실이다 — 본문까지 막으면 정상 리포트를 죽인다(오탐). 독자가 승패를 읽는 자리는
  //    제목이고, 실사고("3-3 무승부")도 제목에서 났다. 좁게 막는다.
  const found = report.title.match(/\b\d{1,2}\s?[-:]\s?\d{1,2}\b/g) ?? []
  for (const f of found) {
    const norm = f.replace(/\s/g, "").replace(":", "-")
    if (!ok.has(norm)) return `제목 스코어 불일치: "${f}" vs 확정 ${finalScore}`
  }
  return null
}
