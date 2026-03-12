import { useState, useEffect, useCallback, useMemo } from "react"
import useSWR from "swr"
import { getMsUntilReset } from "@/lib/betman/daily-round"
import type { TodayInfo, GroupedMatch } from "@/components/betting/betting-types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useBettingMatches() {
  const [sportFilter, setSportFilterRaw] = useState<"all" | "축구" | "야구" | "농구" | "배구">(
    "all"
  )
  const [leagueFilter, setLeagueFilter] = useState<"all" | string>("all")
  const [currentTime, setCurrentTime] = useState(() => new Date())

  const [todayInfo, setTodayInfo] = useState<TodayInfo | null>(null)
  const [groupedMatches, setGroupedMatches] = useState<GroupedMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [deadlineCountdown, setDeadlineCountdown] = useState<string | null>(null)
  const [earliestBetClose, setEarliestBetClose] = useState<string | null>(null)

  const setSportFilter = useCallback((filter: "all" | "축구" | "야구" | "농구" | "배구") => {
    setSportFilterRaw(filter)
    setLeagueFilter("all")
  }, [])

  // SWR for games data
  const gamesKey = `/api/betman/games?${sportFilter !== "all" ? `sport=${sportFilter}` : ""}`
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

  // Sync SWR data to state
  useEffect(() => {
    if (!gamesData) return
    if (gamesData.today) setTodayInfo(gamesData.today)
    if (gamesData.groupedGames) setGroupedMatches(gamesData.groupedGames)
    setEarliestBetClose(gamesData.earliestBetClose || null)
    setLastUpdated(new Date())
  }, [gamesData])

  useEffect(() => {
    if (gamesError) setError("경기 데이터를 불러오는데 실패했습니다.")
    else setError(null)
  }, [gamesError])

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
    return groupedMatches
      .filter((m) => new Date(m.matchTime) > currentTime)
      .filter((m) => sportFilter === "all" || m.sport === sportFilter)
      .filter((m) => leagueFilter === "all" || m.leagueCode === leagueFilter)
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
