/**
 * live-football-api `lineups` 응답 → 우리 모양 (2026-08-31 운영자 제보:
 * "첼시 경기에 교체 선수 기록이 하나도 없고 MoTM 후보에서도 빠져 있다").
 *
 * ## 왜 이 파일이 따로 있나
 * 원인은 로직이 아니라 **필드 이름 오독**이었다. LFA 는 벤치를 `subs` 로 주는데
 * 코드가 `substitutes ?? bench` 를 읽었다 — 없는 필드라 조용히 `[]` 가 됐고,
 * LFA 폴백으로 채워진 라인업은 **전부** 벤치 0 명으로 저장됐다 (실측: 최근 14일
 * 저장분 329건 중 148건). 벤치가 비면 교체 투입 표기가 붙을 자리가 없고,
 * MoTM 후보(= 선발 + 투입된 벤치)에서 교체 선수가 통째로 사라진다.
 *
 * 이런 오독은 타입이 잡아주지 않는다 — 선택적 필드를 읽으면 `undefined` 가 나올 뿐
 * 에러가 없다. 그래서 매핑만 떼어 순수 함수로 두고 **실제 응답 픽스처**로 시험한다.
 * DB·캐시·server-only 의존이 없어야 시험이 그대로 부를 수 있다.
 */

export interface LfaRawPlayer {
  id?: string
  name?: string
  number?: number | string | null
}

export interface LfaSideShape {
  /** "3-4-2-1" — 표시용 문자열. 판독 불가면 null */
  formation: string | null
  starting: LfaRawPlayer[]
  subs: LfaRawPlayer[]
}

export interface LfaLineupsShape {
  home: LfaSideShape
  away: LfaSideShape
  /**
   * 예상 라인업인가 (`is_projected`). LFA 는 킥오프 몇 시간 전부터 **예상 XI** 를 주고,
   * 발표되면 같은 자리를 확정 XI 로 바꾼다. 이 플래그를 안 보면 예상을 확정으로 저장하게
   * 되는데, 저장분은 다시 안 읽으므로 **영구히 틀린 선발**이 된다 (2026-08-31 첼시:브라이턴
   * 실사고 — 저장분은 리스 제임스 선발, 실제로는 68분 교체 투입이었다).
   */
  projected: boolean
}

/**
 * 포메이션 — LFA 는 **숫자**로 준다 (3421). 최상위 `formation: {home, away}` 에 있고
 * 팀 객체 안에는 없다.
 *
 * 자릿수를 그대로 펴되 **합이 10(필드 플레이어 수)일 때만** 채택한다. 그게 아니면
 * 우리가 뜻을 모르는 값이므로 null — 화면(`parseFormation`)이 엉뚱한 줄 수로
 * 선수를 배치하느니 포메이션을 안 보여주는 편이 낫다.
 */
export function formationText(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  if (s.includes("-")) return /^\d(-\d){2,4}$/.test(s) ? s : null
  if (!/^\d{3,5}$/.test(s)) return null
  const digits = [...s].map(Number)
  if (digits.some((d) => d < 1)) return null
  if (digits.reduce((a, b) => a + b, 0) !== 10) return null
  return digits.join("-")
}

function asPlayers(v: unknown): LfaRawPlayer[] {
  return Array.isArray(v) ? (v as LfaRawPlayer[]) : []
}

interface RawSide {
  starting?: unknown
  subs?: unknown
  /** 예전 코드가 기대하던 이름들 — 피드가 바뀌어도 견디게 폴백으로 남긴다 */
  substitutes?: unknown
  bench?: unknown
  formation?: unknown
}

/**
 * 응답 → {home, away}. 양 팀 선발이 모두 있어야 라인업으로 인정한다.
 * (한쪽만 있는 반쪽 응답을 통과시키면 빈 껍데기가 저장돼 영구히 굳는다.)
 */
export function normalizeLfaLineups(json: unknown): LfaLineupsShape | null {
  const d = json as
    | {
        home?: RawSide
        away?: RawSide
        formation?: { home?: unknown; away?: unknown }
        is_projected?: unknown
      }
    | null
    | undefined
  if (!d?.home || !d?.away) return null

  const side = (s: RawSide, top: unknown): LfaSideShape => ({
    // 최상위가 정본, 팀 객체 안의 값은 폴백
    formation: formationText(top) ?? formationText(s.formation),
    starting: asPlayers(s.starting),
    // ⚠️ 벤치는 `subs` 다 (실측). 나머지는 피드 변형 대비 폴백 — 순서를 바꾸지 말 것.
    subs: asPlayers(s.subs ?? s.substitutes ?? s.bench),
  })

  const home = side(d.home, d.formation?.home)
  const away = side(d.away, d.formation?.away)
  if (home.starting.length === 0 || away.starting.length === 0) return null
  // ⚠️ 값이 없으면 **예상으로 본다**. 확정이라는 증거가 없는데 확정으로 저장하면
  //    그 틀린 명단이 영구히 굳는다 — 모르는 쪽으로 기우는 편이 싸다.
  return { home, away, projected: d.is_projected !== false }
}
