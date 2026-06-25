import { useMemo } from "react"
import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"
import { fetcher } from "@/lib/swr"
import type { MyStatsData, PredictionHistoryItem, PredictionMatch } from "@/types/betting"

interface RawSlip {
  id: string
  date: string
  sport: string
  stake: number
  totalOdds: number
  status: string
  profit: number
  matches: PredictionMatch[]
}

function formatSlipDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toHistoryItem(slip: RawSlip): PredictionHistoryItem {
  return {
    id: slip.id,
    date: formatSlipDate(slip.date),
    isoDate: slip.date,
    sport: slip.sport,
    matches: slip.matches,
    totalOdds: slip.totalOdds,
    stake: slip.stake,
    status: slip.status,
    profit: slip.profit,
  }
}

/**
 * 마이페이지 탭별 데이터 로드 (SWR 기반).
 *
 * 탭이 활성화되면 SWR이 해당 키로 fetch; 비활성화 시 key = null 로 요청 차단.
 * SWR 캐싱(dedupingInterval 30s)으로 탭 전환 왕복 시 중복 fetch 방지.
 */
export function useBettingMyPage(
  active: boolean,
  myPageTab: "predictions" | "stats" | "gold" | "profile"
) {
  const { isSignedIn } = useAuth()

  const statsKey = isSignedIn && active && myPageTab === "stats" ? "/api/sports/my-stats" : null
  const historyKey =
    isSignedIn && active && myPageTab === "predictions" ? "/api/sports/prediction?status=all" : null

  const { data: statsData, isLoading: isLoadingMyStats } = useSWR<MyStatsData>(statsKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const { data: historyData, isLoading: isLoadingHistory } = useSWR<{ slips: RawSlip[] }>(
    historyKey,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  )

  const predictionHistory = useMemo(
    () => (historyData?.slips ?? []).map(toHistoryItem),
    [historyData]
  )

  return {
    myStats: statsData ?? null,
    isLoadingMyStats,
    predictionHistory,
    isLoadingHistory,
  }
}
