import { useState, useEffect, useCallback, useMemo } from "react"
import useSWR from "swr"
import { getMsUntilReset } from "@/lib/betman/daily-round"
import type { TodayInfo, GroupedMatch } from "@/types/betting"
import { fetcher } from "@/lib/swr"

export function useBettingMatches(
  eventSlug?: string,
  options?: {
    /**
     * SSR 프리페치된 경기 데이터 (홈/prediction page.tsx) — 첫 HTML 부터 경기 카드를
     * 렌더해 "빈 스켈레톤 39개" 첫인상을 없앤다 (2026-07-30 워룸). 필터 기본값
     * (전체 종목·비이벤트) 키에만 적용 — 필터를 바꾸면 평소처럼 클라 fetch.
     */
    initialGames?: unknown | null
  }
) {
  // 당분간 축구만 노출 (운영자 2026-08-14) — 농구 전면 비노출·시즌 이벤트 집중과 같은 선.
  // 되돌리려면 "all" 로 바꾸고 types/betting SPORT_TABS 를 복원하면 된다.
  const [sportFilter, setSportFilterRaw] = useState<"all" | "축구" | "야구" | "농구" | "배구">(
    "축구"
  )
  const [leagueFilter, setLeagueFilter] = useState<"all" | string>("all")
  /**
   * ⚠️⚠️ **하이드레이션 #418 의 진짜 원인이었다** (2026-08-25, 앞선 판단 정정).
   *
   * 처음엔 "화면에 찍히는 값이 아니라 만료 경기를 걸러내는 필터일 뿐이고, 서버·클라이언트
   * 시각차는 보통 수 초라 같은 목록이 나온다" 고 보고 일부러 남겼다. **그 전제가 틀렸다.**
   *
   * SSR HTML 은 캐시된다 — 즉 서버가 그린 시각은 방문자가 하이드레이트하는 시각보다
   * **몇 시간 앞설 수 있다.** 프로덕션 실측(15:56 KST 방문):
   *     서버 HTML  : 09:30 · 10:30 · 16:45 · 18:00 …  (그릴 당시엔 미래였던 경기)
   *     클라이언트 : 18:30 · 19:30 · 익일 01:45 …
   * 목록 자체가 달라졌고, 그래서 캐시가 더워진 뒤의 **모든 방문**에서 에러가 났다.
   * "드문 경계 사고" 가 아니라 상시 사고였다.
   *
   * 그래서 **마운트 전에는 거르지 않는다**(null = 필터 없음). 서버와 첫 클라이언트 렌더가
   * 같은 목록을 그리고, 마운트 후 실제 시각으로 걸러낸다.
   * ⚠️ 대가로 이미 시작한 경기가 한 순간 보였다 사라질 수 있다. 하이드레이션 실패보다는
   *    훨씬 가벼운 값이다 — 후자는 그 아래 인터랙션 전체를 망가뜨린다.
   */
  const [currentTime, setCurrentTime] = useState<Date | null>(null)

  const [deadlineCountdown, setDeadlineCountdown] = useState<string | null>(null)

  const setSportFilter = useCallback((filter: "all" | "축구" | "야구" | "농구" | "배구") => {
    setSportFilterRaw(filter)
    setLeagueFilter("all")
  }, [])

  // SWR for games data — 이벤트 모드면 ?event=<slug> 추가 (해당 이벤트 경기만 반환)
  const sportParam = sportFilter !== "all" ? `sport=${sportFilter}` : ""
  const eventParam = eventSlug ? `event=${encodeURIComponent(eventSlug)}` : ""
  const gamesKey = `/api/sports/games?${[sportParam, eventParam].filter(Boolean).join("&")}`
  const {
    data: gamesData,
    error: gamesError,
    isLoading: gamesLoading,
    isValidating: gamesValidating,
    mutate: mutateGames,
  } = useSWR(gamesKey, fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
    // fallbackData 는 훅 인스턴스의 모든 키에 적용되므로, 필터 기본 상태에서만 —
    // 종목 필터 키에 전체 데이터가 폴백으로 잘못 비치는 걸 막는다.
    // SSR 프리페치도 축구 키로 받는다 (page.tsx 가 ?sport=축구 로 가져옴) — 기본 필터가
    // 축구로 바뀌었으므로 "all" 조건을 그대로 두면 폴백이 영영 안 붙어 스켈레톤이 돌아온다.
    fallbackData:
      sportFilter === "축구" && !eventSlug ? (options?.initialGames ?? undefined) : undefined,
  })

  // Derive values directly from SWR data
  const todayInfo: TodayInfo | null = gamesData?.today ?? null
  // useMemo로 안정 reference — `?? []` fallback이 매 렌더마다 새 배열 만들면
  // 아래 useMemo들의 deps가 항상 변경된 것으로 평가됨.
  const groupedMatches = useMemo<GroupedMatch[]>(() => gamesData?.groupedGames ?? [], [gamesData])
  const earliestBetClose: string | null = gamesData?.earliestBetClose ?? null
  const error: string | null = gamesError ? "경기 데이터를 불러오는데 실패했습니다." : null
  /**
   * ⚠️ **렌더 중에 `new Date()` 를 부르지 않는다** (2026-08-25 하이드레이션 #418).
   *
   * 종전엔 `useMemo(() => gamesData ? new Date() : null, [gamesData])` 였다. useMemo 는
   * 렌더 중에 실행되므로 서버가 찍은 시각과 브라우저가 찍은 시각이 **다른 문자열**이 되고,
   * 그대로 화면에 출력돼 텍스트 불일치(#418)가 났다. 프로덕션 콘솔에 상주하던 그 에러다.
   *
   * effect 로 옮기면 서버·첫 클라이언트 렌더가 둘 다 null 로 **일치**하고, 마운트 후에만
   * 값이 채워진다. "마지막으로 데이터를 받은 시각" 이라는 의미에도 이쪽이 맞다.
   */
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  useEffect(() => {
    if (gamesData) setLastUpdated(new Date())
  }, [gamesData])

  const isLoading = gamesLoading || (gamesValidating && !gamesData)

  const loadMatches = useCallback(() => {
    mutateGames()
  }, [mutateGames])

  // 30-second clock tick for filtering expired matches
  useEffect(() => {
    // ⚠️ **마운트 직후 즉시 한 번** 채운다. 인터벌만 두면 첫 30초 동안 currentTime 이
    //    null 이라 만료 경기가 그대로 보인다 — 하이드레이션은 맞지만 화면이 틀린다.
    setCurrentTime(new Date())
    const t = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  // Deadline countdown timer
  useEffect(() => {
    if (!earliestBetClose) {
      setDeadlineCountdown(null)
      return
    }
    const updateCountdown = () => {
      const now = new Date()
      const close = new Date(earliestBetClose)
      const diff = close.getTime() - now.getTime()
      if (diff <= 0) {
        setDeadlineCountdown("마감됨")
        return
      }
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      if (hours > 0) setDeadlineCountdown(`${hours}시간 ${minutes}분`)
      else if (minutes > 0) setDeadlineCountdown(`${minutes}분 ${seconds}초`)
      else setDeadlineCountdown(`${seconds}초`)
    }
    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [earliestBetClose])

  // Daily reset at 23:00 KST
  useEffect(() => {
    const timerId = setTimeout(() => {
      loadMatches()
      window.dispatchEvent(new CustomEvent("dailyRoundReset"))
    }, getMsUntilReset())
    return () => clearTimeout(timerId)
  }, [loadMatches])

  // Computed
  const availableLeagues = useMemo(() => {
    if (sportFilter === "all") return []
    const leagues = new Set<string>()
    for (const m of groupedMatches) {
      // currentTime 이 null(마운트 전)이면 거르지 않는다 — 서버와 같은 목록을 그린다
      if (m.sport === sportFilter && (!currentTime || new Date(m.matchTime) > currentTime)) {
        leagues.add(m.leagueCode)
      }
    }
    return Array.from(leagues).sort()
  }, [groupedMatches, sportFilter, currentTime])

  const filteredMatches = useMemo(() => {
    return (
      groupedMatches
        // 마운트 전(null)에는 만료 필터를 걸지 않는다 — 위 currentTime 주석 참조
        .filter((m) => !currentTime || new Date(m.matchTime) > currentTime)
        .filter((m) => sportFilter === "all" || m.sport === sportFilter)
        .filter((m) => leagueFilter === "all" || m.leagueCode === leagueFilter)
        // betman 다음 라운드 preview placeholder 숨김 (팀 미정/빈 이름)
        .filter((m) => m.homeTeam && m.awayTeam && m.homeTeam !== "미정" && m.awayTeam !== "미정")
    )
  }, [groupedMatches, sportFilter, leagueFilter, currentTime])

  return {
    sportFilter,
    setSportFilter,
    leagueFilter,
    setLeagueFilter,
    availableLeagues,
    todayInfo,
    groupedMatches,
    filteredMatches,
    isLoading,
    error,
    lastUpdated,
    deadlineCountdown,
    loadMatches,
  }
}
