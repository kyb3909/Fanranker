/**
 * 날짜 레일 — 사가 지면 공용 (시즌 문서 · 사가 목록 · 이적설 사가).
 *
 * 2026-08-29 운영자 판정 "안 B(헤어라인)". 세 지면의 목록이 같은 문법을 쓴다:
 *
 *   왼쪽 레일에 날짜를 하루 한 번  |  오른쪽에 [칩] 제목 / 메타 한 줄
 *   카드 껍데기·그림자 없음. 경계는 1px 선만.
 *
 * ⚠️ 이걸 한 파일에 둔 이유. 같은 레일을 세 벌 만들면 반드시 갈라진다 — 등급 칩이
 *    실록과 이적 사가 상세에서 다른 색이 됐던 게 정확히 그 사고였다
 *    (components/saga/tier-chip 주석 참고). 날짜 포맷·레일 폭·물리는 높이는 여기가 정본.
 */

/** 레일 폭. 모바일 62 / 데스크톱 92 — "8.29" 20px 이 들어가는 최소치 */
export const RAIL_GRID = "grid grid-cols-[62px_1fr] sm:grid-cols-[92px_1fr]"

/**
 * 날짜가 물리는 높이. 사이트 헤더가 sticky 이고 실측 94~96px 이다
 * (2026-08-29 측정: 모바일 94, 데스크톱 96). 8px 여유를 둔다.
 * 헤더 높이 토큰이 아직 없어서 상수로 둔다 — 헤더를 고치면 여기도 같이 봐야 한다.
 */
export const RAIL_STICKY_TOP = 104

/** 레일 오른쪽 본문의 경계 — 세로 레일선 + 항목 구분선 */
export const RAIL_BODY_BORDER: React.CSSProperties = {
  borderLeft: "1px solid var(--wc-line-2)",
  borderBottom: "1px solid var(--wc-line)",
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const

function kst(iso: string): Date {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
}

/** 레일용 "8.3" — 숫자와 점만이라 .gn-num(라틴 전용) 을 안전하게 걸 수 있다 */
export function kstShortDate(iso: string): string {
  const d = kst(iso)
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`
}

/** 요일은 한글이므로 .gn-num 을 걸지 않는다 (걸면 폴백으로 떨어진다) */
export function kstWeekday(iso: string): string {
  return WEEKDAYS[kst(iso).getUTCDay()]
}

/** 하루 묶음의 키 — "8월 3일" */
export function kstDayKey(iso: string): string {
  const d = kst(iso)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

export interface DayGroup<T> {
  key: string
  iso: string
  items: T[]
}

/**
 * 하루 = 한 덩어리.
 *
 * 항목 하나가 그리드 한 줄이면 날짜가 자기 줄 안에 갇혀서 **물릴 수가 없다**.
 * 하루치를 한 그리드 행으로 묶어야 날짜 셀이 그 날 분량만큼 따라 내려온다.
 * ⚠️ 입력이 날짜순으로 정렬돼 있어야 한다 (오름/내림 무관, 섞이면 안 된다).
 */
export function groupByDay<T>(items: T[], getIso: (item: T) => string): DayGroup<T>[] {
  const days: DayGroup<T>[] = []
  for (const item of items) {
    const iso = getIso(item)
    const key = kstDayKey(iso)
    const last = days[days.length - 1]
    if (last && last.key === key) last.items.push(item)
    else days.push({ key, iso, items: [item] })
  }
  return days
}

/** 레일 왼쪽 칸 — 그 날 분량이 다 지나갈 때까지 붙어 있는다 */
export function RailDate({ iso }: { iso: string }) {
  return (
    <div className="pr-3">
      <div className="sticky pt-3" style={{ top: RAIL_STICKY_TOP }}>
        <p className="gn-num text-[20px] leading-none font-bold" style={{ color: "var(--wc-ink)" }}>
          {kstShortDate(iso)}
        </p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
          {kstWeekday(iso)}
        </p>
      </div>
    </div>
  )
}
