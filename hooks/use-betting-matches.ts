import { useState, useEffect, useCallback, useMemo } from "react"
import useSWR from "swr"
import { getMsUntilReset } from "@/lib/betman/daily-round"
import type { TodayInfo, GroupedMatch } from "@/components/betting/betting-types"
import { fetcher } from "@/lib/swr"

export function useBettingMatches(eventSlug?: string) {
  const [sportFilter, setSportFilterRaw] = useState<"all" | "축구" | "야구" | "농구" | "배구">(
    "all"
  )
  const [leagueFilter, setLeagueFilter] = useState<"all" | string>("all")
  const [currentTime, setCurrentTime] = useState(() => new Date())

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
  })

  // Derive values directly from SWR data
  const todayInfo: TodayInfo | null = gamesData?.today ?? null
  // useMemo로 안정 reference — `?? []` fallback이 매 렌더마다 새 배열 만들면
  // 아래 useMemo들의 deps가 항상 변경된 것으로 평가됨.
  const groupedMatches = useMemo<GroupedMatch[]>(() => gamesData?.groupedGames ?? [], [gamesData])
  const earliestBetClose: string | null = gamesData?.earliestBetClose ?? null
  // 프로토 발매 시간 상태 (08:00~23:00 KST 밖이면 isOpen=false — 라인업 미리보기만)
  const bettingWindow: { isOpen: boolean; message: string; nextOpenAt?: string } | null =
    gamesData?.bettingWindow ?? null
  const error: string | null = gamesError ? "경기 데이터를 불러오는데 실패했습니다." : null
  const lastUpdated: Date | null = useMemo(() => (gamesData ? new Date() : null), [gamesData])

  const isLoading = gamesLoading || (gamesValidating && !gamesData)

  const loadMatches = useCallback(() => {
    mutateGames()
  }, [mutateGames])

  // 30-second clock tick for filtering expired matches
  useEffect(() => {
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
      if (m.sport === sportFilter && new Date(m.matchTime) > currentTime) {
        leagues.add(m.leagueCode)
      }
    }
    return Array.from(leagues).sort()
  }, [groupedMatches, sportFilter, currentTime])

  const filteredMatches = useMemo(() => {
    return (
      groupedMatches
        .filter((m) => new Date(m.matchTime) > currentTime)
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
    bettingWindow,
    groupedMatches,
    filteredMatches,
    isLoading,
    error,
    lastUpdated,
    deadlineCountdown,
    loadMatches,
  }
}
