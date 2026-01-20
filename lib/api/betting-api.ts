import type {
  Bet365UpcomingResponse,
  Bet365PrematchOddsResponse,
  Bet365ResultResponse,
  Match,
  SportType,
} from "./types"

// ===== 더미 데이터 =====

// 예정된 경기 더미 데이터
const dummyUpcoming: Bet365UpcomingResponse = {
  success: 1,
  pager: { page: 1, per_page: 50, total: 10 },
  results: [
    {
      id: "1001",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 5), // 5시간 후
      time_status: "0",
      league: { id: "1", name: "EPL", cc: "gb" },
      home: { id: "101", name: "맨체스터 시티" },
      away: { id: "102", name: "리버풀" },
      ss: null,
    },
    {
      id: "1002",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 8), // 8시간 후
      time_status: "0",
      league: { id: "2", name: "라리가", cc: "es" },
      home: { id: "201", name: "바르셀로나" },
      away: { id: "202", name: "레알 마드리드" },
      ss: null,
    },
    {
      id: "1003",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 3), // 3시간 후
      time_status: "0",
      league: { id: "3", name: "K리그", cc: "kr" },
      home: { id: "301", name: "전북 현대" },
      away: { id: "302", name: "울산 현대" },
      ss: null,
    },
    {
      id: "2001",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 4), // 4시간 후
      time_status: "0",
      league: { id: "10", name: "KBO", cc: "kr" },
      home: { id: "401", name: "두산 베어스" },
      away: { id: "402", name: "LG 트윈스" },
      ss: null,
    },
    {
      id: "2002",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 6), // 6시간 후
      time_status: "0",
      league: { id: "11", name: "MLB", cc: "us" },
      home: { id: "501", name: "LA 다저스" },
      away: { id: "502", name: "뉴욕 양키스" },
      ss: null,
    },
    {
      id: "3001",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 10), // 10시간 후
      time_status: "0",
      league: { id: "20", name: "NBA", cc: "us" },
      home: { id: "601", name: "LA 레이커스" },
      away: { id: "602", name: "골든스테이트" },
      ss: null,
    },
    {
      id: "3002",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 7), // 7시간 후
      time_status: "0",
      league: { id: "21", name: "KBL", cc: "kr" },
      home: { id: "701", name: "서울 삼성" },
      away: { id: "702", name: "울산 현대모비스" },
      ss: null,
    },
    {
      id: "4001",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 2), // 2시간 후
      time_status: "0",
      league: { id: "30", name: "V리그", cc: "kr" },
      home: { id: "801", name: "대한항공" },
      away: { id: "802", name: "삼성화재" },
      ss: null,
    },
    {
      id: "4002",
      time: String(Math.floor(Date.now() / 1000) + 3600 * 9), // 9시간 후
      time_status: "0",
      league: { id: "31", name: "V리그 여자", cc: "kr" },
      home: { id: "901", name: "현대건설" },
      away: { id: "902", name: "GS칼텍스" },
      ss: null,
    },
  ],
}

// 배당률 더미 데이터
const dummyOdds: Bet365PrematchOddsResponse = {
  success: 1,
  results: [
    {
      FI: "90001",
      event_id: "1001",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "2.60", name: "1" },
              { id: "2", odds: "3.05", name: "Draw" },
              { id: "3", odds: "2.16", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90002",
      event_id: "1002",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "2.10", name: "1" },
              { id: "2", odds: "3.40", name: "Draw" },
              { id: "3", odds: "3.20", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90003",
      event_id: "1003",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "2.30", name: "1" },
              { id: "2", odds: "3.10", name: "Draw" },
              { id: "3", odds: "2.80", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90004",
      event_id: "2001",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "1.85", name: "1" },
              { id: "3", odds: "1.95", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90005",
      event_id: "2002",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "1.70", name: "1" },
              { id: "3", odds: "2.10", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90006",
      event_id: "3001",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "1.75", name: "1" },
              { id: "3", odds: "2.05", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90007",
      event_id: "3002",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "1.90", name: "1" },
              { id: "3", odds: "1.90", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90008",
      event_id: "4001",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "1.65", name: "1" },
              { id: "3", odds: "2.25", name: "2" },
            ],
          },
        },
      },
    },
    {
      FI: "90009",
      event_id: "4002",
      main: {
        updated_at: String(Date.now()),
        sp: {
          full_time_result: {
            id: "40",
            name: "Full Time Result",
            odds: [
              { id: "1", odds: "1.55", name: "1" },
              { id: "3", odds: "2.35", name: "2" },
            ],
          },
        },
      },
    },
  ],
}

// 경기 결과 더미 데이터
const dummyResults: Bet365ResultResponse = {
  success: 1,
  results: [
    {
      id: "9001",
      time: String(Math.floor(Date.now() / 1000) - 3600 * 24), // 24시간 전
      time_status: "3",
      league: { id: "1", name: "EPL", cc: "gb" },
      home: { id: "103", name: "첼시" },
      away: { id: "104", name: "아스날" },
      ss: "2-1",
      scores: {
        "1": { home: "1", away: "0" },
        "2": { home: "1", away: "1" },
      },
    },
  ],
}

// ===== 리그 → 종목 매핑 =====
const leagueToSport: Record<string, SportType> = {
  // 축구
  EPL: "soccer",
  라리가: "soccer",
  "K리그": "soccer",
  분데스리가: "soccer",
  세리에A: "soccer",
  리그앙: "soccer",
  "UEFA Champions League": "soccer",

  // 야구
  KBO: "soccer", // 야구지만 테스트용
  MLB: "baseball",

  // 농구
  NBA: "basketball",
  KBL: "basketball",

  // 배구
  "V리그": "volleyball",
  "V리그 여자": "volleyball",
}

