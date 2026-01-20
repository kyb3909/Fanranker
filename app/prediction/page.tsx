import { createServerAnonClient } from "@/lib/supabase"
import { PredictionContent } from "@/components/prediction-content"
import { auth } from "@clerk/nextjs/server"

// Raw match data from Supabase (arrays for joined tables)
interface RawMatchData {
  id: string
  match_time: string
  sport_type: string
  time_status: number
  score_home: number | null
  score_away: number | null
  is_prediction_open: boolean | null
  prediction_count: number | null
  home_team: {
    id: string
    name: string
    name_ko: string | null
    logo_url: string | null
  }[]
  away_team: {
    id: string
    name: string
    name_ko: string | null
    logo_url: string | null
  }[]
  league: {
    id: string
    name: string
    name_ko: string | null
    sport_type: string
    country_code: string | null
  }[]
  match_odds: {
    full_time_result: any
    goals_over_under: any
    both_teams_to_score: any
  }[]
}

// Match with joined data type (transformed)
interface MatchWithDetails {
  id: string
  match_time: string
  sport_type: string
  time_status: number
  score_home: number | null
  score_away: number | null
  is_prediction_open: boolean | null
  prediction_count: number | null
  home_team: {
    id: string
    name: string
    name_ko: string | null
    logo_url: string | null
  } | null
  away_team: {
    id: string
    name: string
    name_ko: string | null
    logo_url: string | null
  } | null
  league: {
    id: string
    name: string
    name_ko: string | null
    sport_type: string
    country_code: string | null
  } | null
  match_odds: {
    full_time_result: any
    goals_over_under: any
    both_teams_to_score: any
  }[]
}

// Fetch matches with all related data
async function fetchMatchesWithOdds(): Promise<MatchWithDetails[]> {
  const supabase = createServerAnonClient()

  const { data: matches, error } = await supabase
    .from("matches")
    .select(`
      id,
      match_time,
      sport_type,
      time_status,
      score_home,
      score_away,
      is_prediction_open,
      prediction_count,
      home_team:teams!matches_home_team_id_fkey(id, name, name_ko, logo_url),
      away_team:teams!matches_away_team_id_fkey(id, name, name_ko, logo_url),
      league:leagues!matches_league_id_fkey(id, name, name_ko, sport_type, country_code),
      match_odds(full_time_result, goals_over_under, both_teams_to_score)
    `)
    .in("time_status", [0, 1]) // 0: Not started, 1: In progress
    .order("match_time", { ascending: true })

  if (error) {
    console.error("Failed to fetch matches:", error)
    return []
  }

  // Transform raw data to expected format (arrays to single objects)
  const transformed: MatchWithDetails[] = ((matches as RawMatchData[]) || []).map((match) => ({
    ...match,
    home_team: match.home_team?.[0] || null,
    away_team: match.away_team?.[0] || null,
    league: match.league?.[0] || null,
  }))

  return transformed
}

// Fetch user's predictions
async function fetchUserPredictions(userId: string) {
  const supabase = createServerAnonClient()

  const { data: predictions, error } = await supabase
    .from("predictions")
    .select(`
      id,
      match_id,
      prediction_type,
      predicted_value,
      odds_at_prediction,
      points_earned,
      is_correct,
      created_at
    `)
    .eq("user_id", userId)
    .is("is_correct", null) // Only pending predictions

  if (error) {
    console.error("Failed to fetch user predictions:", error)
    return []
  }

  return predictions || []
}

// Fetch user stats
async function fetchUserStats(userId: string) {
  const supabase = createServerAnonClient()

  const { data: stats, error } = await supabase
    .from("user_prediction_stats")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (error && error.code !== "PGRST116") {
    console.error("Failed to fetch user stats:", error)
    return null
  }

  return stats
}

// Fetch rankings
async function fetchRankings() {
  const supabase = createServerAnonClient()

  const { data: rankings, error } = await supabase
    .from("user_prediction_stats")
    .select(`
      user_id,
      total_predictions,
      correct_predictions,
      accuracy,
      total_points,
      profit,
      roi,
      current_streak,
      longest_streak,
      level,
      badges,
      profiles!inner(nickname, avatar_url)
    `)
    .gte('total_predictions', 1) // Only users with at least 1 prediction
    .order("profit", { ascending: false }) // Sort by profit by default
    .limit(10)

  if (error) {
    console.error("Failed to fetch rankings:", error)
    return []
  }

  // Transform to match Ranking interface (with profile info)
  return (rankings || []).map((item: any) => ({
    user_id: item.user_id,
    total_predictions: item.total_predictions || 0,
    correct_predictions: item.correct_predictions || 0,
    accuracy: item.accuracy || 0,
    total_points: item.total_points || 0,
    profit: item.profit || 0,
    roi: item.roi || 0,
    current_streak: item.current_streak || 0,
    longest_streak: item.longest_streak || 0,
    level: item.level || 1,
    badges: item.badges || [],
    nickname: item.profiles?.nickname || '익명',
    avatar_url: item.profiles?.avatar_url || null,
  }))
}

export default async function PredictionPage() {
  const { userId } = await auth()

  // Fetch all data in parallel
  const [matches, userPredictions, userStats, rankings] = await Promise.all([
    fetchMatchesWithOdds(),
    userId ? fetchUserPredictions(userId) : Promise.resolve([]),
    userId ? fetchUserStats(userId) : Promise.resolve(null),
    fetchRankings(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-5 max-w-[1280px]">
        <PredictionContent
          matches={matches}
          userPredictions={userPredictions}
          userStats={userStats}
          rankings={rankings}
          isLoggedIn={!!userId}
        />
      </main>
    </div>
  )
}