// 리그 이름으로 종목 판별
function getSportFromLeague(leagueName: string): SportType {
  // 직접 매핑 확인
  if (leagueToSport[leagueName]) {
    return leagueToSport[leagueName]
  }

  // 키워드 기반 판별
  const lowerName = leagueName.toLowerCase()

  if (
    lowerName.includes("baseball") ||
    lowerName.includes("mlb") ||
    lowerName.includes("kbo") ||
    lowerName.includes("npb")
  ) {
    return "baseball"
  }

  if (
    lowerName.includes("basketball") ||
    lowerName.includes("nba") ||
    lowerName.includes("kbl") ||
    lowerName.includes("euroleague")
  ) {
    return "basketball"
  }

  if (
    lowerName.includes("volleyball") ||
    lowerName.includes("v-league") ||
    lowerName.includes("v리그")
  ) {
    return "volleyball"
  }

  // 기본값은 축구
  return "soccer"
}

// Unix timestamp를 날짜/시간 문자열로 변환
function formatTimestamp(timestamp: string): { date: string; time: string } {
  const date = new Date(parseInt(timestamp) * 1000)

  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  return {
    date: `${month}.${day}`,
    time: `${hours}:${minutes}`,
  }
}

// ===== API 함수 =====

/**
 * 예정된 경기 목록을 가져옵니다.
 * @param sport 종목 필터 (선택사항)
 */
export async function fetchUpcomingMatches(
  sport?: SportType
): Promise<Bet365UpcomingResponse> {
  // TODO: 실제 API 호출로 교체
  // const response = await fetch(`${API_BASE_URL}/upcoming?sport=${sport}`)
  // return response.json()

  // 더미 데이터 반환 (개발용)
  await new Promise((resolve) => setTimeout(resolve, 300)) // 네트워크 지연 시뮬레이션

  if (sport) {
    const filtered = dummyUpcoming.results.filter((match) => {
      const matchSport = getSportFromLeague(match.league.name)
      return matchSport === sport
    })
    return { ...dummyUpcoming, results: filtered }
  }

  return dummyUpcoming
}

/**
 * 배당률 정보를 가져옵니다.
 * @param eventIds 경기 ID 배열
 */
export async function fetchPrematchOdds(
  eventIds: string[]
): Promise<Bet365PrematchOddsResponse> {
  // TODO: 실제 API 호출로 교체
  // const response = await fetch(`${API_BASE_URL}/odds?events=${eventIds.join(',')}`)
  // return response.json()

  // 더미 데이터 반환 (개발용)
  await new Promise((resolve) => setTimeout(resolve, 200))

  const filtered = dummyOdds.results.filter((odds) =>
    eventIds.includes(odds.event_id)
  )
  return { ...dummyOdds, results: filtered }
}

/**
 * 경기 결과를 가져옵니다.
 * @param eventIds 경기 ID 배열
 */
export async function fetchResults(
  eventIds: string[]
): Promise<Bet365ResultResponse> {
  // TODO: 실제 API 호출로 교체

  await new Promise((resolve) => setTimeout(resolve, 200))

  const filtered = dummyResults.results.filter((result) =>
    eventIds.includes(result.id)
  )
  return { ...dummyResults, results: filtered }
}

/**
 * 경기 목록과 배당률을 통합하여 Match 형식으로 반환합니다.
 * @param sport 종목 필터 (선택사항)
 */
export async function fetchMatchesWithOdds(sport?: SportType): Promise<Match[]> {
  // 1. 예정된 경기 가져오기
  const upcomingResponse = await fetchUpcomingMatches(sport)
  const matches = upcomingResponse.results

  if (matches.length === 0) {
    return []
  }

  // 2. 경기 ID 목록 추출
  const eventIds = matches.map((m) => m.id)

  // 3. 배당률 가져오기
  const oddsResponse = await fetchPrematchOdds(eventIds)
  const oddsMap = new Map(oddsResponse.results.map((o) => [o.event_id, o]))

  // 4. 데이터 통합 및 변환
  const result: Match[] = matches.map((match) => {
    const odds = oddsMap.get(match.id)
    const fullTimeResult = odds?.main?.sp?.full_time_result?.odds || []

    // 배당률 추출
    const homeOddsItem = fullTimeResult.find((o) => o.name === "1")
    const drawOddsItem = fullTimeResult.find((o) => o.name === "Draw")
    const awayOddsItem = fullTimeResult.find((o) => o.name === "2")

    const { date, time } = formatTimestamp(match.time)
    const matchSport = getSportFromLeague(match.league.name)

    return {
      id: match.id,
      sport: matchSport,
      league: match.league.name,
      home: match.home.name,
      away: match.away.name,
      date,
      time,
      homeOdds: homeOddsItem ? parseFloat(homeOddsItem.odds) : 0,
      drawOdds: drawOddsItem ? parseFloat(drawOddsItem.odds) : 0,
      awayOdds: awayOddsItem ? parseFloat(awayOddsItem.odds) : 0,
      status: match.time_status === "0" ? "upcoming" : match.time_status === "1" ? "live" : "finished",
      score: match.ss || undefined,
    }
  })

  return result
}

// 종목별 필터링 함수
export function filterMatchesBySport(matches: Match[], sport: SportType | "all"): Match[] {
  if (sport === "all") return matches
  return matches.filter((m) => m.sport === sport)
}

